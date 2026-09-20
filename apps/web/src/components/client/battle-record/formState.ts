import type { TrainedPokemon } from "@/store/team/team";
import type {
  BattleFormat,
  BattleRecord,
  BattleRecordInput,
  BattleResult,
  OpponentSelectionRole,
} from "@/store/battle-record/battleRecord";
import {
  emptySelection,
  selectionFromIndices,
  selectionToIndices,
  type Selection,
} from "./selection";

/** 記録フォーム内の相手個体（クライアント側の下書き） */
export interface OpponentDraft {
  /** React リスト用の安定キー */
  readonly key: string;
  readonly pokemonSlug: string;
  readonly itemSlug: string | null;
  readonly abilitySlug: string | null;
  readonly moves: readonly string[];
  readonly selectionRole: OpponentSelectionRole | null;
  readonly notes: string;
}

/** 記録フォーム全体の下書き */
export interface BattleRecordDraft {
  readonly result: BattleResult;
  readonly teamId: string | null;
  readonly myTeam: readonly TrainedPokemon[];
  /** 選出（先発/後発） */
  readonly selection: Selection;
  /** レート（数値入力の生文字列） */
  readonly rating: string;
  readonly notes: string;
  /** datetime-local 文字列（"YYYY-MM-DDTHH:mm"） */
  readonly playedAt: string;
  readonly opponents: readonly OpponentDraft[];
  readonly tags: readonly string[];
}

let keySeq = 0;
export const nextOpponentKey = (): string => {
  keySeq += 1;
  return `opp-${Date.now()}-${keySeq}`;
};

const pad = (n: number): string => String(n).padStart(2, "0");

/** Date を datetime-local の入力値（ローカル時刻）に変換 */
export const dateToLocalInput = (date: Date): string => {
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const isoToLocalInput = (iso: string): string => dateToLocalInput(new Date(iso));

/** 空の下書き（新規記録）。played_at は現在時刻で埋める */
export const emptyDraft = (params?: {
  readonly teamId?: string | null;
  readonly myTeam?: readonly TrainedPokemon[];
}): BattleRecordDraft => ({
  result: "win",
  teamId: params?.teamId ?? null,
  myTeam: params?.myTeam ?? [],
  selection: emptySelection,
  rating: "",
  notes: "",
  playedAt: dateToLocalInput(new Date()),
  opponents: [],
  tags: [],
});

/** 既存レコードから編集用の下書きを作る */
export const draftFromRecord = (record: BattleRecord, format: BattleFormat): BattleRecordDraft => ({
  result: record.result,
  teamId: record.teamId,
  myTeam: [...record.myTeam],
  selection: selectionFromIndices(record.mySelection, format),
  rating: record.rating === null ? "" : String(record.rating),
  notes: record.notes ?? "",
  playedAt: isoToLocalInput(record.playedAt),
  opponents: record.opponents.map((opponent) => ({
    key: nextOpponentKey(),
    pokemonSlug: opponent.pokemonSlug,
    itemSlug: opponent.itemSlug,
    abilitySlug: opponent.abilitySlug,
    moves: opponent.moves ? [...opponent.moves] : [],
    selectionRole: opponent.selectionRole,
    notes: opponent.notes ?? "",
  })),
  tags: [...record.tags],
});

const emptyToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseRating = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/** 下書きを API 入力（BattleRecordInput）へ変換する */
export const draftToInput = (draft: BattleRecordDraft, seasonId: string): BattleRecordInput => ({
  seasonId,
  teamId: draft.teamId ? emptyToNull(draft.teamId) : null,
  result: draft.result,
  myTeam: (draft.myTeam ?? []).filter(
    (m) => m !== null && m !== undefined,
  ) as unknown as BattleRecordInput["myTeam"],
  mySelection: selectionToIndices(draft.selection),
  rating: parseRating(draft.rating),
  notes: emptyToNull(draft.notes),
  playedAt: (() => {
    if (!draft.playedAt || typeof draft.playedAt !== "string") return null;
    const trimmed = draft.playedAt.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  })(),
  opponents: draft.opponents.map((opponent, slotIndex) => ({
    slotIndex,
    pokemonSlug: opponent.pokemonSlug.trim(),
    itemSlug: opponent.itemSlug ? emptyToNull(opponent.itemSlug) : null,
    abilitySlug: opponent.abilitySlug ? emptyToNull(opponent.abilitySlug) : null,
    moves: (() => {
      const validMoves = (opponent.moves ?? []).map((m) => m.trim()).filter((m) => m.length > 0);
      return validMoves.length > 0 ? validMoves : null;
    })(),
    selectionRole: opponent.selectionRole,
    notes: emptyToNull(opponent.notes),
  })),
  tags: (draft.tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0),
});
