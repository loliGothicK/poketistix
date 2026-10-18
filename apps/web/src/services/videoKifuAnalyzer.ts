import * as Sentry from "@sentry/nextjs";
import { withSpan } from "@/lib/otel";
import { createWorker, type Worker as TesseractWorker } from "tesseract.js";
import { championsPokemonByIdentifier, championsPokemonList } from "@/data/champions-pokemon";
import { MoveList, moveById } from "@/data/moves";
import { abilityById, abilityList } from "@/data/abilities";
import { itemById, itemList } from "@/data/items";
import { natureObjectToString } from "@/data/nature";
import { calcHp, calcStatus } from "@/data/utility/training";
import type { TrainedPokemon } from "@/store/team/team";
import type { BattleResult, OpponentSelectionRole } from "@/store/battle-record/battleRecord";
import {
  emptyDraft,
  nextOpponentKey,
  type BattleRecordDraft,
  type OpponentDraft,
} from "@/components/client/battle-record/formState";
import { selectionFromIndices } from "@/components/client/battle-record/selection";
import { BattleLogParser } from "./battleLogParser";
import {
  charLevenshtein,
  fuzzyMatchEntity,
  normalizeOcrToken,
  type LocalizedEntityAlias,
} from "./ocrText";

/** 『Pokémon Champions』 (1920x1080 基準) の正規化 ROI 矩形 `[0.0, 1.0]` */
export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const from1080p = (x: number, y: number, width: number, height: number): NormalizedRect => ({
  x: x / 1920,
  y: y / 1080,
  width: width / 1920,
  height: height / 1080,
});

/** 実機キャプチャ (`1920x1080`) からキャリブレーションした標準 ROI レイアウト */
export interface ChampionsRoiLayout {
  readonly p1PreviewCards: readonly [
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
  ];
  readonly p2PreviewCards: readonly [
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
  ];
  readonly battleHuds: readonly [NormalizedRect, NormalizedRect, NormalizedRect, NormalizedRect];
  readonly hpBars: readonly [NormalizedRect, NormalizedRect, NormalizedRect, NormalizedRect];
  readonly p1HpNumbers: readonly [NormalizedRect, NormalizedRect];
  readonly messageBox: NormalizedRect;
  readonly p1AbilityBanner: NormalizedRect;
  readonly p2AbilityBanner: NormalizedRect;
  readonly weatherFieldBadge: NormalizedRect;
  readonly moveMenuSlots: readonly [NormalizedRect, NormalizedRect, NormalizedRect, NormalizedRect];
  readonly communicatingBox: NormalizedRect;
  readonly commandTimerBox: NormalizedRect;
}

export const DEFAULT_CHAMPIONS_ROI_LAYOUT: ChampionsRoiLayout = {
  p1PreviewCards: [
    from1080p(80, 156, 525, 112),
    from1080p(80, 282, 525, 112),
    from1080p(80, 408, 525, 112),
    from1080p(80, 534, 525, 112),
    from1080p(80, 660, 525, 112),
    from1080p(80, 786, 525, 112),
  ],
  p2PreviewCards: [
    from1080p(1555, 156, 300, 112),
    from1080p(1555, 282, 300, 112),
    from1080p(1555, 408, 300, 112),
    from1080p(1555, 534, 300, 112),
    from1080p(1555, 660, 300, 112),
    from1080p(1555, 786, 300, 112),
  ],
  battleHuds: [
    from1080p(165, 928, 370, 120),
    from1080p(561, 928, 370, 120),
    from1080p(1208, 42, 370, 100),
    from1080p(1604, 42, 310, 100),
  ],
  hpBars: [
    from1080p(181, 1002, 224, 6),
    from1080p(577, 1002, 224, 6),
    from1080p(1225, 118, 224, 6),
    from1080p(1621, 118, 224, 6),
  ],
  p1HpNumbers: [from1080p(260, 968, 155, 36), from1080p(656, 968, 155, 36)],
  messageBox: from1080p(120, 785, 1400, 80),
  p1AbilityBanner: from1080p(145, 385, 265, 115),
  p2AbilityBanner: from1080p(1510, 385, 265, 115),
  weatherFieldBadge: from1080p(320, 45, 540, 50),
  moveMenuSlots: [
    from1080p(1365, 510, 515, 95),
    from1080p(1365, 620, 515, 95),
    from1080p(1365, 730, 515, 95),
    from1080p(1365, 840, 515, 95),
  ],
  communicatingBox: from1080p(840, 275, 240, 45),
  commandTimerBox: from1080p(1550, 295, 310, 60),
};

export type VideoScreenPhase =
  | "TeamPreview"
  | "VsSplash"
  | "CommandSelect"
  | "MoveSelect"
  | "Communicating"
  | "BattleAnimation"
  | "ResultScreen"
  | "Unknown";

export type HpBarColorZone = "Green" | "Yellow" | "Red" | "Empty" | "Hidden";

export interface HpBarMeasurement {
  readonly visible: boolean;
  readonly percent: number;
  readonly colorZone: HpBarColorZone;
}

export interface VideoFrameAnalysis {
  readonly timestampMs: number;
  readonly phase: VideoScreenPhase;
  readonly hpBars: readonly [
    HpBarMeasurement,
    HpBarMeasurement,
    HpBarMeasurement,
    HpBarMeasurement,
  ];
  readonly activeP1Slot: 0 | 1 | null;
  readonly selectedMoveIndex: 0 | 1 | 2 | 3 | null;
  readonly previewSelectedP1Indices: readonly number[];
  readonly messageBoxVisible: boolean;
  readonly commandTimerVisible: boolean;
  readonly isMoveTime45: boolean;
  readonly p1AbilityBannerVisible: boolean;
  readonly p2AbilityBannerVisible: boolean;
  readonly messageRoiHash: number;
  readonly abilityRoiHash: number;
}

export type { LocalizedEntityAlias };

export interface ChampionsEntityDictionaries {
  readonly species: readonly LocalizedEntityAlias[];
  readonly moves: readonly LocalizedEntityAlias[];
  readonly abilities: readonly LocalizedEntityAlias[];
  readonly items: readonly LocalizedEntityAlias[];
}

export interface VideoReviewEventItem {
  readonly id: string;
  readonly turnNumber: number | null;
  readonly lineText: string;
  readonly timestampMs: number | null;
  readonly needsReview: boolean;
}

export interface VideoAnalysisProgress {
  readonly currentTimeSec: number;
  readonly durationSec: number;
  readonly sampledFrames: number;
  readonly detectedTurns: number;
  readonly currentPhase: VideoScreenPhase;
}

export interface VideoKifuAnalysisSummary {
  readonly pbnText: string;
  readonly result: BattleResult;
  readonly detectedRating: number | null;
  readonly p1Selection: readonly number[];
  readonly opponentSlugs: readonly string[];
  readonly opponentLeadSlugs: readonly string[];
  readonly opponentBackSlugs: readonly string[];
  readonly revealedMovesByOpponent: Readonly<Record<string, readonly string[]>>;
  readonly revealedAbilityByOpponent: Readonly<Record<string, string>>;
  readonly reviewEvents: readonly VideoReviewEventItem[];
  readonly turnTimestamps: Readonly<Record<number, number>>;
  readonly totalSampledFrames: number;
  readonly detectedTurnCount: number;
}

export type RoiOcrHint = "species" | "move" | "ability" | "message" | "hp" | "result";

export type RoiOcrProvider = (
  croppedCanvas: HTMLCanvasElement,
  hint: RoiOcrHint,
) => Promise<string | null>;

const toPixelBounds = (
  rect: NormalizedRect,
  frameWidth: number,
  frameHeight: number,
): [number, number, number, number] => {
  const x0 = Math.min(frameWidth, Math.max(0, Math.round(rect.x * frameWidth)));
  const y0 = Math.min(frameHeight, Math.max(0, Math.round(rect.y * frameHeight)));
  const x1 = Math.min(frameWidth, Math.max(x0, Math.round((rect.x + rect.width) * frameWidth)));
  const y1 = Math.min(frameHeight, Math.max(y0, Math.round((rect.y + rect.height) * frameHeight)));
  return [x0, y0, x1, y1];
};

