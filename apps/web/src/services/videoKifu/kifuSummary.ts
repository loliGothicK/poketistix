import * as Sentry from "@sentry/nextjs";
import { withSpan } from "@/lib/otel";
import { championsPokemonByIdentifier, championsPokemonList } from "@/data/champions-pokemon";
import { moveByIdentifier, MoveList } from "@/data/moves";
import { abilityByIdentifier, abilityList } from "@/data/abilities";
import { itemByIdentifier, itemList } from "@/data/items";

const megaEvolutionItemIdentifiers = itemList
  .filter((item) => item.category === "mega-evolution")
  .map((item) => item.identifier);

/** メガシンカ種族スラッグ（例: `salamence-mega`, `charizard-mega-y`）に対応するメガストーン識別子を解決する */
function resolveMegaStoneForMegaSlug(megaSlug: string): string | null {
  const m = /^(.+?)-mega(?:-(x|y|z))?$/.exec(megaSlug.toLowerCase());
  if (!m?.[1]) return null;
  const base = m[1];
  const variant = m[2] ?? null;
  const candidates = megaEvolutionItemIdentifiers.filter((it) => {
    if (variant) {
      if (!it.endsWith(`-${variant}`)) return false;
    } else if (it.endsWith("-x") || it.endsWith("-y") || it.endsWith("-z")) {
      return false;
    }
    const stem = it.replace(/-(x|y|z)$/, "").replace(/nite$|ite$/, "");
    return (
      it.startsWith(base.slice(0, Math.min(5, base.length))) ||
      (stem.length >= 3 && base.startsWith(stem))
    );
  });
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

/** メガ形態スラッグからベース種族スラッグへ正規化する（例: `gardevoir-mega` → `gardevoir`） */
function stripMegaSuffix(speciesSlug: string): string {
  return speciesSlug.replace(/-mega(?:-(?:x|y|z))?$/, "");
}
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
      const enBase = enName.replace(/[（(].*$/, "").trim();
      if (enBase && enBase !== enName) {
        species.push({ slug: p.identifier, alias: enBase });
      }
    }
    if (jaName && !jaName.startsWith("pokemon.")) {
      species.push({ slug: p.identifier, alias: jaName });
      const jaBase = jaName.replace(/[（(].*$/, "").trim();
      if (jaBase && jaBase !== jaName) {
        species.push({ slug: p.identifier, alias: jaBase });
      }
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
      const revealedItemByOpponent: Record<string, string> = {};
      const reviewEvents: VideoReviewEventItem[] = [];
      const activeOpponentBySlot: [string | null, string | null] = [null, null];
      const activeMegaFormBySlot: [string | null, string | null] = [null, null];
      let inStateSection = false;

      const resolveBaseOpponentSlug = (rawSpecies: string): string => {
        const cleaned = rawSpecies.trim().toLowerCase();
        if (opponentSlugs.includes(cleaned)) return cleaned;
        const stripped = stripMegaSuffix(cleaned);
        if (opponentSlugs.includes(stripped)) return stripped;
        return stripped;
      };

      const recordOpponentItem = (actorSlug: string, rawItem: string) => {
        const itemSlug = rawItem.trim().toLowerCase();
        if (!itemSlug || !itemByIdentifier.has(itemSlug)) return;
        revealedItemByOpponent[actorSlug] = itemSlug;
      };

      const recordOpponentAbility = (actorSlug: string, rawAbility: string) => {
        const abilitySlug = rawAbility.trim().toLowerCase();
        const ability = abilityByIdentifier.get(abilitySlug);
        if (!ability) return;
        const pokemon = championsPokemonByIdentifier.get(actorSlug);
        if (pokemon && !pokemon.abilities.includes(ability.id)) return;
        revealedAbilityByOpponent[actorSlug] = ability.identifier;
      };

      const recordOpponentMove = (actorSlug: string, rawMove: string, megaSlug?: string | null) => {
        const moveSlug = rawMove.trim().toLowerCase();
        const move = moveByIdentifier.get(moveSlug);
        if (!move) return;
        const pokemon = championsPokemonByIdentifier.get(actorSlug);
        const megaPokemon = megaSlug ? championsPokemonByIdentifier.get(megaSlug) : undefined;
        const allowedIds = new Set<number>([
          ...(pokemon?.moves ?? []),
          ...(megaPokemon?.moves ?? []),
        ]);
        if (allowedIds.size > 0 && !allowedIds.has(move.id)) return;
        const list = revealedMovesByOpponent[actorSlug] ?? [];
        if (!list.includes(move.identifier) && list.length < 4) {
          revealedMovesByOpponent[actorSlug] = [...list, move.identifier];
        }
      };

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
          const segments = line
            .slice("@p2 ".length)
            .split("|")
            .map((s) => s.trim());
          const seg0 = segments[0] ?? "";
          const [leftPart, itemPart] = seg0.split("@").map((s) => s.trim());
          const toks = (leftPart ?? "").split(/\s+/);
          const slug = (toks.length >= 2 ? toks[1] : toks[0])?.trim();
          if (slug) {
            if (!opponentSlugs.includes(slug)) {
              opponentSlugs.push(slug);
            }
            if (itemPart) {
              recordOpponentItem(slug, itemPart);
            }
            // OTS 形式: `@p2 0 torkoal @ charcoal | drought | eruption, heat-wave, ...`
            for (const seg of segments.slice(1)) {
              if (!seg) continue;
              if (seg.includes(",")) {
                for (const m of seg.split(",")) {
                  recordOpponentMove(slug, m);
                }
              } else if (abilityByIdentifier.has(seg.toLowerCase())) {
                recordOpponentAbility(slug, seg);
              } else if (moveByIdentifier.has(seg.toLowerCase())) {
                recordOpponentMove(slug, seg);
              }
            }
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

        if (line.startsWith("@state")) {
          inStateSection = true;
          continue;
        }

        if (
          line.startsWith("@cmd ") ||
          line.startsWith("@p2cmd ") ||
          line.startsWith("@field") ||
          line.startsWith("@eval") ||
          line.startsWith("@best") ||
          line.startsWith("@quality")
        ) {
          inStateSection = false;
          continue;
        }

        if (inStateSection) {
          if (line.startsWith("|") || line === "p1:" || line === "p2:") {
            continue;
          }
          const stateSlotMatch = /^(p2[ab]):\s+([a-z0-9-]+)\s+(\S+)/i.exec(line);
          if (stateSlotMatch?.[1] && stateSlotMatch[2]) {
            const slotIdx = stateSlotMatch[1].toLowerCase() === "p2b" ? 1 : 0;
            const rawSp = stateSlotMatch[2].toLowerCase();
            const hpTok = stateSlotMatch[3]?.toLowerCase() ?? "";
            if (hpTok !== "fnt" && rawSp !== "?") {
              const baseSlug = resolveBaseOpponentSlug(rawSp);
              activeOpponentBySlot[slotIdx] = baseSlug;
              activeMegaFormBySlot[slotIdx] = rawSp.includes("-mega") ? rawSp : null;
              if (rawSp.includes("-mega")) {
                const stone = resolveMegaStoneForMegaSlug(rawSp);
                if (stone) recordOpponentItem(baseSlug, stone);
              }
            }
            continue;
          }
          if (/^p1[ab]:/i.test(line)) {
            continue;
          }
          inStateSection = false;
        }

        if (line.startsWith("|")) {
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

        // 相手の先発・後発・使用技・特性・持ち物の自動集計
        const bracketMatch = /\[([^\]]+)\]/.exec(line);
        const bracketCause = bracketMatch?.[1]?.trim().toLowerCase() ?? null;
        const cleanEvent = line
          .replace(/\s*@t=\d+ms|\s*@conf=[0-9.]+|\s*@review/g, "")
          .replace(/\s*\[[^\]]+\]/g, "")
          .replace(/\s*\{[^}]*\}?$/g, "")
          .trim();
        const tokens = cleanEvent.split(/\s+/);
        const verb = tokens[0]?.toLowerCase();

        if (verb === "switch" && tokens.length >= 3) {
          const ident = tokens[1]?.toLowerCase() ?? "";
          const rawSpeciesSlug = tokens[2]?.startsWith("#") ? (tokens[3] ?? "") : (tokens[2] ?? "");
          if (ident.startsWith("p2") && rawSpeciesSlug) {
            const slotIdx = ident === "p2b" ? 1 : 0;
            const speciesSlug = resolveBaseOpponentSlug(rawSpeciesSlug);
            activeOpponentBySlot[slotIdx] = speciesSlug;
            activeMegaFormBySlot[slotIdx] = rawSpeciesSlug.includes("-mega")
              ? rawSpeciesSlug.toLowerCase()
              : null;
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
              recordOpponentMove(actorSlug, moveSlug, activeMegaFormBySlot[slotIdx]);
            }
          }
        } else if (verb === "ability" && tokens.length >= 3) {
          const ident = tokens[1]?.toLowerCase() ?? "";
          const abilitySlug = tokens[2] ?? "";
          if (ident.startsWith("p2") && abilitySlug) {
            const slotIdx = ident === "p2b" ? 1 : 0;
            const actorSlug = activeOpponentBySlot[slotIdx];
            if (actorSlug) {
              recordOpponentAbility(actorSlug, abilitySlug);
            }
          }
        } else if (verb === "item" && tokens.length >= 3) {
          const ident = tokens[1]?.toLowerCase() ?? "";
          const itemSlug = tokens[2] ?? "";
          const modifier = tokens[3]?.toLowerCase() ?? "";
          // `item p2b <item> off` は Knock Off 等で対象側のアイテムをはたき落としたログのため自身の持ち物と混同しない
          if (ident.startsWith("p2") && itemSlug && modifier !== "off") {
            const slotIdx = ident === "p2b" ? 1 : 0;
            const actorSlug = activeOpponentBySlot[slotIdx];
            if (actorSlug) {
              recordOpponentItem(actorSlug, itemSlug);
            }
          }
        } else if (verb === "mega" && tokens.length >= 3) {
          const ident = tokens[1]?.toLowerCase() ?? "";
          const megaSlug = tokens[2]?.toLowerCase() ?? "";
          const explicitItem = tokens[3] ?? "";
          if (ident.startsWith("p2") && megaSlug) {
            const slotIdx = ident === "p2b" ? 1 : 0;
            const actorSlug = activeOpponentBySlot[slotIdx] ?? resolveBaseOpponentSlug(megaSlug);
            activeOpponentBySlot[slotIdx] = actorSlug;
            activeMegaFormBySlot[slotIdx] = megaSlug;
            const stone = explicitItem || resolveMegaStoneForMegaSlug(megaSlug);
            if (stone) {
              recordOpponentItem(actorSlug, stone);
            }
          }
        } else if ((verb === "heal" || verb === "damage") && tokens.length >= 2 && bracketCause) {
          const ident = tokens[1]?.toLowerCase() ?? "";
          if (ident.startsWith("p2")) {
            const slotIdx = ident === "p2b" ? 1 : 0;
            const actorSlug = activeOpponentBySlot[slotIdx];
            if (actorSlug) {
              recordOpponentItem(actorSlug, bracketCause);
              recordOpponentAbility(actorSlug, bracketCause);
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
        revealedItemByOpponent,
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
      itemSlug: summary.revealedItemByOpponent[slug] ?? null,
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
    notes: "",
  };
}
