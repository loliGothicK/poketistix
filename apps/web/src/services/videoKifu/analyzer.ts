import * as Sentry from "@sentry/nextjs";
import { withSpan } from "@/lib/otel";
import { abilityById } from "@/data/abilities";
import { itemById } from "@/data/items";
import { moveById } from "@/data/moves";
import { BattleLogParser } from "@/services/battleLogParser";
import { approxFind, fuzzyMatchEntity, normalizeOcrToken } from "@/services/ocrText";
import type {
  AnalyzeBattleVideoOptions,
  NormalizedRect,
  VideoFrameSource,
  VideoKifuAnalysisSummary,
  VideoKifuAnalyzerOptions,
} from "./types";
import { DEFAULT_CHAMPIONS_ROI_LAYOUT, from1080p } from "./roiLayout";
import { analyzeVideoFrameRgba, computeRoiLumaHash } from "./frameSampling";
import {
  matchPokemonSpriteFromRgba,
  resolveSpeciesFromTypes,
  sampleBadgeTypeFromRgba,
  type PokemonTypeName,
} from "./badgeClassifier";
import { detectTeamPreviewDigitFromRgba } from "./digitRecognition";
import {
  calcTrainedPokemonStatsLv50,
  formatChampionsSpread,
  parsePbnToAnalysisSummary,
} from "./kifuSummary";
import { HtmlVideoFrameSource } from "./htmlVideoSource";
import { isLeft } from "fp-ts/lib/Either";
import { sanitizeAndValidateBattleLog } from "./pbnSanitizer";

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
    for (let i = 0; i < myTeam.length; i++) {
      cardToP1Idx.set(i, i);
    }
    const prevP1CardHashes: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    const p1SelectionDigits: (number | null)[] = [null, null, null, null];
    const p2CardVotes: [
      Map<string, number>,
      Map<string, number>,
      Map<string, number>,
      Map<string, number>,
      Map<string, number>,
      Map<string, number>,
    ] = [new Map(), new Map(), new Map(), new Map(), new Map(), new Map()];

    const resolveCardToP1Idx = (cardI: number): number => {
      const mapped = cardToP1Idx.get(cardI);
      if (mapped !== undefined) return mapped;
      return cardI;
    };

    const p1Selection: number[] = [];
    const p2PreviewSlugs: string[] = [];
    const p1SelectedCardVotes = new Map<number, number>();
    const p1CardDigitVotes: Map<1 | 2 | 3 | 4, number>[] = [
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
    ];

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

    const getP1MoveSlugs = (teamIdx: number): readonly string[] => {
      const member = myTeam[teamIdx];
      if (!member) return [];
      return member.moves
        .map((m) => (m !== null ? moveById.get(m)?.identifier : null))
        .filter((s): s is string => Boolean(s));
    };

    const logParser = new BattleLogParser({
      myTeam,
      dictionaries,
      p2Roster: p2PreviewSlugs,
      p1MaxHp: getP1MaxHp,
      p1ItemSlug: getP1ItemSlug,
      p1AbilitySlug: getP1AbilitySlug,
      p1Moves: getP1MoveSlugs,
      p1Speed: getP1Speed,
    });

    const MIN_TURN_GAP_MS = 15_000;
    let lastTurnStartMs = Number.NEGATIVE_INFINITY;
    const prevHpBars: [number | null, number | null, number | null, number | null] = [
      null,
      null,
      null,
      null,
    ];
    const SLOT_IDENTS = ["p1a", "p1b", "p2a", "p2b"] as const;
    /** HP 変化が落ち着いたとみなすまでの時間 */
    const HP_SETTLE_MS = 800;
    interface SlotHpState {
      currentPercent: number | null;
      currentHpStr: string | null;
      beforePercent: number | null;
      beforeHpStr: string | null;
      lastConfirmedPercent: number;
      lastConfirmedHpStr: string;
      lastChangeMs: number;
      wasVisible: boolean;
    }
    const hpStates: [SlotHpState, SlotHpState, SlotHpState, SlotHpState] = [
      {
        currentPercent: null,
        currentHpStr: null,
        beforePercent: null,
        beforeHpStr: null,
        lastConfirmedPercent: 100,
        lastConfirmedHpStr: "100%",
        lastChangeMs: 0,
        wasVisible: false,
      },
      {
        currentPercent: null,
        currentHpStr: null,
        beforePercent: null,
        beforeHpStr: null,
        lastConfirmedPercent: 100,
        lastConfirmedHpStr: "100%",
        lastChangeMs: 0,
        wasVisible: false,
      },
      {
        currentPercent: null,
        currentHpStr: null,
        beforePercent: null,
        beforeHpStr: null,
        lastConfirmedPercent: 100,
        lastConfirmedHpStr: "100%",
        lastChangeMs: 0,
        wasVisible: false,
      },
      {
        currentPercent: null,
        currentHpStr: null,
        beforePercent: null,
        beforeHpStr: null,
        lastConfirmedPercent: 100,
        lastConfirmedHpStr: "100%",
        lastChangeMs: 0,
        wasVisible: false,
      },
    ];
    const prevSlotSlugs: [string | null, string | null, string | null, string | null] = [
      null,
      null,
      null,
      null,
    ];
    let lastActiveP1Slot: "p1a" | "p1b" = "p1a";

    const flushSlotHpChange = (slotIdx: 0 | 1 | 2 | 3, t: number) => {
      const slotIdent = SLOT_IDENTS[slotIdx];
      const s = hpStates[slotIdx];
      if (!logParser.hasLead || !logParser.getActiveSlotSlug(slotIdent)) {
        s.beforePercent = null;
        s.beforeHpStr = null;
        return;
      }
      if (s.beforePercent !== null && s.currentPercent !== null) {
        const targetPct = Math.max(0, s.currentPercent);
        const beforeStr = s.beforeHpStr ?? `${s.beforePercent}%`;
        const afterStr = s.currentHpStr ?? `${targetPct}%`;
        if (
          targetPct < s.beforePercent ||
          (beforeStr !== afterStr && targetPct <= s.beforePercent)
        ) {
          const diff = Math.max(1, s.beforePercent - targetPct);
          if (diff >= 2 || (slotIdx < 2 && beforeStr !== afterStr)) {
            logParser.feedDamage(slotIdent, beforeStr, afterStr, `${diff}%`, t);
            s.lastConfirmedPercent = targetPct;
            s.lastConfirmedHpStr = afterStr;
          }
        } else if (
          targetPct > s.beforePercent ||
          (beforeStr !== afterStr && targetPct >= s.beforePercent)
        ) {
          const gain = Math.max(1, targetPct - s.beforePercent);
          if (gain >= 2 || (slotIdx < 2 && beforeStr !== afterStr)) {
            logParser.feedHeal(slotIdent, beforeStr, afterStr, `${gain}%`, t);
            s.lastConfirmedPercent = targetPct;
            s.lastConfirmedHpStr = afterStr;
          }
        }
        s.beforePercent = null;
        s.beforeHpStr = null;
      }
    };

    const flushPendingDamages = (t: number) => {
      flushSlotHpChange(0, t);
      flushSlotHpChange(1, t);
      flushSlotHpChange(2, t);
      flushSlotHpChange(3, t);
    };

    const syncHpStatesFromParser = () => {
      for (const slotIdx of [0, 1, 2, 3] as const) {
        const slotIdent = SLOT_IDENTS[slotIdx];
        const parserHp = logParser.getCurrentSlotHp(slotIdent);
        const s = hpStates[slotIdx]!;
        if (parserHp && parserHp !== s.lastConfirmedHpStr) {
          const pct = logParser.getLastKnownHpPercent(slotIdent);
          s.lastConfirmedHpStr = parserHp;
          s.lastConfirmedPercent = pct;
          s.currentHpStr = parserHp;
          s.currentPercent = pct;
          s.beforeHpStr = null;
          s.beforePercent = null;
        }
      }
    };

    let prevMessageHash = 0;
    let prevAbilityHash = 0;
    let prevTargetHash = 0;
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

    // 初回の先読みスケジュールを投入
    frameSource.prefetchSchedule?.([0, sampleStepSec, sampleStepSec * 2, sampleStepSec * 3]);

    for (let tSec = 0; tSec <= durationSec; tSec += sampleStepSec) {
      if (signal?.aborted) {
        throw new Error("Video analysis aborted");
      }

      // 次の3ステップ分を裏の <video> プールで並列シーク＆投機的OCR開始させる
      frameSource.prefetchSchedule?.([
        tSec + sampleStepSec,
        tSec + sampleStepSec * 2,
        tSec + sampleStepSec * 3,
      ]);

      await frameSource.seek(tSec);
      const captured = await frameSource.captureFrame();
      // 次のステップのプリフェッチ枠が1つ空いたので即補充
      frameSource.prefetchSchedule?.([
        tSec + sampleStepSec,
        tSec + sampleStepSec * 2,
        tSec + sampleStepSec * 3,
        tSec + sampleStepSec * 4,
      ]);

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

      // 0. チームプレビュー画面の走査（対戦相手6体のスプライト＋タイプ自動同定 & P1選出番号1..4の検出）
      if (!logParser.hasLead && frame.phase === "TeamPreview") {
        // Selecting レイアウト（x=1700, y=200）か Preparing レイアウト（x=1470, y=219）かを判定
        const checkCardBody = (x1080: number, y1080: number): boolean => {
          const px = Math.min(captured.width - 1, Math.floor((x1080 / 1920) * captured.width));
          const py = Math.min(captured.height - 1, Math.floor((y1080 / 1080) * captured.height));
          const idx = (py * captured.width + px) * 4;
          const r = captured.rgba[idx] ?? 0;
          const g = captured.rgba[idx + 1] ?? 0;
          const b = captured.rgba[idx + 2] ?? 0;
          return r >= 20 && r <= 75 && g >= 28 && g <= 85 && b >= 32 && b <= 95;
        };
        const isPreparingLayout = !checkCardBody(1700, 200) && checkCardBody(1470, 219);
        const yBase = isPreparingLayout ? 173 : 154;
        const p2SpriteX = isPreparingLayout ? 1388 : 1618;
        const p2Badge1X = isPreparingLayout ? 1518 : 1748;
        const p2Badge2X = isPreparingLayout ? 1568 : 1798;
        const p1SpriteX = isPreparingLayout ? 290 : 60;

        // (a) P2 プレビュー（相手6体）の同定（14x14 スプライトテンプレート＋タイプバッジHSV）
        for (let i = 0; i < 6; i++) {
          const y0 = yBase + i * 126;
          const type1 = sampleBadgeTypeFromRgba(
            captured.rgba,
            captured.width,
            captured.height,
            from1080p(p2Badge1X, y0 + 16, 48, 48),
          );
          const type2 = sampleBadgeTypeFromRgba(
            captured.rgba,
            captured.width,
            captured.height,
            from1080p(p2Badge2X, y0 + 16, 48, 48),
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
          const spriteMatch = matchPokemonSpriteFromRgba(
            captured.rgba,
            captured.width,
            captured.height,
            from1080p(p2SpriteX, y0 + 4, 108, 108),
            types,
          );
          const species = spriteMatch?.identifier ?? resolveSpeciesFromTypes(types);
          if (species) {
            const votes = p2CardVotes[i]!;
            votes.set(species, (votes.get(species) ?? 0) + 1);
          }
        }
        // 各カード位置 (0..5) の最多得票種族を集計
        const votedP2: string[] = [];
        for (let i = 0; i < 6; i++) {
          let bestSlug: string | null = null;
          let bestCount = 0;
          for (const [slug, count] of p2CardVotes[i]!.entries()) {
            if (count > bestCount && !votedP2.includes(slug)) {
              bestCount = count;
              bestSlug = slug;
            }
          }
          if (bestSlug) votedP2.push(bestSlug);
        }
        if (votedP2.length >= p2PreviewSlugs.length) {
          p2PreviewSlugs.length = 0;
          p2PreviewSlugs.push(...votedP2);
        }

        // (b) P1 カード位置 (0..5) -> myTeam 登録インデックスの対応付け（スプライト照合 + OCR）
        if (cardToP1Idx.size < myTeam.length) {
          for (let i = 0; i < Math.min(6, myTeam.length); i++) {
            if (cardToP1Idx.has(i)) continue;
            const y0 = yBase + i * 126;
            const spriteMatch = matchPokemonSpriteFromRgba(
              captured.rgba,
              captured.width,
              captured.height,
              from1080p(p1SpriteX, y0 + 4, 108, 108),
            );
            if (spriteMatch && spriteMatch.score <= 125) {
              const matchedIdx = myTeam.findIndex((m) => {
                const mSlug = m.slug ?? m.identifier ?? "";
                return (
                  mSlug === spriteMatch.identifier ||
                  m.identifier === spriteMatch.identifier ||
                  mSlug.split("-")[0] === spriteMatch.identifier.split("-")[0]
                );
              });
              if (matchedIdx >= 0 && !Array.from(cardToP1Idx.values()).includes(matchedIdx)) {
                cardToP1Idx.set(i, matchedIdx);
              }
            }
          }
        }
        if (cardToP1Idx.size < myTeam.length && !isPreparingLayout) {
          const pendingCards: { i: number; rect: NormalizedRect }[] = [];
          for (let i = 0; i < Math.min(6, myTeam.length); i++) {
            if (!cardToP1Idx.has(i)) {
              const cardRect = from1080p(120, 140 + i * 126 + 15, 320, 50);
              const cardHash = computeRoiLumaHash(
                captured.rgba,
                captured.width,
                captured.height,
                cardRect,
              );
              if (cardHash !== 0 && cardHash !== prevP1CardHashes[i]) {
                prevP1CardHashes[i] = cardHash;
                pendingCards.push({ i, rect: cardRect });
              }
            }
          }
          if (pendingCards.length > 0) {
            const results = await Promise.all(
              pendingCards.map(async ({ i, rect }) => ({
                i,
                text: await frameSource.recognizeRoiText(rect, "message"),
              })),
            );
            for (const { i, text } of results) {
              if (text) {
                const teamIdx = findMyTeamIndex(text);
                if (teamIdx >= 0) {
                  cardToP1Idx.set(i, teamIdx);
                }
              }
            }
          }
        }

        for (const cardI of frame.previewSelectedP1Indices) {
          const p1Idx = resolveCardToP1Idx(cardI);
          if (p1Idx !== null) {
            p1SelectedCardVotes.set(p1Idx, (p1SelectedCardVotes.get(p1Idx) ?? 0) + 1);
          }
        }

        // (c) P1 選出確定番号（1..4）の高精度検出
        // 見せ合い画面の白背景ボックス内（18x24 テンプレート）から正確に 1..4 を検出
        const frameDigits = new Map<number, 1 | 2 | 3 | 4>();
        for (let cardI = 0; cardI < Math.min(6, myTeam.length); cardI++) {
          const res = detectTeamPreviewDigitFromRgba(
            captured.rgba,
            captured.width,
            captured.height,
            cardI,
          );
          if (res !== null) {
            frameDigits.set(cardI, res.digit);
            p1CardDigitVotes[cardI]?.set(
              res.digit,
              (p1CardDigitVotes[cardI]?.get(res.digit) ?? 0) + 1,
            );
            const p1Idx = resolveCardToP1Idx(cardI);
            if (p1Idx !== null) {
              p1SelectionDigits[res.digit - 1] = p1Idx;
            }
          }
        }

        // 1フレーム内で 1..4 の4つの数字が重複なく全て揃った瞬間（完全な選出コマ）を優先検出
        if (frameDigits.size >= 4) {
          const digitsPresent = new Set(frameDigits.values());
          if (
            digitsPresent.has(1) &&
            digitsPresent.has(2) &&
            digitsPresent.has(3) &&
            digitsPresent.has(4)
          ) {
            const completeSelection: number[] = [0, 0, 0, 0];
            for (const [cI, d] of frameDigits.entries()) {
              const pIdx = resolveCardToP1Idx(cI) ?? cI;
              completeSelection[d - 1] = pIdx;
            }
            p1Selection.length = 0;
            p1Selection.push(...completeSelection);
            logParser.setP1Selection(p1Selection);
          }
        } else if (p1SelectionDigits.some((d) => d !== null)) {
          const filled = p1SelectionDigits.filter((d): d is number => d !== null);
          const selectedByTab = Array.from(p1SelectedCardVotes.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([idx]) => idx)
            .filter((idx) => !filled.includes(idx));
          const remaining = myTeam
            .map((_, idx) => idx)
            .filter((idx) => !filled.includes(idx) && !selectedByTab.includes(idx));
          const tentative = [...filled, ...selectedByTab, ...remaining].slice(0, 4);
          p1Selection.length = 0;
          p1Selection.push(...tentative);
          logParser.setP1Selection(p1Selection);
        }
      }

      // 1. ターン開始: コマンド選択画面の「MOVE TIME 45」出現を厳格なトリガーとする
      const canStartTurn =
        frame.isMoveTime45 &&
        timestampMs - lastTurnStartMs >= MIN_TURN_GAP_MS &&
        (logParser.hasLead || tSec >= 45);

      if (canStartTurn) {
        lastTurnStartMs = timestampMs;
        flushPendingDamages(timestampMs);

        // Turn 1 開始時: 先発スロットが未着地の場合、HUD の HP 実数値および選出データから確実に着地させる
        if (
          logParser.turnCount === 0 &&
          (!logParser.hasLead ||
            !logParser.getActiveSlotSlug("p1a") ||
            !logParser.getActiveSlotSlug("p1b"))
        ) {
          const hp0 = frame.hpBars[0].exactHp;
          const hp1 = frame.hpBars[1].exactHp;
          let p1aIdx = -1;
          let p1bIdx = -1;
          if (hp0 !== null) {
            p1aIdx = myTeam.findIndex((_, idx) => getP1MaxHp(idx) === hp0);
          }
          if (hp1 !== null) {
            p1bIdx = myTeam.findIndex((_, idx) => getP1MaxHp(idx) === hp1);
          }
          if (p1aIdx < 0 && p1Selection[0] !== undefined) p1aIdx = p1Selection[0];
          if (p1bIdx < 0 && p1Selection[1] !== undefined) p1bIdx = p1Selection[1];
          if (p1aIdx < 0 && p1SelectionDigits[0] !== null) p1aIdx = p1SelectionDigits[0];
          if (p1bIdx < 0 && p1SelectionDigits[1] !== null) p1bIdx = p1SelectionDigits[1];

          if (p1aIdx >= 0 && p1bIdx >= 0 && p1aIdx !== p1bIdx) {
            logParser.deployLeadsIfUnset([p1aIdx, p1bIdx], Math.max(0, timestampMs - 10000));
          }
        }

        logParser.beginTurn(timestampMs);
      }

      // 1.5. コマンド選択・ターゲット選択UIの読み取り
      // 技選択後にターゲット選択UI（画面右側に技名＋[B] Close ボタン）が表示された際、
      // 実際に確定しようとしている対象技とポケモンを直接読み取る。
      // ※ 技一覧（4ボタン）の過渡状態カーソルは一切読み取らない（誤判定・上書き防止）
      const currentActiveSlot: "p1a" | "p1b" | null =
        frame.activeP1Slot === 0 ? "p1a" : frame.activeP1Slot === 1 ? "p1b" : null;
      if (currentActiveSlot !== null) {
        lastActiveP1Slot = currentActiveSlot;
      }

      if (
        logParser.hasLead &&
        !logParser.currentTurnHasMove() &&
        frame.targetSelectionRoiHash &&
        frame.targetSelectionRoiHash !== prevTargetHash
      ) {
        prevTargetHash = frame.targetSelectionRoiHash;
        const panelText = await frameSource.recognizeRoiText(
          DEFAULT_CHAMPIONS_ROI_LAYOUT.targetSelectionPanel,
          "message",
        );
        if (panelText) {
          const key = normalizeOcrToken(panelText);
          const activeSlot = currentActiveSlot ?? lastActiveP1Slot;
          const slotsToCheck =
            activeSlot === "p1b" ? (["p1b", "p1a"] as const) : (["p1a", "p1b"] as const);

          let matched = false;
          for (const slot of slotsToCheck) {
            const teamIdx = logParser.getActiveSlotTeamIdx(slot);
            if (teamIdx === null) continue;
            const member = myTeam[teamIdx];
            if (!member) continue;

            for (const moveId of member.moves) {
              if (moveId === null) continue;
              const move = moveById.get(moveId);
              if (!move) continue;
              const candidateTokens = [
                normalizeOcrToken(move.identifier),
                ...dictionaries.moves
                  .filter((e) => e.slug === move.identifier)
                  .map((e) => normalizeOcrToken(e.alias)),
              ].filter((t) => t.length >= 2);
              const hit = candidateTokens.some((moveToken) => {
                const minLen = /^[a-z0-9]+$/.test(moveToken) ? 4 : 2;
                return (
                  moveToken.length >= minLen &&
                  (key.includes(moveToken) || approxFind(key, moveToken).score >= 0.75)
                );
              });
              if (hit) {
                logParser.setDeclaredMove(slot, move.identifier);
                matched = true;
                break;
              }
            }
            if (matched) break;
          }
        }
      }

      // 2. HP バー＆数値の追跡（バナー・メッセージ処理の前に現フレームのHUD確定値を反映する）
      if (logParser.hasLead) {
        const isSelectingCommand =
          !logParser.currentTurnHasMove() &&
          (frame.commandTimerVisible ||
            frame.activeP1Slot !== null ||
            frame.selectedMoveIndex !== null ||
            frame.phase === "CommandSelect" ||
            frame.phase === "MoveSelect");

        for (const slotIdx of [0, 1, 2, 3] as const) {
          const slotIdent = SLOT_IDENTS[slotIdx];
          const currentSlug = logParser.getActiveSlotSlug(slotIdent);
          if (!currentSlug) {
            continue;
          }
          if (currentSlug !== prevSlotSlugs[slotIdx]) {
            const oldSlug = prevSlotSlugs[slotIdx];
            prevSlotSlugs[slotIdx] = currentSlug;
            const isMegaEvolution =
              oldSlug !== null &&
              (currentSlug.startsWith(oldSlug) || currentSlug.includes("-mega"));
            const prevConfirmed = isMegaEvolution
              ? (hpStates[slotIdx]?.lastConfirmedPercent ?? 100)
              : logParser.getLastKnownHpPercent(slotIdent);
            const teamIdx = slotIdx < 2 ? logParser.getActiveSlotTeamIdx(slotIdent) : null;
            const maxHp = teamIdx !== null ? getP1MaxHp(teamIdx) : 100;
            const defaultHpStr =
              slotIdx < 2
                ? `${Math.round((maxHp * prevConfirmed) / 100)}/${maxHp}`
                : `${prevConfirmed}%`;
            const prevConfirmedStr = isMegaEvolution
              ? (hpStates[slotIdx]?.lastConfirmedHpStr ?? defaultHpStr)
              : defaultHpStr;
            const existingPercent = hpStates[slotIdx]?.currentPercent;
            const existingHpStr = hpStates[slotIdx]?.currentHpStr;

            hpStates[slotIdx] = {
              currentPercent:
                isMegaEvolution && existingPercent !== null ? existingPercent : prevConfirmed,
              currentHpStr:
                isMegaEvolution && existingHpStr !== null ? existingHpStr : prevConfirmedStr,
              beforePercent: null,
              beforeHpStr: null,
              lastConfirmedPercent: prevConfirmed,
              lastConfirmedHpStr: prevConfirmedStr,
              lastChangeMs: timestampMs,
              wasVisible: false,
            };
          }

          const bar = frame.hpBars[slotIdx];
          const state = hpStates[slotIdx]!;
          if (bar.visible) {
            prevHpBars[slotIdx] = bar.percent;
            const teamIdx = slotIdx < 2 ? logParser.getActiveSlotTeamIdx(slotIdent) : null;
            const maxHp = teamIdx !== null ? getP1MaxHp(teamIdx) : 100;
            const hasValidExactHp =
              slotIdx < 2 &&
              bar.exactHp !== null &&
              bar.exactHp !== undefined &&
              bar.exactHp <= maxHp;
            const effPercent = hasValidExactHp
              ? Math.max(0, Math.min(100, Math.round((bar.exactHp! / maxHp) * 100)))
              : bar.percent;
            const hpStr = hasValidExactHp ? `${bar.exactHp}/${maxHp}` : `${bar.percent}%`;

            if (isSelectingCommand) {
              // コマンド選択画面では4体すべてのHUDが静止表示されるため、基準HPを同期する
              state.currentPercent = effPercent;
              state.currentHpStr = hpStr;
              state.lastConfirmedPercent = effPercent;
              state.lastConfirmedHpStr = hpStr;
              state.beforePercent = null;
              state.beforeHpStr = null;
              logParser.reconcileSlotHp(slotIdent, hpStr);
            } else if (state.currentPercent === null) {
              state.currentPercent = effPercent;
              state.currentHpStr = hpStr;
              state.lastChangeMs = timestampMs;
            } else {
              const isPremature = !logParser.currentTurnHasMove();
              const prevExact =
                slotIdx < 2 && state.currentHpStr
                  ? Number.parseInt(state.currentHpStr.split("/")[0] ?? "", 10)
                  : Number.NaN;
              const currExact = hasValidExactHp ? bar.exactHp! : Number.NaN;
              const exactDropped =
                Number.isFinite(prevExact) &&
                Number.isFinite(currExact) &&
                currExact <= prevExact - 2;
              const exactRose =
                Number.isFinite(prevExact) &&
                Number.isFinite(currExact) &&
                currExact >= prevExact + 2;

              if (effPercent <= state.currentPercent - 3 || exactDropped) {
                if (!isPremature) {
                  if (state.beforePercent === null) {
                    state.beforePercent = state.lastConfirmedPercent;
                    state.beforeHpStr = state.lastConfirmedHpStr;
                  }
                  state.currentPercent = effPercent;
                  state.currentHpStr = hpStr;
                  state.lastChangeMs = timestampMs;
                }
              } else if (effPercent >= state.currentPercent + 3 || exactRose) {
                if (!isPremature) {
                  if (state.beforePercent === null) {
                    state.beforePercent = state.lastConfirmedPercent;
                    state.beforeHpStr = state.lastConfirmedHpStr;
                  }
                  state.currentPercent = effPercent;
                  state.currentHpStr = hpStr;
                  state.lastChangeMs = timestampMs;
                }
              } else if (
                state.beforePercent !== null &&
                timestampMs - state.lastChangeMs >= HP_SETTLE_MS
              ) {
                flushSlotHpChange(slotIdx, timestampMs);
              }
            }
            state.wasVisible = true;
          } else {
            // HUD ポップアップが閉じた瞬間に未確定の HP 変化を確定させる（連続ポップアップの混同防止）
            if (state.wasVisible && state.beforePercent !== null && !isSelectingCommand) {
              flushSlotHpChange(slotIdx, timestampMs);
            }
            state.wasVisible = false;
          }
        }
      }

      // 3. 特性発動バナー（`<Pokémon>'s <特性>` / `<アイテム>`）
      if (
        frame.phase !== "TeamPreview" &&
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
          if (logParser.feedBanner(rawBanner, bannerSide, timestampMs)) {
            syncHpStatesFromParser();
            prevMessageHash = 0;
          }
        }
      }

      // 4. 下部メッセージ枠
      if (
        frame.phase !== "TeamPreview" &&
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
          const normMsg = normalizeOcrToken(rawMsg);
          const isActionMessage =
            logParser.shouldFlushPendingDamages(rawMsg) ||
            /\b(used|sent out|go!|withdrew|come back|fainted|reacting to|mega evolved)\b/i.test(
              rawMsg,
            ) ||
            /使[つっ]|繰り?出|くり出|くりだ|ゆけ|行け|戻れ|引っこめ|ひっこめ|たおれ|反応|メガシンカ|すなおこし|グラスメイカー/u.test(
              normMsg,
            );
          const isMenuPrompt =
            /what will|select a move|select a target|fight|pokémon|run|bag|move info/i.test(
              rawMsg,
            ) ||
            /どうする|技を選ぶ|対象を選ぶ|たたかう|ポケモン|にげる/u.test(normMsg) ||
            (!logParser.currentTurnHasMove() &&
              (frame.commandTimerVisible ||
                frame.phase === "MoveSelect" ||
                frame.phase === "CommandSelect" ||
                frame.activeP1Slot !== null) &&
              !isActionMessage);

          const ratingMatch = /(?:rating|レート)[:\s：]*([0-9,]+\.[0-9]+|[0-9]{4})/iu.exec(rawMsg);
          if (ratingMatch?.[1]) {
            const parsed = Number.parseFloat(ratingMatch[1].replace(/,/g, ""));
            if (Number.isFinite(parsed) && parsed >= 1000 && parsed <= 3000) {
              detectedRating = parsed;
            }
          }

          if (
            lower.includes("you defeated") ||
            lower.includes("forfeit") ||
            approxFind(normMsg, normalizeOcrToken("勝負に勝った")).score >= 0.75 ||
            approxFind(normMsg, normalizeOcrToken("降参が選ばれました")).score >= 0.75
          ) {
            matchResult = "WIN";
          } else if (
            lower.includes("you lost") ||
            approxFind(normMsg, normalizeOcrToken("勝負に負けた")).score >= 0.75 ||
            approxFind(normMsg, normalizeOcrToken("目の前が真っ暗になった")).score >= 0.75
          ) {
            matchResult = "LOSS";
          }

          if (!isMenuPrompt) {
            if (isActionMessage) {
              flushPendingDamages(timestampMs);
            }
            if (logParser.feedMessage(rawMsg, timestampMs)) {
              syncHpStatesFromParser();
            }
          }
        }
      }

      onProgress?.({
        currentTimeSec: tSec,
        durationSec,
        sampledFrames,
        detectedTurns: logParser.turnCount,
        currentPhase: frame.phase,
      });
    }

    flushPendingDamages(durationSec * 1000);

    // P1選出: 見せ合い画面の選択番号 (1..4) の最多得票カードを順に貪欲割り当て
    const digitAssignments = new Map<1 | 2 | 3 | 4, number>();
    const assignedCards = new Set<number>();
    for (const d of [1, 2, 3, 4] as const) {
      let bestCard = -1;
      let bestVotes = 0;
      for (let cardI = 0; cardI < Math.min(6, myTeam.length); cardI++) {
        if (assignedCards.has(cardI)) continue;
        const v = p1CardDigitVotes[cardI]?.get(d) ?? 0;
        if (v > bestVotes) {
          bestVotes = v;
          bestCard = cardI;
        }
      }
      if (bestCard >= 0 && bestVotes > 0) {
        digitAssignments.set(d, bestCard);
        assignedCards.add(bestCard);
      }
    }

    const assignedSelection: number[] = [];
    for (const d of [1, 2, 3, 4] as const) {
      const cI = digitAssignments.get(d);
      if (cI !== undefined) {
        assignedSelection.push(resolveCardToP1Idx(cI));
      }
    }

    const selectedByTab = Array.from(p1SelectedCardVotes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([idx]) => idx)
      .filter((idx) => !assignedSelection.includes(idx));
    const remaining = myTeam
      .map((_, idx) => idx)
      .filter((idx) => !assignedSelection.includes(idx) && !selectedByTab.includes(idx));

    p1Selection.length = 0;
    p1Selection.push(...assignedSelection, ...selectedByTab, ...remaining);
    p1Selection.splice(4);
    logParser.setP1Selection(p1Selection);

    // 見せ合いの選出情報やパーティ技情報がある場合、確定情報に基づいてスロット・技所有者を正しく上書き
    logParser.finalizeLeadAndSlots(p1Selection, p2PreviewSlugs);
    const finalizedSelection = logParser.getP1Selection();
    if (finalizedSelection.length > 0) {
      p1Selection.length = 0;
      p1Selection.push(...finalizedSelection);
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

    // PBN 文字列にレンダリングする前に、構造化データに対して fp-ts Validated でサニタイズ・検証を実行
    const sanitizedResult = sanitizeAndValidateBattleLog(
      logParser.getTurns(),
      logParser.getLeadEvents(),
    );

    if (isLeft(sanitizedResult)) {
      const errorMsg = sanitizedResult.left.map((e) => e.message).join("\n");
      throw new Error(`Battle analysis validation failed:\n${errorMsg}`);
    }

    const sanitizedTurns = sanitizedResult.right;
    pbnLines.push(...logParser.render(sanitizedTurns));

    const pbnText = pbnLines.join("\n").trim();
    const summary = parsePbnToAnalysisSummary(pbnText);

    return {
      ...summary,
      totalSampledFrames: sampledFrames,
    };
  }
}

/**
 * ローカル動画ファイルをチャンクシーク方式で走査し、
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
