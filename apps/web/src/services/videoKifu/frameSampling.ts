import type {
  ChampionsRoiLayout,
  HpBarColorZone,
  HpBarMeasurement,
  NormalizedRect,
  VideoFrameAnalysis,
  VideoScreenPhase,
} from "./types";
import { DEFAULT_CHAMPIONS_ROI_LAYOUT, toPixelBounds } from "./roiLayout";
import { matchDigit4InTimerBox, readHudHpValue } from "./digitRecognition";

export const sampleRgba = (
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  normX: number,
  normY: number,
): [number, number, number] => {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return [0, 0, 0];
  }
  const x = Math.min(width - 1, Math.max(0, Math.floor(normX * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(normY * height)));
  const idx = (y * width + x) * 4;
  return [rgba[idx] ?? 0, rgba[idx + 1] ?? 0, rgba[idx + 2] ?? 0];
};

export const isP1BlueHeader = (r: number, g: number, b: number): boolean =>
  b >= 190 && b > r + 40 && b > g + 50 && r >= 80 && g >= 75;

export const isP2MagentaHeader = (r: number, g: number, b: number): boolean =>
  r >= 165 && g <= 95 && b >= 90 && b <= 180 && r > g + 80;

export const isLimeHighlight = (r: number, g: number, b: number): boolean =>
  g >= 225 && r >= 135 && b <= 105;

export const measureHpBar = (
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  _rect: NormalizedRect,
  hudVisible: boolean,
  slotIdx?: 0 | 1 | 2 | 3,
): HpBarMeasurement => {
  if (width <= 0 || height <= 0 || !hudVisible || slotIdx === undefined) {
    return { visible: false, percent: 0, colorZone: "Hidden", exactHp: null };
  }
  // バーのドット幅解析は行わず、HUD の数値テキスト（実数値または%）を直接読み取る
  const hudVal = readHudHpValue(rgba, width, height, slotIdx);
  if (hudVal === null) {
    return { visible: false, percent: 0, colorZone: "Hidden", exactHp: null };
  }
  const percent = Math.max(0, Math.min(100, hudVal));
  const colorZone: HpBarColorZone =
    percent > 50 ? "Green" : percent > 20 ? "Yellow" : percent > 0 ? "Red" : "Empty";

  return { visible: true, percent, colorZone, exactHp: hudVal };
};

export const computeRoiLumaHash = (
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rect: NormalizedRect,
): number => {
  const [x0, y0, x1, y1] = toPixelBounds(rect, width, height);
  if (x1 <= x0 || y1 <= y0) return 0;
  let hash = 0x811c9dc5;

  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 4) {
      const idx = (Math.min(height - 1, y) * width + Math.min(width - 1, x)) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
      const isWhite = r > 135 && g > 135 && b > 135 && maxDiff <= 50;
      if (isWhite) {
        const pos = (x - x0) ^ ((y - y0) << 8);
        hash ^= pos;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    }
  }
  return hash >>> 0;
};

export function isHeaderBandVisible(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  hudRect: NormalizedRect,
  side: "p1" | "p2",
): boolean {
  const [x0, y0, x1, y1] = toPixelBounds(hudRect, width, height);
  if (x1 <= x0 || y1 <= y0) return false;

  const bandY0 = y0;
  const bandY1 = Math.min(y1, y0 + Math.max(2, Math.round((y1 - y0) * 0.3)));
  const bandW = x1 - x0;

  let matchVotes = 0;
  let totalSamples = 0;

  const numX = 12;
  const numY = 3;

  for (let yi = 0; yi < numY; yi++) {
    const y = Math.min(height - 1, Math.floor(bandY0 + ((yi + 0.5) * (bandY1 - bandY0)) / numY));
    for (let xi = 0; xi < numX; xi++) {
      const x = Math.min(width - 1, Math.floor(x0 + ((xi + 0.5) * bandW) / numX));
      const idx = (y * width + x) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;

      const matched = side === "p1" ? isP1BlueHeader(r, g, b) : isP2MagentaHeader(r, g, b);
      if (matched) {
        matchVotes += 1;
      }
      totalSamples += 1;
    }
  }

  return totalSamples > 0 && matchVotes / totalSamples >= 0.12;
}

/**
 * RGBA フレームバッファ (`width * height * 4` bytes) を解析し、画面フェーズと各スロットの HP% を返す。
 * Rust Engine (`packages/engine/src/kifu/video_analyzer.rs`) と完全同一の正規化座標・閾値ロジック。
 */
