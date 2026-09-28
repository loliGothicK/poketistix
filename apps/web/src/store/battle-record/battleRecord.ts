import * as v from "valibot";
import { atomWithStorage } from "jotai/utils";
import type { TrainedPokemon } from "@/store/team/team";
import type { BattleFormat, BattleResult, OpponentSelectionRole } from "@/lib/db/schema";

// =====================================================================
// 【一生残るAtom（純粋なクライアント状態）】
// 選択中のシーズンIDはUIの状態。リロード後も維持するためlocalStorageに永続化。
// シーズンが削除されていた場合は BattleRecordPage 側でフォールバック。
// =====================================================================
export const selectedSeasonIdAtom = atomWithStorage<string | null>(
  "battle_record_selected_season_id",
  null,
);

export type { BattleFormat, BattleResult, OpponentSelectionRole };

// =====================================================================
// DTO（クライアント⇔サーバ間でやり取りするシリアライズ済みの形）
// 設計: .design/battle-records.md
// =====================================================================

/** シーズン / レギュレーション */
export interface Season {
  readonly id: string;
  readonly name: string;
  readonly format: BattleFormat;
  readonly ruleMark: string | null;
  /** "YYYY-MM-DD" */
  readonly startedAt: string | null;
  /** "YYYY-MM-DD" */
  readonly endedAt: string | null;
  /** ISO 8601 */
  readonly createdAt: string;
  /** ISO 8601 */
  readonly updatedAt: string;
}

/** 相手個体（正規化された子レコード） */
export interface BattleRecordOpponent {
  readonly slotIndex: number;
  readonly pokemonSlug: string;
  readonly itemSlug: string | null;
  readonly abilitySlug: string | null;
  readonly moves: readonly string[] | null;
  readonly selectionRole: OpponentSelectionRole | null;
  readonly notes: string | null;
}

/** 対戦記録1試合 */
export interface BattleRecord {
  readonly id: string;
  readonly seasonId: string;
  /** 記録に使用したチーム（任意） */
  readonly teamId: string | null;
  readonly result: BattleResult;
  readonly myTeam: readonly TrainedPokemon[];
  readonly mySelection: readonly number[] | null;
  /** その試合終了時点のレート */
  readonly rating: number | null;
  readonly notes: string | null;
  /** ISO 8601 */
  readonly playedAt: string;
  readonly opponents: readonly BattleRecordOpponent[];
  readonly tags: readonly string[];
  /** ISO 8601 */
  readonly createdAt: string;
  /** ISO 8601 */
  readonly updatedAt: string;
}

// =====================================================================
// 入力バリデーション（Valibot）
// =====================================================================

/** "YYYY-MM-DD" 形式の日付文字列 */
const dateString = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"));

const seasonInputObject = v.object({
  id: v.optional(v.pipe(v.string(), v.minLength(1))),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  format: v.picklist(["singles", "doubles"] as const),
  ruleMark: v.nullish(v.pipe(v.string(), v.trim(), v.minLength(1))),
  startedAt: v.nullish(dateString),
  endedAt: v.nullish(dateString),
});

export const seasonInputSchema = seasonInputObject;

export type SeasonInput = v.InferOutput<typeof seasonInputSchema>;

/** PATCH 用: id 以外を部分更新 */
export const seasonUpdateSchema = v.partial(v.omit(seasonInputObject, ["id"]));

export type SeasonUpdate = v.InferOutput<typeof seasonUpdateSchema>;

export const opponentInputSchema = v.object({
  slotIndex: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)),
  pokemonSlug: v.pipe(v.string(), v.trim(), v.minLength(1)),
  itemSlug: v.nullish(v.pipe(v.string(), v.trim(), v.minLength(1))),
  abilitySlug: v.nullish(v.pipe(v.string(), v.trim(), v.minLength(1))),
  moves: v.nullish(v.array(v.pipe(v.string(), v.trim(), v.minLength(1)))),
  selectionRole: v.nullish(v.picklist(["lead", "back"] as const)),
  notes: v.nullish(v.string()),
});

const battleRecordInputObject = v.pipe(
  v.object({
    id: v.optional(v.pipe(v.string(), v.minLength(1))),
    seasonId: v.pipe(v.string(), v.minLength(1)),
    teamId: v.nullish(v.pipe(v.string(), v.minLength(1))),
    result: v.picklist(["win", "loss", "draw"] as const),
    // 中身は TrainedPokemon をクライアントが保証。ここでは構造のみ検証。
    myTeam: v.pipe(v.array(v.looseObject({})), v.maxLength(6)),
    mySelection: v.nullish(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)))),
    rating: v.nullish(v.pipe(v.number(), v.minValue(0), v.maxValue(100000))),
    notes: v.nullish(v.string()),
    /** ISO 8601。省略時はサーバ側で now() */
    playedAt: v.nullish(v.pipe(v.string(), v.isoTimestamp())),
    opponents: v.pipe(
      v.array(opponentInputSchema),
      v.maxLength(6),
      v.check(
        (arr) => new Set(arr.map((o) => o.slotIndex)).size === arr.length,
        "slotIndex must be unique",
      ),
    ),
    tags: v.nullish(v.array(v.pipe(v.string(), v.trim(), v.minLength(1)))),
  }),
);

export const battleRecordInputSchema = battleRecordInputObject;

export type BattleRecordInput = v.InferOutput<typeof battleRecordInputSchema>;

/** PATCH 用: id/seasonId 以外を部分更新 */
export const battleRecordUpdateSchema = v.partial(
  v.omit(
    v.object({
      id: v.optional(v.pipe(v.string(), v.minLength(1))),
      seasonId: v.pipe(v.string(), v.minLength(1)),
      teamId: v.nullish(v.pipe(v.string(), v.minLength(1))),
      result: v.picklist(["win", "loss", "draw"] as const),
      myTeam: v.pipe(v.array(v.looseObject({})), v.maxLength(6)),
      mySelection: v.nullish(
        v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5))),
      ),
      rating: v.nullish(v.pipe(v.number(), v.minValue(0), v.maxValue(100000))),
      notes: v.nullish(v.string()),
      playedAt: v.nullish(v.pipe(v.string(), v.isoTimestamp())),
      opponents: v.pipe(
        v.array(opponentInputSchema),
        v.maxLength(6),
        v.check(
          (arr) => new Set(arr.map((o) => o.slotIndex)).size === arr.length,
          "slotIndex must be unique",
        ),
      ),
      tags: v.nullish(v.array(v.pipe(v.string(), v.trim(), v.minLength(1)))),
    }),
    ["id", "seasonId"],
  ),
);

export type BattleRecordUpdate = v.InferOutput<typeof battleRecordUpdateSchema>;

/**
 * シーズン一覧から最新のシーズンを取得する。
 * startedAt が指定されている場合は startedAt の新しい順、
 * そうでない場合は createdAt の新しい順（または降順リストの先頭）を優先する。
 */
export function getLatestSeason(seasons: readonly Season[]): Season | null {
  if (seasons.length === 0) return null;
  return (
    [...seasons].sort((a, b) => {
      // startedAt が両方ある場合は startedAt 比較
      if (a.startedAt && b.startedAt) {
        const diff = b.startedAt.localeCompare(a.startedAt);
        if (diff !== 0) return diff;
      } else if (a.startedAt) {
        return -1;
      } else if (b.startedAt) {
        return 1;
      }
      // createdAt 比較
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    })[0] ?? null
  );
}