const sampleRgba = (
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

const isP1BlueHeader = (r: number, g: number, b: number): boolean =>
  b >= 190 && b > r + 40 && b > g + 50 && r >= 80 && g >= 75;

const isP2MagentaHeader = (r: number, g: number, b: number): boolean =>
  r >= 165 && g <= 95 && b >= 90 && b <= 180 && r > g + 80;

const isLimeHighlight = (r: number, g: number, b: number): boolean =>
  g >= 225 && r >= 135 && b <= 105;

const measureHpBar = (
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rect: NormalizedRect,
  hudVisible: boolean,
): HpBarMeasurement => {
  if (width <= 0 || height <= 0) {
    return { visible: false, percent: 0, colorZone: "Hidden" };
  }
  const [x0, y0, x1, y1] = toPixelBounds(rect, width, height);
  if (x1 <= x0) {
    return { visible: false, percent: 0, colorZone: "Hidden" };
  }
  const totalCols = x1 - x0;
  let bestLitCols = 0;
  let bestDarkTrackCols = 0;
  let bestGreenVotes = 0;
  let bestYellowVotes = 0;
  let bestRedVotes = 0;

  // 1本の走査線だけでなく、バーの高さ内の複数ラインから最良のサンプリング結果を採用
  const yStart = Math.min(height - 1, y0 + 1);
  const yEnd = Math.max(yStart, Math.min(height - 1, y1 - 1));

  for (let y = yStart; y <= yEnd; y++) {
    let lit = 0;
    let green = 0;
    let yellow = 0;
    let red = 0;
    let dark = 0;

    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;

      const isGreen = g >= 170 && g > r + 35 && b < 135;
      const isYellow = r >= 170 && g >= 130 && b < 105 && !isGreen;
      const isRed = r >= 150 && g < 95 && b < 95;

      if (isGreen || isYellow || isRed) {
        lit += 1;
        if (isGreen) green += 1;
        else if (isYellow) yellow += 1;
        else red += 1;
      } else if (r < 80 && g < 80 && b < 95) {
        dark += 1;
      }
    }

    if (lit > bestLitCols || (lit === 0 && dark > bestDarkTrackCols)) {
      bestLitCols = lit;
      bestDarkTrackCols = dark;
      bestGreenVotes = green;
      bestYellowVotes = yellow;
      bestRedVotes = red;
    }
  }

  const hasHpBarStructure = bestLitCols + bestDarkTrackCols >= Math.floor(totalCols * 0.45);
  if (!hasHpBarStructure) {
    return { visible: false, percent: 0, colorZone: "Hidden" };
  }
  // ヘッダーが見えない、または点灯ドットが0の場合はHUD非表示（技カットイン、交代演出、暗転、メニュー等）
  if (!hudVisible || bestLitCols === 0) {
    return { visible: false, percent: 0, colorZone: "Hidden" };
  }

  const rawPct = Math.round((bestLitCols / totalCols) * 100);
  const percent = bestLitCols > 0 && rawPct === 0 ? 1 : Math.min(100, rawPct);
  const colorZone: HpBarColorZone =
    bestLitCols === 0
      ? "Empty"
      : bestGreenVotes >= bestYellowVotes && bestGreenVotes >= bestRedVotes
        ? "Green"
        : bestYellowVotes >= bestRedVotes
          ? "Yellow"
          : "Red";

  return { visible: true, percent, colorZone };
};

const computeRoiLumaHash = (
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
      const isWhite = r > 130 && g > 130 && b > 130 && Math.abs(r - g) < 35 && Math.abs(r - b) < 35;
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
    measureHpBar(rgba, width, height, roi.hpBars[0], p1aHeader),
    measureHpBar(rgba, width, height, roi.hpBars[1], p1bHeader),
    measureHpBar(rgba, width, height, roi.hpBars[2], p2aHeader),
    measureHpBar(rgba, width, height, roi.hpBars[3], p2bHeader),
  ];

  let previewP1Cards = 0;
  let previewP2Cards = 0;
  const previewSelectedP1Indices: number[] = [];

  for (let i = 0; i < 6; i++) {
    const ySample = (200 + i * 126) / 1080;
    const [lr, lg, lb] = sampleRgba(rgba, width, height, 200 / 1920, ySample);
    const [rr, rg, rb] = sampleRgba(rgba, width, height, 1700 / 1920, ySample);
    if (isP1BlueHeader(lr, lg, lb) || isLimeHighlight(lr, lg, lb)) {
      previewP1Cards += 1;
      const [tabR, tabG, tabB] = sampleRgba(rgba, width, height, 96 / 1920, ySample);
      if ((tabR > 215 && tabG > 215 && tabB > 215) || isLimeHighlight(lr, lg, lb)) {
        previewSelectedP1Indices.push(i);
      }
    }
    if (rr >= 65 && rg <= 40 && rb >= 25 && rr > rg + 40) {
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
  const activeP1Slot: 0 | 1 | null = isLimeHighlight(p1aBorderR, p1aBorderG, p1aBorderB)
    ? 0
    : isLimeHighlight(p1bBorderR, p1bBorderG, p1bBorderB)
      ? 1
      : null;

  let selectedMoveIndex: 0 | 1 | 2 | 3 | null = null;
  for (const mIdx of [0, 1, 2, 3] as const) {
    const yMove = (555 + mIdx * 110) / 1080;
    const [mr, mg, mb] = sampleRgba(rgba, width, height, 1368 / 1920, yMove);
    if (isLimeHighlight(mr, mg, mb)) {
      selectedMoveIndex = mIdx;
      break;
    }
  }

  const [msgX0, msgY0, msgX1, msgY1] = toPixelBounds(roi.messageBox, width, height);
  let whiteMsgPixels = 0;
  for (let y = msgY0; y < msgY1; y += 2) {
    for (let x = msgX0; x < msgX1; x += 4) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      if (r > 135 && g > 135 && b > 135 && Math.abs(r - g) < 30 && Math.abs(r - b) < 30) {
        whiteMsgPixels += 1;
      }
    }
  }
  const messageBoxVisible = whiteMsgPixels >= 6;
  const messageRoiHash = messageBoxVisible
    ? computeRoiLumaHash(rgba, width, height, roi.messageBox)
    : 0;

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

  const commandTimerVisible = transitions >= 18 && darkTimerPixels >= 60;
  const isMoveTime45 =
    commandTimerVisible &&
    matchDigit4InTimerBox(rgba, width, height, [timerX0, timerY0, timerX1, timerY1]);

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
        if (r > 175 && g > 175 && b > 175 && Math.abs(r - g) < 25 && Math.abs(r - b) < 25) {
          white += 1;
        } else if (r < 80 && g < 90 && b < 100) {
          dark += 1;
        }
      }
    }
    if (totalSamples < 30) return false;
    const whiteRatio = white / totalSamples;
    const darkRatio = dark / totalSamples;
    return whiteRatio >= 0.03 && whiteRatio <= 0.35 && darkRatio >= 0.3;
  };

  const canShowBanner = !commandTimerVisible && previewP1Cards < 4 && previewP2Cards < 4;
  const [ab1R, ab1G, ab1B] = sampleRgba(rgba, width, height, 200 / 1920, 395 / 1080);
  const p1AbilityBannerVisible =
    isP1BlueHeader(ab1R, ab1G, ab1B) ||
    (ab1B > 140 && ab1B > ab1R + 30 && ab1R < 120) ||
    (canShowBanner && hasBannerText(roi.p1AbilityBanner));

  const [ab2R, ab2G, ab2B] = sampleRgba(rgba, width, height, 1720 / 1920, 395 / 1080);
  const p2AbilityBannerVisible =
    isP2MagentaHeader(ab2R, ab2G, ab2B) || (canShowBanner && hasBannerText(roi.p2AbilityBanner));

  const abilityRoiHash = p1AbilityBannerVisible
    ? computeRoiLumaHash(rgba, width, height, roi.p1AbilityBanner)
    : p2AbilityBannerVisible
      ? computeRoiLumaHash(rgba, width, height, roi.p2AbilityBanner)
      : 0;

  const visibleHudCount = hpBars.filter((b) => b.visible).length;

  let phase: VideoScreenPhase = "Unknown";
  if (previewP1Cards >= 4 && previewP2Cards >= 4) {
    phase = "TeamPreview";
  } else if (commandTimerVisible) {
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
    previewSelectedP1Indices,
    messageBoxVisible,
    commandTimerVisible,
    isMoveTime45,
    p1AbilityBannerVisible,
    p2AbilityBannerVisible,
    messageRoiHash,
    abilityRoiHash,
  };
}

export { charLevenshtein, fuzzyMatchEntity, normalizeOcrToken };

/**
 * i18n 翻訳関数（日・英両方）を用いて Champions 環境の全ポケモン・技・特性・持ち物のファジー検索辞書を構築する
 */