export function analyzeVideoFrameRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  timestampMs: number,
  roi: ChampionsRoiLayout = DEFAULT_CHAMPIONS_ROI_LAYOUT,
): VideoFrameAnalysis {
  const [p1aR, p1aG, p1aB] = sampleRgba(rgba, width, height, 250 / 1920, 940 / 1080);
  const [p1bR, p1bG, p1bB] = sampleRgba(rgba, width, height, 650 / 1920, 940 / 1080);
  const [p2aR, p2aG, p2aB] = sampleRgba(rgba, width, height, 1300 / 1920, 56 / 1080);
  const [p2bR, p2bG, p2bB] = sampleRgba(rgba, width, height, 1700 / 1920, 56 / 1080);

  const p1aHeader =
    isP1BlueHeader(p1aR, p1aG, p1aB) ||
    isHeaderBandVisible(rgba, width, height, roi.battleHuds[0], "p1");
  const p1bHeader =
    isP1BlueHeader(p1bR, p1bG, p1bB) ||
    isHeaderBandVisible(rgba, width, height, roi.battleHuds[1], "p1");
  const p2aHeader =
    isP2MagentaHeader(p2aR, p2aG, p2aB) ||
    isHeaderBandVisible(rgba, width, height, roi.battleHuds[2], "p2");
  const p2bHeader =
    isP2MagentaHeader(p2bR, p2bG, p2bB) ||
    isHeaderBandVisible(rgba, width, height, roi.battleHuds[3], "p2");

  const hpBars: [HpBarMeasurement, HpBarMeasurement, HpBarMeasurement, HpBarMeasurement] = [
    measureHpBar(rgba, width, height, roi.hpBars[0], p1aHeader, 0),
    measureHpBar(rgba, width, height, roi.hpBars[1], p1bHeader, 1),
    measureHpBar(rgba, width, height, roi.hpBars[2], p2aHeader, 2),
    measureHpBar(rgba, width, height, roi.hpBars[3], p2bHeader, 3),
  ];

  let previewP1Cards = 0;
  let previewP2Cards = 0;
  const previewSelectedP1Indices: number[] = [];

  for (let i = 0; i < 6; i++) {
    const ySample = (200 + i * 126) / 1080;
    const yPrepSample = (219 + i * 126) / 1080;
    const [lr, lg, lb] = sampleRgba(rgba, width, height, 200 / 1920, ySample);
    const [lpr, lpg, lpb] = sampleRgba(rgba, width, height, 430 / 1920, yPrepSample);
    const [rr, rg, rb] = sampleRgba(rgba, width, height, 1700 / 1920, ySample);
    const [rpr, rpg, rpb] = sampleRgba(rgba, width, height, 1470 / 1920, yPrepSample);
    if (
      isP1BlueHeader(lr, lg, lb) ||
      isLimeHighlight(lr, lg, lb) ||
      isP1BlueHeader(lpr, lpg, lpb) ||
      isLimeHighlight(lpr, lpg, lpb)
    ) {
      previewP1Cards += 1;
      const [tabR, tabG, tabB] = sampleRgba(rgba, width, height, 96 / 1920, ySample);
      if ((tabR > 215 && tabG > 215 && tabB > 215) || isLimeHighlight(lr, lg, lb)) {
        previewSelectedP1Indices.push(i);
      }
    }
    if (
      (rr >= 65 && rg <= 40 && rb >= 25 && rr > rg + 40) ||
      (rpr >= 65 && rpg <= 40 && rpb >= 25 && rpr > rpg + 40)
    ) {
      previewP2Cards += 1;
    }
  }

  const [p1aBorderR, p1aBorderG, p1aBorderB] = sampleRgba(
    rgba,
    width,
    height,
    165 / 1920,
    1004 / 1080,
  );
  const [p1bBorderR, p1bBorderG, p1bBorderB] = sampleRgba(
    rgba,
    width,
    height,
    561 / 1920,
    1004 / 1080,
  );
  const countActiveHudLime = (xStart1080: number, xEnd1080: number): number => {
    let c = 0;
    for (const y1080 of [918, 920, 922, 984, 986, 988]) {
      for (let x1080 = xStart1080; x1080 <= xEnd1080; x1080 += 12) {
        const [r, g, b] = sampleRgba(rgba, width, height, x1080 / 1920, y1080 / 1080);
        if (g >= 210 && r >= 120 && b <= 115) c += 1;
      }
    }
    return c;
  };
  const visibleHudCount = hpBars.filter((b) => b.visible).length;
  const p1aHudLime = hpBars[0].visible && visibleHudCount >= 2 ? countActiveHudLime(175, 515) : 0;
  const p1bHudLime = hpBars[1].visible && visibleHudCount >= 2 ? countActiveHudLime(570, 910) : 0;
  const activeP1Slot: 0 | 1 | null =
    hpBars[0].visible && visibleHudCount >= 2 && isLimeHighlight(p1aBorderR, p1aBorderG, p1aBorderB)
      ? 0
      : hpBars[1].visible &&
          visibleHudCount >= 2 &&
          isLimeHighlight(p1bBorderR, p1bBorderG, p1bBorderB)
        ? 1
        : p1aHudLime >= 15 && p1aHudLime > p1bHudLime + 8
          ? 0
          : p1bHudLime >= 15 && p1bHudLime > p1aHudLime + 8
            ? 1
            : null;

  const isSoftLime = (r: number, g: number, b: number): boolean => g >= 210 && r >= 120 && b <= 115;

  let battleBtnLime = 0;
  for (let x1080 = 1480; x1080 <= 1760; x1080 += 20) {
    const [r1, g1, b1] = sampleRgba(rgba, width, height, x1080 / 1920, 652 / 1080);
    const [r2, g2, b2] = sampleRgba(rgba, width, height, x1080 / 1920, 715 / 1080);
    if (isSoftLime(r1, g1, b1) && isSoftLime(r2, g2, b2)) battleBtnLime += 1;
  }
  const isCommandMenu = battleBtnLime >= 6;

  let selectedMoveIndex: 0 | 1 | 2 | 3 | null = null;
  if (activeP1Slot !== null) {
    for (const mIdx of [0, 1, 2, 3] as const) {
      const yMove = (555 + mIdx * 110) / 1080;
      const [mr, mg, mb] = sampleRgba(rgba, width, height, 1368 / 1920, yMove);
      if (isLimeHighlight(mr, mg, mb)) {
        selectedMoveIndex = mIdx;
        break;
      }
    }
    if (selectedMoveIndex === null && !isCommandMenu) {
      for (const mIdx of [0, 1, 2, 3] as const) {
        const yTop = 544 + mIdx * 130;
        const yMid = 590 + mIdx * 130;
        let topLime = 0;
        let rightLime = 0;
        for (let x1080 = 1420; x1080 <= 1840; x1080 += 20) {
          const [r1, g1, b1] = sampleRgba(rgba, width, height, x1080 / 1920, yTop / 1080);
          const [r2, g2, b2] = sampleRgba(rgba, width, height, x1080 / 1920, (yTop + 4) / 1080);
          if (isSoftLime(r1, g1, b1) || isSoftLime(r2, g2, b2)) topLime += 1;
        }
        for (let y1080 = yMid - 25; y1080 <= yMid + 25; y1080 += 10) {
          const [r1, g1, b1] = sampleRgba(rgba, width, height, 1876 / 1920, y1080 / 1080);
          const [r2, g2, b2] = sampleRgba(rgba, width, height, 1868 / 1920, y1080 / 1080);
          if (isSoftLime(r1, g1, b1) || isSoftLime(r2, g2, b2)) rightLime += 1;
        }
        if (topLime >= 8 && rightLime >= 3) {
          selectedMoveIndex = mIdx;
          break;
        }
      }
    }
  }

  let selectedTargetSlot: "p2a" | "p2b" | "p1a" | "p1b" | null = null;
  if (activeP1Slot !== null && !isCommandMenu && selectedMoveIndex === null) {
    let bestTarget: "p2a" | "p2b" | "p1a" | "p1b" | null = null;
    let bestTargetCount = 0;
    const targetCenters: readonly ["p2a" | "p2b" | "p1a" | "p1b", number, number][] = [
      ["p2a", 650, 420],
      ["p2b", 1020, 420],
      ["p1a", 650, 560],
      ["p1b", 1020, 560],
    ];
    for (const [slotName, cx, cy] of targetCenters) {
      let limePixels = 0;
      for (let y1080 = cy - 55; y1080 <= cy + 55; y1080 += 6) {
        for (let x1080 = cx - 150; x1080 <= cx + 150; x1080 += 8) {
          const [r, g, b] = sampleRgba(rgba, width, height, x1080 / 1920, y1080 / 1080);
          if (isSoftLime(r, g, b)) limePixels += 1;
        }
      }
      if (limePixels >= 80 && limePixels > bestTargetCount) {
        bestTargetCount = limePixels;
        bestTarget = slotName;
      }
    }
    selectedTargetSlot = bestTarget;
  }

  const [timerX0, timerY0, timerX1, timerY1] = toPixelBounds(roi.commandTimerBox, width, height);
  const timerBoxH = timerY1 - timerY0;

  let darkTimerPixels = 0;
  let transitions = 0;
  let prevIsWhite = false;
  const midY = Math.round(timerY0 + timerBoxH * 0.46);

  if (midY >= 0 && midY < height) {
    for (let x = timerX0; x < timerX1; x++) {
      const idx = (midY * width + x) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      const isWhite = r > 160 && g > 160 && b > 160 && Math.abs(r - g) < 30 && Math.abs(r - b) < 30;
      if (isWhite !== prevIsWhite) {
        transitions += 1;
        prevIsWhite = isWhite;
      }
      if (r < 90 && g < 100 && b < 120) {
        darkTimerPixels += 1;
      }
    }
  }

  for (let y = timerY0; y < timerY1; y += 2) {
    for (let x = timerX0; x < timerX1; x += 4) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      if (r < 90 && g < 100 && b < 120) {
        darkTimerPixels += 1;
      }
    }
  }

  const commandTimerVisible = transitions >= 14 && darkTimerPixels >= 60;
  const isMoveTime45 =
    commandTimerVisible &&
    matchDigit4InTimerBox(rgba, width, height, [timerX0, timerY0, timerX1, timerY1]);

  const isSelectingUi =
    commandTimerVisible || isCommandMenu || activeP1Slot !== null || selectedMoveIndex !== null;

  const [msgX0, msgY0, msgX1, msgY1] = toPixelBounds(roi.messageBox, width, height);
  let whiteMsgPixels = 0;
  if (!isSelectingUi) {
    for (let y = msgY0; y < msgY1; y += 2) {
      for (let x = msgX0; x < msgX1; x += 4) {
        const idx = (y * width + x) * 4;
        const r = rgba[idx] ?? 0;
        const g = rgba[idx + 1] ?? 0;
        const b = rgba[idx + 2] ?? 0;
        const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
        if (r > 135 && g > 135 && b > 135 && maxDiff <= 45) {
          whiteMsgPixels += 1;
        }
      }
    }
  }
  const messageBoxVisible = !isSelectingUi && whiteMsgPixels >= 6;
  const messageRoiHash = messageBoxVisible
    ? computeRoiLumaHash(rgba, width, height, roi.messageBox)
    : 0;

  const hasBannerText = (rect: NormalizedRect): boolean => {
    const [bx0, by0, bx1, by1] = toPixelBounds(rect, width, height);
    if (bx1 <= bx0 || by1 <= by0) return false;
    let white = 0;
    let dark = 0;
    let totalSamples = 0;
    for (let y = by0; y < by1; y += 2) {
      for (let x = bx0; x < bx1; x += 4) {
        totalSamples += 1;
        const idx = (y * width + x) * 4;
        const r = rgba[idx] ?? 0;
        const g = rgba[idx + 1] ?? 0;
        const b = rgba[idx + 2] ?? 0;
        const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
        if (r > 165 && g > 165 && b > 165 && maxDiff <= 50) {
          white += 1;
        } else if (r < 90 && g < 105 && b < 110) {
          dark += 1;
        }
      }
    }
    if (totalSamples < 30) return false;
    const whiteRatio = white / totalSamples;
    const darkRatio = dark / totalSamples;
    return whiteRatio >= 0.03 && whiteRatio <= 0.35 && darkRatio >= 0.25;
  };

  const canShowBanner = !isSelectingUi && previewP1Cards < 4 && previewP2Cards < 4;
  const [ab1R, ab1G, ab1B] = sampleRgba(rgba, width, height, 200 / 1920, 395 / 1080);
  const p1AbilityBannerVisible =
    canShowBanner &&
    (isP1BlueHeader(ab1R, ab1G, ab1B) ||
      (ab1B > 140 && ab1B > ab1R + 30 && ab1R < 120) ||
      hasBannerText(roi.p1AbilityBanner));

  const [ab2R, ab2G, ab2B] = sampleRgba(rgba, width, height, 1720 / 1920, 395 / 1080);
  const p2AbilityBannerVisible =
    canShowBanner && (isP2MagentaHeader(ab2R, ab2G, ab2B) || hasBannerText(roi.p2AbilityBanner));

  const abilityRoiHash = p1AbilityBannerVisible
    ? computeRoiLumaHash(rgba, width, height, roi.p1AbilityBanner)
    : p2AbilityBannerVisible
      ? computeRoiLumaHash(rgba, width, height, roi.p2AbilityBanner)
      : 0;

  const targetSelectionRoiHash = computeRoiLumaHash(rgba, width, height, roi.targetSelectionPanel);

  let phase: VideoScreenPhase = "Unknown";
  if (previewP1Cards >= 4 && previewP2Cards >= 4) {
    phase = "TeamPreview";
  } else if (isSelectingUi) {
    phase = activeP1Slot !== null || selectedMoveIndex !== null ? "MoveSelect" : "CommandSelect";
  } else if (
    messageBoxVisible ||
    p1AbilityBannerVisible ||
    p2AbilityBannerVisible ||
    visibleHudCount === 1
  ) {
    phase = "BattleAnimation";
  }

  return {
    timestampMs,
    phase,
    hpBars,
    activeP1Slot,
    selectedMoveIndex,
    selectedTargetSlot,
    previewSelectedP1Indices,
    messageBoxVisible,
    commandTimerVisible,
    isMoveTime45,
    p1AbilityBannerVisible,
    p2AbilityBannerVisible,
    messageRoiHash,
    abilityRoiHash,
    targetSelectionRoiHash,
  };
}
