import * as Sentry from "@sentry/nextjs";
import { withSpan } from "@/lib/otel";
import { championsPokemonByIdentifier, championsPokemonList } from "@/data/champions-pokemon";
import { MoveList } from "@/data/moves";
import { abilityList } from "@/data/abilities";
import { itemList } from "@/data/items";
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
import type {
  ChampionsEntityDictionaries,
  LocalizedEntityAlias,
  VideoKifuAnalysisSummary,
  VideoReviewEventItem,
} from "./types";

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

        if (
          line.startsWith("@cmd ") ||
          line.startsWith("@p2cmd ") ||
          line.startsWith("@field") ||
          line.startsWith("@state") ||
          line.startsWith("@eval") ||
          line.startsWith("@best") ||
          line.startsWith("@quality") ||
          line.startsWith("|")
        ) {
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