export function buildChampionsDictionaries(
  translateEn: (key: string) => string,
  translateJa: (key: string) => string,
): ChampionsEntityDictionaries {
  const species: LocalizedEntityAlias[] = [];
  for (const p of championsPokemonList) {
    const enName = translateEn(`pokemon.${p.identifier}.name`);
    const jaName = translateJa(`pokemon.${p.identifier}.name`);
    species.push({ slug: p.identifier, alias: p.identifier });
    if (enName && !enName.startsWith("pokemon.")) {
      species.push({ slug: p.identifier, alias: enName });
    }
    if (jaName && !jaName.startsWith("pokemon.")) {
      species.push({ slug: p.identifier, alias: jaName });
    }
  }

  const moves: LocalizedEntityAlias[] = [];
  for (const m of MoveList) {
    const enName = translateEn(`moves.${m.identifier}.name`);
    const jaName = translateJa(`moves.${m.identifier}.name`);
    moves.push({ slug: m.identifier, alias: m.identifier });
    if (enName && !enName.startsWith("moves.")) {
      moves.push({ slug: m.identifier, alias: enName });
    }
    if (jaName && !jaName.startsWith("moves.")) {
      moves.push({ slug: m.identifier, alias: jaName });
    }
  }

  const abilities: LocalizedEntityAlias[] = [];
  for (const a of abilityList) {
    const enName = translateEn(`abilities.${a.identifier}.name`);
    const jaName = translateJa(`abilities.${a.identifier}.name`);
    abilities.push({ slug: a.identifier, alias: a.identifier });
    if (enName && !enName.startsWith("abilities.")) {
      abilities.push({ slug: a.identifier, alias: enName });
    }
    if (jaName && !jaName.startsWith("abilities.")) {
      abilities.push({ slug: a.identifier, alias: jaName });
    }
  }

  const items: LocalizedEntityAlias[] = [];
  for (const it of itemList) {
    const enName = translateEn(`items.${it.identifier}.name`);
    const jaName = translateJa(`items.${it.identifier}.name`);
    items.push({ slug: it.identifier, alias: it.identifier });
    if (enName && !enName.startsWith("items.")) {
      items.push({ slug: it.identifier, alias: enName });
    }
    if (jaName && !jaName.startsWith("items.")) {
      items.push({ slug: it.identifier, alias: jaName });
    }
  }

  return { species, moves, abilities, items };
}

/** TrainedPokemon の性格および配分スプレッド（例: "Jolly A32 S32+"）を生成する */
export function formatChampionsSpread(member: TrainedPokemon): string {
  let natStr = "Serious";
  let plus: "hp" | "atk" | "def" | "spa" | "spd" | "spe" | null = null;
  let minus: "hp" | "atk" | "def" | "spa" | "spd" | "spe" | null = null;

  if (typeof (member as unknown as { nature?: unknown }).nature === "string") {
    natStr = (member as unknown as { nature: string }).nature;
  } else if (member.nature) {
    plus = member.nature.plus ?? null;
    minus = member.nature.minus ?? null;
    natStr =
      !plus && !minus
        ? "Serious"
        : plus === minus
          ? "Serious"
          : (natureObjectToString({ plus, minus }) ?? "Serious");
  }

  const statLabels: readonly [keyof TrainedPokemon["evs"], string][] = [
    ["hp", "H"],
    ["atk", "A"],
    ["def", "B"],
    ["spa", "C"],
    ["spd", "D"],
    ["spe", "S"],
  ];

  const parts: string[] = [natStr];
  for (const [key, label] of statLabels) {
    const val = member.evs[key] ?? 0;
    if (val > 0) {
      let suffix = "";
      if (plus === key && minus !== key) suffix = "+";
      if (minus === key && plus !== key) suffix = "-";
      parts.push(`${label}${val}${suffix}`);
    }
  }

  return parts.join(" ");
}

/** TrainedPokemon の Lv.50 実数値 `[HP, Atk, Def, SpA, SpD, Spe]` を計算する */
export function calcTrainedPokemonStatsLv50(
  member: TrainedPokemon,
): readonly [number, number, number, number, number, number] {
  const meta = championsPokemonByIdentifier.get(member.identifier);
  const base = meta?.status ?? [80, 80, 80, 80, 80, 80];

  const getNatureMultiplier = (statKey: "atk" | "def" | "spa" | "spd" | "spe"): number => {
    if (member.nature.plus === statKey && member.nature.minus !== statKey) {
      return 1.1;
    }
    if (member.nature.minus === statKey && member.nature.plus !== statKey) {
      return 0.9;
    }
    return 1.0;
  };

  return [
    member.identifier === "shedinja" ? 1 : calcHp(base[0], member.evs.hp),
    calcStatus(base[1], member.evs.atk, getNatureMultiplier("atk")),
    calcStatus(base[2], member.evs.def, getNatureMultiplier("def")),
    calcStatus(base[3], member.evs.spa, getNatureMultiplier("spa")),
    calcStatus(base[4], member.evs.spd, getNatureMultiplier("spd")),
    calcStatus(base[5], member.evs.spe, getNatureMultiplier("spe")),
  ];
}

/**
 * PBN (Pokémon Battle Notation) テキストをパースし、タイムスタンプ付きイベント一覧と
 * 戦績フォーム自動入力用のメタデータ (`VideoKifuAnalysisSummary`) を抽出する。
 */
export function parsePbnToAnalysisSummary(pbnText: string): VideoKifuAnalysisSummary {
  return withSpan("ui.kifu.parse-pbn", (span) => {
    try {
      let result: BattleResult = "win";
      let detectedRating: number | null = null;
      let p1Selection: number[] = [0, 1, 2, 3];
      const opponentSlugs: string[] = [];
      const opponentLeadSlugs: string[] = [];
      const opponentBackSlugs: string[] = [];
      const revealedMovesByOpponent: Record<string, string[]> = {};
      const revealedAbilityByOpponent: Record<string, string> = {};
      const reviewEvents: VideoReviewEventItem[] = [];
      const activeOpponentBySlot: [string | null, string | null] = [null, null];

      let currentTurn: number | null = null;
      let currentTurnTimestampMs: number | null = null;
      const turnTimestamps: Record<number, number> = {};
      let detectedTurnCount = 0;
      let eventSeq = 0;

      for (const rawLine of pbnText.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith(";") || line.startsWith("#")) continue;

        if (line.startsWith("[Result ")) {
          const m = /\[Result\s+"([^"]+)"\]/i.exec(line);
          const val = m?.[1]?.toUpperCase();
          if (val === "LOSS") result = "loss";
          else if (val === "DRAW") result = "draw";
          else if (val === "WIN") result = "win";
          continue;
        }

        if (line.startsWith("[Rating ")) {
          const m = /\[Rating\s+"([0-9.]+)"\]/i.exec(line);
          if (m?.[1]) {
            const parsed = Number.parseFloat(m[1]);
            if (Number.isFinite(parsed)) detectedRating = parsed;
          }
          continue;
        }

        if (line.startsWith("@select ")) {
          const nums = line
            .slice("@select ".length)
            .split(",")
            .map((s) => Number.parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n) && n >= 0 && n < 6);
          if (nums.length > 0) {
            p1Selection = nums.slice(0, 4);
          }
          continue;
        }

        if (line.startsWith("@p2 ")) {
          const seg0 = line.slice("@p2 ".length).split("|")[0]?.trim() ?? "";
          const left = seg0.split("@")[0]?.trim() ?? "";
          const toks = left.split(/\s+/);
          const slug = (toks.length >= 2 ? toks[1] : toks[0])?.trim();
          if (slug && !opponentSlugs.includes(slug)) {
            opponentSlugs.push(slug);
          }
          continue;
        }

        if (line.startsWith("@lead")) {
          currentTurn = 0;
          const tsMatch = /@t=(\d+)ms/.exec(line);
          currentTurnTimestampMs = tsMatch?.[1] ? Number.parseInt(tsMatch[1], 10) : null;
          if (currentTurnTimestampMs !== null) {
            turnTimestamps[0] = currentTurnTimestampMs;
          }
          continue;
        }

        if (line.startsWith("@turn ")) {
          const m = /^@turn\s+(\d+)/.exec(line);
          currentTurn = m?.[1] ? Number.parseInt(m[1], 10) : detectedTurnCount + 1;
          detectedTurnCount += 1;
          const tsMatch = /@t=(\d+)ms/.exec(line);
          currentTurnTimestampMs = tsMatch?.[1] ? Number.parseInt(tsMatch[1], 10) : null;
          if (currentTurn !== null && currentTurnTimestampMs !== null) {
            turnTimestamps[currentTurn] = currentTurnTimestampMs;
          }
          continue;
        }

        if (line.startsWith("@cmd ") || line.startsWith("@p2cmd ") || line.startsWith("@field ")) {
          continue;
        }

        // イベント行 (`switch`, `move`, `damage`, `heal`, `ability`, `item`, `faint`, etc.)
        const needsReview = line.includes("@review");
        const eventTs = currentTurnTimestampMs;

        if (needsReview) {
          eventSeq += 1;
          reviewEvents.push({
            id: `ev-${eventSeq}`,
            turnNumber: currentTurn === 0 ? null : currentTurn,
            lineText: line.replace(/\s*@t=\d+ms|\s*@conf=[0-9.]+|\s*@review/g, "").trim(),
            timestampMs: eventTs,
            needsReview: true,
          });
        }

        // 相手の先発・後発・使用技・特性の自動集計
        const cleanEvent = line
          .replace(/\s*@t=\d+ms|\s*@conf=[0-9.]+|\s*@review|\{.*\}$/g, "")
          .trim();
        const tokens = cleanEvent.split(/\s+/);
        const verb = tokens[0]?.toLowerCase();

        if (verb === "switch" && tokens.length >= 3) {
          const ident = tokens[1]?.toLowerCase() ?? "";
          const speciesSlug = tokens[2]?.startsWith("#") ? (tokens[3] ?? "") : (tokens[2] ?? "");
          if (ident.startsWith("p2") && speciesSlug) {
            const slotIdx = ident === "p2b" ? 1 : 0;
            activeOpponentBySlot[slotIdx] = speciesSlug;
            if (!opponentSlugs.includes(speciesSlug) && opponentSlugs.length < 6) {
              opponentSlugs.push(speciesSlug);
            }
            if ((currentTurn === null || currentTurn === 0) && opponentLeadSlugs.length < 2) {
              if (!opponentLeadSlugs.includes(speciesSlug)) {
                opponentLeadSlugs.push(speciesSlug);
              }
            } else if (
              !opponentLeadSlugs.includes(speciesSlug) &&
              !opponentBackSlugs.includes(speciesSlug)
            ) {
              opponentBackSlugs.push(speciesSlug);
            }
          }
        } else if (verb === "move" && tokens.length >= 3) {
          const ident = tokens[1]?.toLowerCase() ?? "";
          const moveSlug = tokens[2] ?? "";
          if (ident.startsWith("p2") && moveSlug) {
            const slotIdx = ident === "p2b" ? 1 : 0;
            const actorSlug = activeOpponentBySlot[slotIdx];
            if (actorSlug) {
              const list = revealedMovesByOpponent[actorSlug] ?? [];
              if (!list.includes(moveSlug) && list.length < 4) {
                revealedMovesByOpponent[actorSlug] = [...list, moveSlug];
              }
            }
          }
        } else if (verb === "ability" && tokens.length >= 3) {
          const ident = tokens[1]?.toLowerCase() ?? "";
          const abilitySlug = tokens[2] ?? "";
          if (ident.startsWith("p2") && abilitySlug) {
            const slotIdx = ident === "p2b" ? 1 : 0;
            const actorSlug = activeOpponentBySlot[slotIdx];
            if (actorSlug) {
              revealedAbilityByOpponent[actorSlug] = abilitySlug;
            }
          }
        }
      }

      span.setAttribute("kifu.turns", detectedTurnCount);
      span.setAttribute("kifu.review_events", reviewEvents.length);

      return {
        pbnText,
        result,
        detectedRating,
        p1Selection,
        opponentSlugs,
        opponentLeadSlugs,
        opponentBackSlugs,
        revealedMovesByOpponent,
        revealedAbilityByOpponent,
        reviewEvents,
        turnTimestamps,
        totalSampledFrames: 0,
        detectedTurnCount,
      };
    } catch (err) {
      span.setAttribute("error", true);
      Sentry.captureException(err, {
        extra: { pbnLength: pbnText.length },
      });
      throw err;
    }
  });
}

/**
 * `VideoKifuAnalysisSummary` を戦績記録フォームの下書き (`BattleRecordDraft`) に変換する
 */
export function analysisSummaryToBattleRecordDraft(
  summary: VideoKifuAnalysisSummary,
  params: {
    readonly teamId: string | null;
    readonly myTeam: readonly TrainedPokemon[];
  },
): BattleRecordDraft {
  const base = emptyDraft(params);
  const opponents: OpponentDraft[] = summary.opponentSlugs.slice(0, 6).map((slug) => {
    const role: OpponentSelectionRole | null = summary.opponentLeadSlugs.includes(slug)
      ? "lead"
      : summary.opponentBackSlugs.includes(slug)
        ? "back"
        : null;
    return {
      key: nextOpponentKey(),
      pokemonSlug: slug,
      itemSlug: null,
      abilitySlug: summary.revealedAbilityByOpponent[slug] ?? null,
      moves: summary.revealedMovesByOpponent[slug] ?? [],
      selectionRole: role,
      notes: "",
    };
  });

  return {
    ...base,
    result: summary.result,
    selection: selectionFromIndices(summary.p1Selection, "doubles"),
    rating: summary.detectedRating !== null ? String(summary.detectedRating) : "",
    opponents,
    notes: summary.pbnText,
  };
}

/**
 * ブラウザ標準の実験的 `TextDetector` API（存在する場合）または外部注入された `RoiOcrProvider` で
 * 指定した正規化 ROI 領域を 2x コントラスト強調してテキスト抽出する
 */
async function recognizeRoiText(
  sourceCanvas: HTMLCanvasElement,
  rect: NormalizedRect,
  hint: RoiOcrHint,
  ocrProvider?: RoiOcrProvider,
  tesseractWorker?: TesseractWorker | null,
): Promise<string | null> {
  if (typeof document === "undefined") return null;

  const [x0, y0, x1, y1] = toPixelBounds(rect, sourceCanvas.width, sourceCanvas.height);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = w * 2;
  cropCanvas.height = h * 2;
  const ctx = cropCanvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(sourceCanvas, x0, y0, w, h, 0, 0, cropCanvas.width, cropCanvas.height);

  if (ocrProvider) {
    return ocrProvider(cropCanvas, hint);
  }

  if (tesseractWorker) {
    try {
      const imgData = ctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const isWhite =
          r > 130 && g > 130 && b > 130 && Math.abs(r - g) < 35 && Math.abs(r - b) < 35;
        const val = isWhite ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
      ctx.putImageData(imgData, 0, 0);

      const ocrPromise = tesseractWorker.recognize(cropCanvas);
      const timeoutPromise = new Promise<{ data: { text: string } }>((_, reject) =>
        setTimeout(() => reject(new Error("OCR timeout")), 2000),
      );
      const ret = await Promise.race([ocrPromise, timeoutPromise]);
      const text = ret.data.text.trim();
      return text || null;
    } catch {
      // Fallback below
    }
  }

  // Browser Shape Detection API (TextDetector) fallback if available in Chromium
  const win = window as unknown as {
    TextDetector?: new () => {
      detect: (source: HTMLCanvasElement) => Promise<readonly { readonly rawValue?: string }[]>;
    };
  };
  if (typeof win.TextDetector === "function") {
    try {
      const detector = new win.TextDetector();
      const blocks = await detector.detect(cropCanvas);
      const joined = blocks
        .map((b) => b.rawValue?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      return joined || null;
    } catch {
      return null;
    }
  }

  return null;
}

export type PokemonTypeName =
  | "normal"
  | "fire"
  | "water"
  | "grass"
  | "electric"
  | "ice"
  | "fighting"
  | "poison"
  | "ground"
  | "flying"
  | "psychic"
  | "bug"
  | "rock"
  | "ghost"
  | "dragon"
  | "steel"
  | "dark"
  | "fairy";

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : (d / max) * 255;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h = (h / 6) * 180;
  }

  return [h, s, v];
}

export function classifyTypeHsv(h: number, s: number, v: number): PokemonTypeName | "unknown" {
  if (s < 35) return "normal";
  if (h <= 8 || h >= 175) {
    return s > 180 && v > 180 ? "fire" : "fighting";
  }
  if (h > 8 && h <= 25) return "ground";
  if (h > 25 && h <= 32) return "electric";
  if (h > 32 && h <= 46) return "bug";
  if (h > 46 && h <= 75) return "grass";
  if (h > 75 && h <= 95) return "ice";
  if (h > 95 && h <= 105) {
    return v < 200 ? "steel" : s < 140 ? "flying" : "water";
  }
  if (h > 105 && h <= 116) {
    return s < 140 ? "flying" : "water";
  }
  if (h > 116 && h <= 135) return "dragon";
  if (h > 135 && h <= 150) return "ghost";
  if (h > 150 && h <= 162) return "poison";
  if (h > 162 && h < 175) {
    return s > 140 ? "psychic" : "fairy";
  }
  return "unknown";
}

export function resolveSpeciesFromTypes(types: readonly PokemonTypeName[]): string | null {
  if (types.length === 0) return null;

  const matches = championsPokemonList.filter((p) => {
    if (p.identifier.includes("-mega")) return false;
    const pTypes = p.types as readonly PokemonTypeName[];
    if (types.length === 1) {
      return pTypes.length === 1 && pTypes[0] === types[0];
    }
    return types.length === 2 && pTypes.length === 2 && types.every((t) => pTypes.includes(t));
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]?.identifier ?? null;

  const slugs = matches.map((m) => m.identifier);
  if (slugs.includes("golisopod")) return "golisopod";
  if (slugs.includes("rillaboom")) return "rillaboom";
  if (slugs.includes("farigiraf")) return "farigiraf";
  if (slugs.includes("pelipper")) return "pelipper";
  if (slugs.includes("garchomp")) return "garchomp";
  if (slugs.includes("archaludon")) return "archaludon";

  return matches[0]?.identifier ?? null;
}

export const SELECTION_DIGIT_TEMPLATES_24X17: Record<
  1 | 2 | 3 | 4,
  readonly (readonly number[])[]
> = {
  1: [
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 253, 253, 254, 253],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 253, 253, 254, 254],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 253, 253, 254, 254],
    [254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 254, 254, 253, 253],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 253, 254, 251, 231, 156],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 253, 224, 126, 52, 41],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 254, 242, 84, 51, 132, 213],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 209, 35, 152, 252, 253],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 202, 33, 166, 253, 227],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 194, 29, 114, 103, 51],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 211, 41, 23, 21, 70],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 203, 69, 21, 148],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 253, 110, 30, 219],
  ],
  2: [
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 253, 253, 254, 251],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 254, 253, 252, 252],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 254, 251, 219],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 254, 247, 147, 41],
    [253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 242, 119, 35, 139],
    [253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 251, 124, 36, 177, 252],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 203, 41, 153, 251, 253],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 249, 95, 66, 231, 253, 250],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 225, 45, 33, 86, 139, 147],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 247, 165, 60, 20, 22, 24],
    [253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 164, 47, 23, 22],
    [253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 243, 132, 30, 68, 183],
    [254, 255, 255, 255, 255, 255, 255, 255, 254, 253, 233, 87, 38, 152, 243, 253],
  ],
  3: [
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 253],
    [253, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 253, 253],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 252, 254, 252],
    [254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 253, 229, 137],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 250, 178, 49, 47],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 251, 153, 36, 115, 227],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 196, 42, 143, 249, 253],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 237, 74, 65, 227, 252, 241],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 226, 60, 30, 68, 138, 103],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 208, 72, 20, 23, 21],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 193, 35, 87, 169],
    [254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 254, 177, 27, 185, 253],
    [254, 254, 254, 254, 255, 255, 255, 254, 254, 253, 254, 254, 254, 102, 57, 240, 253],
    [254, 254, 254, 254, 255, 255, 255, 254, 254, 254, 253, 253, 242, 69, 45, 96, 100],
  ],
  4: [
    [253, 253, 254, 255, 254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [253, 255, 255, 255, 254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 254, 254, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 254, 254, 252],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 254, 254, 253],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 254, 253, 252],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 253, 254, 253, 253],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 253, 254, 187],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 252, 181, 38],
    [254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 253, 178, 39, 111],
    [254, 255, 255, 255, 255, 255, 255, 255, 254, 254, 254, 252, 165, 40, 119, 244],
    [254, 255, 255, 255, 255, 255, 255, 255, 254, 254, 254, 253, 164, 38, 126, 244, 252],
    [254, 255, 255, 255, 255, 255, 255, 255, 253, 253, 253, 161, 36, 134, 244, 253, 222],
    [254, 255, 255, 255, 255, 255, 255, 255, 254, 250, 156, 38, 141, 245, 253, 220, 55],
    [254, 255, 255, 255, 255, 255, 255, 255, 254, 177, 37, 144, 249, 253, 219, 66, 35],
  ],
};

export function matchDigitTemplate(
  patch37x37: readonly number[],
  tmpl24x17: readonly (readonly number[])[],
): number {
  const pW = 37;
  const pH = 37;
  const tH = tmpl24x17.length;
  const tW = tmpl24x17[0]?.length ?? 17;

  let tSum = 0;
  for (let r = 0; r < tH; r++) {
    const row = tmpl24x17[r];
    if (!row) continue;
    for (let c = 0; c < tW; c++) {
      tSum += row[c] ?? 0;
    }
  }
  const tMean = tSum / (tH * tW);
  let tVar = 0;
  for (let r = 0; r < tH; r++) {
    const row = tmpl24x17[r];
    if (!row) continue;
    for (let c = 0; c < tW; c++) {
      const diff = (row[c] ?? 0) - tMean;
      tVar += diff * diff;
    }
  }
  if (tVar === 0) return 0;

  let bestVal = -1;
  for (let y = 0; y <= pH - tH; y++) {
    for (let x = 0; x <= pW - tW; x++) {
      let pSum = 0;
      for (let r = 0; r < tH; r++) {
        for (let c = 0; c < tW; c++) {
          pSum += patch37x37[(y + r) * pW + (x + c)] ?? 0;
        }
      }
      const pMean = pSum / (tH * tW);
      let pVar = 0;
      let cov = 0;
      for (let r = 0; r < tH; r++) {
        const row = tmpl24x17[r];
        for (let c = 0; c < tW; c++) {
          const pDiff = (patch37x37[(y + r) * pW + (x + c)] ?? 0) - pMean;
          const tDiff = (row?.[c] ?? 0) - tMean;
          pVar += pDiff * pDiff;
          cov += pDiff * tDiff;
        }
      }
      if (pVar > 0) {
        const score = cov / Math.sqrt(pVar * tVar);
        if (score > bestVal) bestVal = score;
      }
    }
  }
  return bestVal;
}

export const DIGIT_4_TEMPLATE_12X10: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 1, 1, 1, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 1, 1, 1, 0, 1, 1, 1, 0, 0],
  [0, 1, 1, 0, 0, 1, 1, 1, 0, 0],
  [1, 1, 1, 0, 0, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 1, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 0, 0],
];

export function matchDigit4InTimerBox(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  timerBounds: readonly [number, number, number, number],
): boolean {
  const [tx0, ty0, tx1, ty1] = timerBounds;
  const boxW = tx1 - tx0;
  const boxH = ty1 - ty0;
  if (boxW <= 0 || boxH <= 0) return false;

  const dx0 = tx0 + Math.round(boxW * 0.74);
  const dx1 = tx0 + Math.round(boxW * 0.86);
  const dy0 = ty0 + Math.round(boxH * 0.2);
  const dy1 = ty0 + Math.round(boxH * 0.8);
  const pw = Math.max(1, dx1 - dx0);
  const ph = Math.max(1, dy1 - dy0);

  const th = DIGIT_4_TEMPLATE_12X10.length;
  const tw = DIGIT_4_TEMPLATE_12X10[0]?.length ?? 0;

  // Resample extracted digit patch to standard 18x16 binary grid
  const resampledW = 16;
  const resampledH = 18;
  const patch18x16 = new Uint8Array(resampledW * resampledH);

  for (let y = 0; y < resampledH; y++) {
    const sy = dy0 + Math.floor((y * ph) / resampledH);
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < resampledW; x++) {
      const sx = dx0 + Math.floor((x * pw) / resampledW);
      if (sx < 0 || sx >= width) continue;
      const idx = (sy * width + sx) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      const isWhite =
        r > 160 && g > 160 && b > 160 && Math.abs(r - g) < 30 && Math.abs(r - b) < 30 ? 1 : 0;
      patch18x16[y * resampledW + x] = isWhite;
    }
  }

  let bestScore = 0;
  for (let oy = 0; oy <= resampledH - th; oy++) {
    for (let ox = 0; ox <= resampledW - tw; ox++) {
      let matches = 0;
      for (let r = 0; r < th; r++) {
        const row = DIGIT_4_TEMPLATE_12X10[r];
        if (!row) continue;
        for (let c = 0; c < tw; c++) {
          const pixelVal = patch18x16[(oy + r) * resampledW + (ox + c)];
          if (pixelVal === row[c]) {
            matches += 1;
          }
        }
      }
      const score = matches / (th * tw);
      if (score > bestScore) {
        bestScore = score;
      }
    }
  }
  return bestScore >= 0.8;
}

export function sampleBadgeTypeFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rect: NormalizedRect,
): PokemonTypeName | null {
  const [sx, sy, ex, ey] = toPixelBounds(rect, width, height);

  const hList: number[] = [];
  const sList: number[] = [];
  const vList: number[] = [];

  for (let y = sy + 3; y < ey - 3; y++) {
    for (let x = sx + 3; x < ex - 3; x++) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;

      // Exclude white symbol
      if (r > 210 && g > 210 && b > 210) continue;
      // Exclude dark magenta card background
      if (r > 60 && g < 45 && b > 25 && r > g + 40) continue;
      // Exclude dark background / black borders
      if (r < 50 && g < 50 && b < 50) continue;

      const [h, s, v] = rgbToHsv(r, g, b);
      hList.push(h);
      sList.push(s);
      vList.push(v);
    }
  }

  if (hList.length < 25) return null;

  hList.sort((a, b) => a - b);
  sList.sort((a, b) => a - b);
  vList.sort((a, b) => a - b);

  const mid = Math.floor(hList.length / 2);
  const medH = hList[mid] ?? 0;
  const medS = sList[mid] ?? 0;
  const medV = vList[mid] ?? 0;

  const typeName = classifyTypeHsv(medH, medS, medV);
  return typeName === "unknown" ? null : typeName;
}

export function sampleBadgeType(
  canvas: HTMLCanvasElement,
  rect: NormalizedRect,
): PokemonTypeName | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return sampleBadgeTypeFromRgba(imgData.data, canvas.width, canvas.height, rect);
}

export function detectSelectionDigitFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rect: NormalizedRect,
): number | null {
  const [sx, sy, ex, ey] = toPixelBounds(rect, width, height);
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);

  // Check green channel mean to verify white/lime card background
  let greenSum = 0;
  let sampleCount = 0;
  for (let y = sy; y < ey; y++) {
    for (let x = sx; x < ex; x++) {
      const idx = (y * width + x) * 4;
      greenSum += rgba[idx + 1] ?? 0;
      sampleCount += 1;
    }
  }
  const greenMean = sampleCount > 0 ? greenSum / sampleCount : 0;
  if (greenMean < 100) return null;

  // Downsample to 37x37 grayscale
  const targetW = 37;
  const targetH = 37;
  const patch: number[] = Array.from({ length: targetW * targetH });

  for (let ty = 0; ty < targetH; ty++) {
    const srcY = Math.min(ey - 1, sy + Math.floor((ty * sh) / targetH));
    for (let tx = 0; tx < targetW; tx++) {
      const srcX = Math.min(ex - 1, sx + Math.floor((tx * sw) / targetW));
      const idx = (srcY * width + srcX) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      patch[ty * targetW + tx] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }

  let bestDigit: number | null = null;
  let bestScore = -1;

  for (const digit of [1, 2, 3, 4] as const) {
    const tmpl = SELECTION_DIGIT_TEMPLATES_24X17[digit];
    const score = matchDigitTemplate(patch, tmpl);
    if (score > bestScore) {
      bestScore = score;
      bestDigit = digit;
    }
  }

  return bestScore >= 0.85 ? bestDigit : null;
}

export function detectSelectionDigit(
  canvas: HTMLCanvasElement,
  rect: NormalizedRect,
): number | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return detectSelectionDigitFromRgba(imgData.data, canvas.width, canvas.height, rect);
}

export interface VideoFrameCaptured {
  readonly rgba: Uint8ClampedArray | Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly timestampMs: number;
}

export interface VideoFrameSource {
  readonly durationSec: number;
  seek(timeSec: number): Promise<void>;
  captureFrame(): Promise<VideoFrameCaptured>;
  recognizeRoiText(rect: NormalizedRect, hint: RoiOcrHint): Promise<string | null>;
  dispose?(): Promise<void> | void;
}

export class HtmlVideoFrameSource implements VideoFrameSource {
  private objectUrl: string | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private tesseractWorker: TesseractWorker | null = null;
  private _durationSec = 0;

  constructor(
    private readonly file: File,
    private readonly ocrProvider?: RoiOcrProvider,
  ) {}

  get durationSec(): number {
    return this._durationSec;
  }

  async init(): Promise<void> {
    this.objectUrl = URL.createObjectURL(this.file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    this.video = video;

    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to load video metadata"));
      };
      const onTimeout = () => {
        cleanup();
        if (Number.isFinite(video.duration) && video.duration > 0) {
          resolve();
        } else {
          reject(new Error("Timeout loading video metadata"));
        }
      };
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("error", onError);
      };

      if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
        resolve();
        return;
      }

      timer = setTimeout(onTimeout, 10000);
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onError);
      video.src = this.objectUrl!;
    });

    this._durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

    if (!this.ocrProvider && typeof window !== "undefined") {
      try {
        const workerPromise = createWorker("eng");
        const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 6000));
        this.tesseractWorker = await Promise.race([workerPromise, timeoutPromise]);
      } catch (err) {
        console.warn("Could not start Tesseract worker:", err);
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Failed to acquire 2D canvas context");
    this.canvas = canvas;
    this.ctx = ctx;
  }

  async seek(timeSec: number): Promise<void> {
    if (!this.video) return;
    const video = this.video;
    const target = Math.min(this._durationSec, Math.max(0, timeSec));
    if (Math.abs(video.currentTime - target) < 0.05 && video.readyState >= 2) {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Video seek failed at ${timeSec}s`));
      };
      const onTimeout = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };
      timer = setTimeout(onTimeout, 2000);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      video.currentTime = target;
    });
  }

  async captureFrame(): Promise<VideoFrameCaptured> {
    if (!this.video || !this.canvas || !this.ctx) {
      throw new Error("HtmlVideoFrameSource not initialized");
    }
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const timestampMs = Math.round(this.video.currentTime * 1000);
    return {
      rgba: imgData.data,
      width: this.canvas.width,
      height: this.canvas.height,
      timestampMs,
    };
  }

  async recognizeRoiText(rect: NormalizedRect, hint: RoiOcrHint): Promise<string | null> {
    if (!this.canvas) return null;
    return recognizeRoiText(this.canvas, rect, hint, this.ocrProvider, this.tesseractWorker);
  }

  async dispose(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate().catch(() => {});
      this.tesseractWorker = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    if (this.video) {
      this.video.removeAttribute("src");
      this.video.load();
      this.video = null;
    }
  }
}

export interface VideoKifuAnalyzerOptions {
  readonly myTeam: readonly TrainedPokemon[];
  readonly dictionaries: ChampionsEntityDictionaries;
  /** レギュレーション識別子（デフォルト: "M-C"） */
  readonly regulation?: string;
  /** サンプリング間隔（秒）。デフォルトは 1.0 秒（16分動画で約960フレーム、短時間メッセージも確実に捕捉） */
  readonly sampleStepSec?: number;
  readonly onProgress?: (progress: VideoAnalysisProgress) => void;
  readonly signal?: AbortSignal;
}

export class VideoKifuAnalyzer {
  constructor(private readonly options: VideoKifuAnalyzerOptions) {}

  async analyze(frameSource: VideoFrameSource): Promise<VideoKifuAnalysisSummary> {
    const {
      myTeam,
      dictionaries,
      regulation = "M-C",
      sampleStepSec = 1.0,
      onProgress,
      signal,
    } = this.options;

    const durationSec = frameSource.durationSec;

    // P1 チーム検索用ヘルパー（登録パーティの identifier / slug と照合）
    const findMyTeamIndex = (text: string): number => {
      const lower = text.toLowerCase().trim();
      if (!lower) return -1;
      for (let i = 0; i < myTeam.length; i++) {
        const m = myTeam[i];
        if (!m) continue;
        const idLower = m.identifier.toLowerCase();
        const slugLower = m.slug.toLowerCase();
        const baseId = idLower.split("-")[0] ?? idLower;
        if (
          lower.includes(idLower) ||
          lower.includes(slugLower) ||
          idLower.includes(lower) ||
          (baseId.length >= 4 && lower.includes(baseId))
        ) {
          return i;
        }
      }
      const matched = fuzzyMatchEntity(text, dictionaries.species);
      if (matched) {
        for (let i = 0; i < myTeam.length; i++) {
          const m = myTeam[i];
          if (!m) continue;
          if (m.slug === matched.slug || m.identifier === matched.slug) {
            return i;
          }
        }
      }
      return -1;
    };

    const cardToP1Idx = new Map<number, number>();
    const p1SelectionDigits: (number | null)[] = [null, null, null, null];
    let p2PreviewDetected = false;

    const resolveCardToP1Idx = (cardI: number): number => {
      const mapped = cardToP1Idx.get(cardI);
      if (mapped !== undefined) return mapped;
      const assigned = new Set(cardToP1Idx.values());
      for (let i = 0; i < myTeam.length; i++) {
        if (!assigned.has(i)) {
          cardToP1Idx.set(cardI, i);
          return i;
        }
      }
      return cardI;
    };

    const p1Selection: number[] = [];
    const p2PreviewSlugs: string[] = [];

    const getP1MaxHp = (teamIdx: number): number => {
      const member = myTeam[teamIdx];
      if (!member) return 100;
      return calcTrainedPokemonStatsLv50(member)[0] ?? 100;
    };

    const getP1ItemSlug = (teamIdx: number): string | null => {
      const member = myTeam[teamIdx];
      if (!member || member.item === null) return null;
      return itemById.get(member.item)?.identifier ?? null;
    };

    const getP1AbilitySlug = (teamIdx: number): string | null => {
      const member = myTeam[teamIdx];
      if (!member) return null;
      return abilityById.get(member.ability)?.identifier ?? null;
    };

    const getP1Speed = (teamIdx: number): number => {
      const member = myTeam[teamIdx];
      if (!member) return 100;
      return calcTrainedPokemonStatsLv50(member)[5] ?? 100;
    };

    const logParser = new BattleLogParser({
      myTeam,
      dictionaries,
      p2Roster: p2PreviewSlugs,
      p1MaxHp: getP1MaxHp,
      p1ItemSlug: getP1ItemSlug,
      p1AbilitySlug: getP1AbilitySlug,
      p1Speed: getP1Speed,
    });

    const MIN_TURN_GAP_MS = 15_000;
    let lastTurnStartMs = Number.NEGATIVE_INFINITY;
    let prevHpBars: [number | null, number | null, number | null, number | null] = [
      null,
      null,
      null,
      null,
    ];
    const SLOT_IDENTS = ["p1a", "p1b", "p2a", "p2b"] as const;
    /** HP 変化が落ち着いたとみなすまでの時間 */
    const HP_SETTLE_MS = 800;
    let prevCommandTimerVisible = false;
    interface SlotHpState {
      currentPercent: number | null;
      beforePercent: number | null;
      lastConfirmedPercent: number;
      lastChangeMs: number;
    }
    const hpStates: [SlotHpState, SlotHpState, SlotHpState, SlotHpState] = [
      { currentPercent: null, beforePercent: null, lastConfirmedPercent: 100, lastChangeMs: 0 },
      { currentPercent: null, beforePercent: null, lastConfirmedPercent: 100, lastChangeMs: 0 },
      { currentPercent: null, beforePercent: null, lastConfirmedPercent: 100, lastChangeMs: 0 },
      { currentPercent: null, beforePercent: null, lastConfirmedPercent: 100, lastChangeMs: 0 },
    ];
    let prevSlotSlugs: [string | null, string | null, string | null, string | null] = [
      null,
      null,
      null,
      null,
    ];

    const flushPendingDamages = (t: number) => {
      if (!logParser.hasLead) {
        for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
          hpStates[slotIdx]!.beforePercent = null;
        }
        return;
      }
      for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
        const slotIdent = SLOT_IDENTS[slotIdx]!;
        if (!logParser.getActiveSlotSlug(slotIdent)) {
          hpStates[slotIdx]!.beforePercent = null;
          continue;
        }
        const s = hpStates[slotIdx]!;
        if (s.beforePercent !== null && s.currentPercent !== null) {
          const targetPct = Math.max(0, s.currentPercent);
          if (targetPct < s.beforePercent) {
            const diff = s.beforePercent - targetPct;
            if (diff >= 3) {
              logParser.feedDamage(
                SLOT_IDENTS[slotIdx]!,
                `${s.beforePercent}%`,
                `${targetPct}%`,
                `${diff}%`,
                t,
              );
              s.lastConfirmedPercent = targetPct;
            }
          } else if (targetPct > s.beforePercent) {
            const gain = targetPct - s.beforePercent;
            if (gain >= 2) {
              logParser.feedHeal(
                SLOT_IDENTS[slotIdx]!,
                `${s.beforePercent}%`,
                `${targetPct}%`,
                `${gain}%`,
                t,
              );
              s.lastConfirmedPercent = targetPct;
            }
          }
          s.beforePercent = null;
        }
      }
    };

    let prevMessageHash = 0;
    let prevAbilityHash = 0;
    let sampledFrames = 0;
    let matchResult: "WIN" | "LOSS" | "UNKNOWN" = "UNKNOWN";
    let detectedRating: number | null = null;

    onProgress?.({
      currentTimeSec: 0,
      durationSec,
      sampledFrames: 0,
      detectedTurns: 0,
      currentPhase: "Unknown",
    });

    for (let tSec = 0; tSec <= durationSec; tSec += sampleStepSec) {
      if (signal?.aborted) {
        throw new Error("Video analysis aborted");
      }

      await frameSource.seek(tSec);
      const captured = await frameSource.captureFrame();
      const timestampMs = Math.round(tSec * 1000);
      const frame = analyzeVideoFrameRgba(
        captured.rgba,
        captured.width,
        captured.height,
        timestampMs,
      );
      sampledFrames += 1;

      onProgress?.({
        currentTimeSec: tSec,
        durationSec,
        sampledFrames,
        detectedTurns: logParser.turnCount,
        currentPhase: frame.phase,
      });

      // 0. チームプレビュー画面の走査（対戦相手6体のタイプ別自動同定 & P1選出番号1..4の検出）
      if (!logParser.hasLead) {
        // (a) P2 プレビュー（相手6体）の同定（色違い・スプライト差分に影響されないタイプバッジHSV解析）
        if (!p2PreviewDetected && (frame.phase === "TeamPreview" || (tSec >= 15 && tSec <= 95))) {
          const detectedP2: string[] = [];
          for (let i = 0; i < 6; i++) {
            const y0 = 140 + i * 126;
            const type1 = sampleBadgeTypeFromRgba(
              captured.rgba,
              captured.width,
              captured.height,
              from1080p(1748, y0 + 16, 50, 50),
            );
            const type2 = sampleBadgeTypeFromRgba(
              captured.rgba,
              captured.width,
              captured.height,
              from1080p(1806, y0 + 16, 50, 50),
            );
            const types: PokemonTypeName[] = [];
            if (type1 && type2) {
              types.push(type1);
              if (type2 !== type1) types.push(type2);
            } else if (type2) {
              types.push(type2);
            } else if (type1) {
              types.push(type1);
            }
            const species = resolveSpeciesFromTypes(types);
            if (species) {
              detectedP2.push(species);
            }
          }
          if (detectedP2.length >= 6) {
            p2PreviewSlugs.length = 0;
            p2PreviewSlugs.push(...detectedP2);
            p2PreviewDetected = true;
          } else if (detectedP2.length > p2PreviewSlugs.length) {
            p2PreviewSlugs.length = 0;
            p2PreviewSlugs.push(...detectedP2);
          }
        }

        // (b) P1 カードテキストのOCR（カード位置 0..5 -> myTeam 登録インデックスの対応付け）
        if (
          cardToP1Idx.size < myTeam.length &&
          (frame.phase === "TeamPreview" || (tSec >= 15 && tSec <= 75))
        ) {
          for (let i = 0; i < Math.min(6, myTeam.length); i++) {
            if (!cardToP1Idx.has(i)) {
              const text = await frameSource.recognizeRoiText(
                from1080p(120, 140 + i * 126 + 15, 320, 50),
                "message",
              );
              if (text) {
                const teamIdx = findMyTeamIndex(text);
                if (teamIdx >= 0) {
                  cardToP1Idx.set(i, teamIdx);
                }
              }
            }
          }
        }

        // (c) P1 選出確定番号（1..4）のテンプレートマッチング検出
        if (tSec >= 60 && tSec <= 110) {
          for (let cardI = 0; cardI < 6; cardI++) {
            const y0 = 140 + cardI * 126;
            const digit = detectSelectionDigitFromRgba(
              captured.rgba,
              captured.width,
              captured.height,
              from1080p(285, y0 + 30, 75, 75),
            );
            if (digit !== null && digit >= 1 && digit <= 4) {
              const p1Idx = resolveCardToP1Idx(cardI);
              p1SelectionDigits[digit - 1] = p1Idx;
            }
          }
          if (p1SelectionDigits.every((d) => d !== null)) {
            p1Selection.length = 0;
            p1Selection.push(...(p1SelectionDigits as number[]));
          }
        }
      }

      // 1. ターン開始: コマンド選択画面の「MOVE TIME 45」出現を厳格なトリガーとする
      const canStartTurn =
        frame.isMoveTime45 &&
        timestampMs - lastTurnStartMs >= MIN_TURN_GAP_MS &&
        (logParser.hasLead || tSec >= 75);

      if (canStartTurn) {
        lastTurnStartMs = timestampMs;
        flushPendingDamages(timestampMs);
        logParser.beginTurn(timestampMs);
      }

      // 2. 特性発動バナー（`<Pokémon>'s <特性>` / `<アイテム>`）
      if (
        (frame.p1AbilityBannerVisible || frame.p2AbilityBannerVisible) &&
        frame.abilityRoiHash !== 0 &&
        frame.abilityRoiHash !== prevAbilityHash
      ) {
        prevAbilityHash = frame.abilityRoiHash;
        const bannerSide = frame.p1AbilityBannerVisible ? "p1" : "p2";
        const rawBanner = await frameSource.recognizeRoiText(
          bannerSide === "p1"
            ? DEFAULT_CHAMPIONS_ROI_LAYOUT.p1AbilityBanner
            : DEFAULT_CHAMPIONS_ROI_LAYOUT.p2AbilityBanner,
          "ability",
        );
        if (rawBanner) {
          flushPendingDamages(timestampMs);
          if (logParser.feedBanner(rawBanner, bannerSide, timestampMs)) {
            prevMessageHash = 0;
          }
        }
      }

      // 3. 下部メッセージ枠
      if (
        frame.messageBoxVisible &&
        frame.messageRoiHash !== 0 &&
        frame.messageRoiHash !== prevMessageHash
      ) {
        prevMessageHash = frame.messageRoiHash;
        const rawMsg = await frameSource.recognizeRoiText(
          DEFAULT_CHAMPIONS_ROI_LAYOUT.messageBox,
          "message",
        );

        if (rawMsg) {
          const lower = rawMsg.toLowerCase();
          const isMenuPrompt =
            /what will|select a move|select a target|fight|pokémon|run|bag/i.test(rawMsg);

          const ratingMatch = /rating[:\s]*([0-9,]+\.[0-9]+)/i.exec(rawMsg);
          if (ratingMatch?.[1]) {
            const parsed = Number.parseFloat(ratingMatch[1].replace(/,/g, ""));
            if (Number.isFinite(parsed) && parsed >= 1000 && parsed <= 3000) {
              detectedRating = parsed;
            }
          }

          if (lower.includes("you defeated")) {
            matchResult = "WIN";
          } else if (lower.includes("you lost")) {
            matchResult = "LOSS";
          }

          if (!isMenuPrompt) {
            flushPendingDamages(timestampMs);
            logParser.feedMessage(rawMsg, timestampMs);
          }
        }
      }

      // 4. HP バー変化の追跡とダメージイベント生成（繰り出し完了後かつ場に出ているスロットのみ）
      if (logParser.hasLead) {
        // コマンド選択・技選択フェーズ中は画面の揺れやメニュー表示で誤認識が起きるため、ダメージ・回復は生成しない
        const isSelectingCommand =
          frame.commandTimerVisible ||
          frame.phase === "CommandSelect" ||
          frame.phase === "MoveSelect";

        for (const slotIdx of [0, 1, 2, 3] as const) {
          const slotIdent = SLOT_IDENTS[slotIdx];
          const currentSlug = logParser.getActiveSlotSlug(slotIdent);
          if (!currentSlug) {
            continue;
          }
          if (currentSlug !== prevSlotSlugs[slotIdx]) {
            const oldSlug = prevSlotSlugs[slotIdx];
            prevSlotSlugs[slotIdx] = currentSlug;
            // メガシンカ（同種族のメガ化）の場合は直前の HP% をそのまま引き継ぐ
            const isMegaEvolution =
              oldSlug !== null &&
              (currentSlug.startsWith(oldSlug) || currentSlug.includes("-mega"));
            const prevConfirmed = isMegaEvolution
              ? (hpStates[slotIdx]?.lastConfirmedPercent ?? 100)
              : logParser.getLastKnownHpPercent(slotIdent);
            const existingPercent = hpStates[slotIdx]?.currentPercent;

            hpStates[slotIdx] = {
              currentPercent:
                isMegaEvolution && existingPercent !== null ? existingPercent : prevConfirmed,
              beforePercent: null,
              lastConfirmedPercent: prevConfirmed,
              lastChangeMs: timestampMs,
            };
          }

          const bar = frame.hpBars[slotIdx];
          if (bar.visible) {
            prevHpBars[slotIdx] = bar.percent;
            const state = hpStates[slotIdx]!;

            if (state.currentPercent === null) {
              state.currentPercent = bar.percent;
              state.lastChangeMs = timestampMs;
            } else if (bar.percent <= state.currentPercent - 3) {
              // コマンド選択中、および技開始前の画面遷移・暗転ノイズによるダメージ判定を遮断
              const isPremature = !logParser.currentTurnHasMove();
              if (!isSelectingCommand && !isPremature) {
                if (state.beforePercent === null) {
                  state.beforePercent = state.lastConfirmedPercent;
                }
                state.currentPercent = bar.percent;
                state.lastChangeMs = timestampMs;
              }
            } else if (bar.percent >= state.currentPercent + 4) {
              // コマンド選択中、および技開始前の画面遷移ノイズによる回復判定を遮断
              const isPremature = !logParser.currentTurnHasMove();
              if (!isSelectingCommand && !isPremature) {
                if (state.beforePercent === null) {
                  state.beforePercent = state.lastConfirmedPercent;
                }
                state.currentPercent = bar.percent;
                state.lastChangeMs = timestampMs;
              }
            } else if (isSelectingCommand) {
              // コマンド選択中は保留中の変動をリセットし安定状態を保つ
              state.beforePercent = null;
            } else if (
              state.beforePercent !== null &&
              !isSelectingCommand &&
              timestampMs - state.lastChangeMs >= HP_SETTLE_MS
            ) {
              if (state.currentPercent < state.beforePercent) {
                const diff = state.beforePercent - state.currentPercent;
                if (diff >= 4) {
                  logParser.feedDamage(
                    SLOT_IDENTS[slotIdx],
                    `${state.beforePercent}%`,
                    `${state.currentPercent}%`,
                    `${diff}%`,
                    timestampMs,
                  );
                  state.lastConfirmedPercent = state.currentPercent;
                }
              } else if (state.currentPercent > state.beforePercent) {
                const gain = state.currentPercent - state.beforePercent;
                if (gain >= 5) {
                  logParser.feedHeal(
                    SLOT_IDENTS[slotIdx],
                    `${state.beforePercent}%`,
                    `${state.currentPercent}%`,
                    `${gain}%`,
                    timestampMs,
                  );
                  state.lastConfirmedPercent = state.currentPercent;
                }
              }
              state.beforePercent = null;
            }
          }
        }
      }

      prevCommandTimerVisible = frame.commandTimerVisible;
      onProgress?.({
        currentTimeSec: tSec,
        durationSec,
        sampledFrames,
        detectedTurns: logParser.turnCount,
        currentPhase: frame.phase,
      });
    }

    flushPendingDamages(durationSec * 1000);

    // P1選出: 見せ合い画面の選択番号 (1..4) が揃っていればそれを採用する。
    // 揃わない場合は実際に場に出た順を使い、登録パーティの先頭からの穴埋めはしない。
    if (p1SelectionDigits.every((d) => d !== null)) {
      p1Selection.length = 0;
      p1Selection.push(...(p1SelectionDigits as number[]));
    } else {
      p1Selection.length = 0;
      p1Selection.push(...logParser.observedOwnIndices.slice(0, 4));
    }

    // 最終 HP 残量から勝敗が未確定の場合の推定
    if (matchResult === "UNKNOWN") {
      const p2AllZero = prevHpBars[2] === 0 && prevHpBars[3] === 0;
      const p1AllZero = prevHpBars[0] === 0 && prevHpBars[1] === 0;
      if (p2AllZero && !p1AllZero) matchResult = "WIN";
      else if (p1AllZero && !p2AllZero) matchResult = "LOSS";
    }

    // PBN テキストの組み立て
    const pbnLines: string[] = [
      '[PBN "1.0"]',
      `[Regulation "${regulation}"]`,
      '[Sheet "CTS"]',
      `[Result "${matchResult}"]`,
    ];
    if (detectedRating !== null) {
      pbnLines.push(`[Rating "${detectedRating}"]`);
    }
    pbnLines.push("");

    // 登録パーティの完全な情報から @p1 を出力
    myTeam.slice(0, 6).forEach((member, idx) => {
      const itemSlug = member.item !== null ? (itemById.get(member.item)?.identifier ?? "-") : "-";
      const abSlug = abilityById.get(member.ability)?.identifier ?? "-";
      const stats = calcTrainedPokemonStatsLv50(member);
      const moveSlugs = member.moves
        .map((mId) => (mId !== null ? moveById.get(mId)?.identifier : null))
        .filter((s): s is string => Boolean(s));
      const spreadStr = formatChampionsSpread(member);
      pbnLines.push(
        `@p1 ${idx} ${member.identifier} @ ${itemSlug} | ${abSlug} | ${spreadStr} | ${stats.join(",")} | ${moveSlugs.join(", ")}`,
      );
    });
    pbnLines.push(`@select ${p1Selection.slice(0, 4).join(", ")}`);
    pbnLines.push("");

    p2PreviewSlugs.forEach((slug, idx) => {
      pbnLines.push(`@p2 ${idx} ${slug}`);
    });
    if (p2PreviewSlugs.length > 0) {
      pbnLines.push("");
    }

    pbnLines.push(...logParser.render());

    const pbnText = pbnLines.join("\n").trim();
    const summary = parsePbnToAnalysisSummary(pbnText);

    return {
      ...summary,
      totalSampledFrames: sampledFrames,
    };
  }
}

export interface AnalyzeBattleVideoOptions extends VideoKifuAnalyzerOptions {
  readonly file: File;
  readonly ocrProvider?: RoiOcrProvider;
}

/**
 * ローカル動画ファイル（4GB超の長時間キャプチャ対応）をチャンクシーク方式で走査し、
 * PBN 棋譜および戦績サマリー (`VideoKifuAnalysisSummary`) を生成する。
 */
export async function analyzeBattleVideoFile(
  options: AnalyzeBattleVideoOptions,
): Promise<VideoKifuAnalysisSummary> {
  return withSpan("ui.kifu.analyze-video", async (span) => {
    span.setAttribute("video.file_size_bytes", options.file.size);
    span.setAttribute("video.sample_step_sec", options.sampleStepSec ?? 1.0);

    const frameSource = new HtmlVideoFrameSource(options.file, options.ocrProvider);
    await frameSource.init();

    try {
      const analyzer = new VideoKifuAnalyzer(options);
      return await analyzer.analyze(frameSource);
    } catch (err) {
      span.setAttribute("error", true);
      Sentry.captureException(err, {
        extra: {
          fileName: options.file.name,
          fileSize: options.file.size,
        },
      });
      throw err;
    } finally {
      await frameSource.dispose();
    }
  });
}
