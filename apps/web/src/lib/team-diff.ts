import { createPatch, applyPatch } from "diff";

import type { TrainedPokemon } from "@/store/team/team";

const FILE_NAME = "team.txt";

/**
 * チーム改訂のフルスナップショット（jsonb `snapshot` カラムの型）。
 * 復元はこのスナップショット単体で完結する。差分チェーンの累積適用は不要。
 */
export interface TeamSnapshot {
  readonly name: string;
  readonly description: string;
  readonly pokepaste: string;
  readonly members: readonly (TrainedPokemon | null)[];
}

export interface FieldChange<T> {
  readonly from: T;
  readonly to: T;
}

export type MemberChangeKind = "added" | "removed" | "replaced" | "updated";

/**
 * スロット単位の変更内容。変更のあったスロットのみ格納する。
 */
export interface MemberChange {
  readonly slot: number;
  readonly kind: MemberChangeKind;
  readonly identifierFrom: string | null;
  readonly identifierTo: string | null;
  readonly changedFields: readonly string[];
  readonly from: TrainedPokemon | null;
  readonly to: TrainedPokemon | null;
}

/**
 * セマンティック差分（jsonb `diff` カラムの型）。
 * キーは変更があった場合のみ存在する。Postgres でのクエリ例:
 * - 名前変更: `diff ? 'name'`
 * - 追加のみ: `diff->'members' @> '[{"kind":"added"}]'`
 * - 特定ポケモンを含むスナップショット: `snapshot->'members' @> '[{"identifier":"pikachu"}]'`
 */
export interface TeamDiff {
  readonly name?: FieldChange<string>;
  readonly description?: FieldChange<string>;
  /** pokepaste 全文は snapshot 側に保持し、diff には変更有無フラグのみ持つ */
  readonly pokepasteChanged: boolean;
  readonly members: readonly MemberChange[];
  /** オプションの commit message（power user 向け）。diff jsonb に埋め込む */
  readonly message?: string;
}

const normalizeText = (value: string | undefined): string => value?.trim() ?? "";

const normalizeMembers = (
  members: readonly (TrainedPokemon | null)[],
): readonly (TrainedPokemon | null)[] => {
  const next = [...members];
  while (next.length < 6) next.push(null);
  return next.slice(0, 6);
};

export function buildTeamSnapshot(
  team: {
    readonly name: string;
    readonly description?: string;
    readonly members: readonly (TrainedPokemon | null)[];
  },
  pokepaste: string,
): TeamSnapshot {
  return {
    name: team.name.trim(),
    description: normalizeText(team.description),
    pokepaste: pokepaste.trim(),
    members: normalizeMembers(team.members),
  };
}

/**
 * TrainedPokemon のプロパティをソート・正規化し、DB(jsonb)保存時やクライアント間での
 * キー順序の差異・undefined/null 揺れによる誤検知を排除する。
 */
export function canonicalizePokemon(
  pokemon: TrainedPokemon | null,
): Record<string, unknown> | null {
  if (!pokemon) return null;
  return {
    ability: pokemon.ability ?? null,
    description: (pokemon.description ?? "").trim(),
    evs: {
      atk: Number(pokemon.evs?.atk ?? 0),
      def: Number(pokemon.evs?.def ?? 0),
      hp: Number(pokemon.evs?.hp ?? 0),
      spa: Number(pokemon.evs?.spa ?? 0),
      spd: Number(pokemon.evs?.spd ?? 0),
      spe: Number(pokemon.evs?.spe ?? 0),
    },
    gender: {
      fixed: Boolean(pokemon.gender?.fixed),
      specified: pokemon.gender?.specified ?? null,
    },
    identifier: pokemon.identifier ?? null,
    item: pokemon.item ?? null,
    moves: [
      pokemon.moves?.[0] ?? null,
      pokemon.moves?.[1] ?? null,
      pokemon.moves?.[2] ?? null,
      pokemon.moves?.[3] ?? null,
    ],
    nature: {
      minus: pokemon.nature?.minus ?? null,
      plus: pokemon.nature?.plus ?? null,
    },
    slug: pokemon.slug ?? null,
  };
}

export function arePokemonEqual(a: TrainedPokemon | null, b: TrainedPokemon | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return JSON.stringify(canonicalizePokemon(a)) === JSON.stringify(canonicalizePokemon(b));
}

export function memberChangedFields(
  from: TrainedPokemon | null,
  to: TrainedPokemon | null,
): readonly string[] {
  if (!from || !to) return [];
  const canonFrom = canonicalizePokemon(from);
  const canonTo = canonicalizePokemon(to);
  if (!canonFrom || !canonTo) return [];

  const fields: string[] = [];
  const fieldList = ["item", "ability", "moves", "evs", "nature", "gender", "description"] as const;

  for (const field of fieldList) {
    if (JSON.stringify(canonFrom[field]) !== JSON.stringify(canonTo[field])) {
      fields.push(field);
    }
  }

  return fields;
}

/**
 * 2スナップショット間のセマンティック差分を生成する。
 * `oldSnapshot` が null の場合は初回リビジョンとして全スロットを added扱いにする。
 */
export function diffTeamSnapshots(
  oldSnapshot: TeamSnapshot | null,
  newSnapshot: TeamSnapshot,
  message?: string,
): TeamDiff {
  const members: MemberChange[] = [];
  const oldMembers = oldSnapshot ? normalizeMembers(oldSnapshot.members) : Array(6).fill(null);
  const newMembers = normalizeMembers(newSnapshot.members);

  for (let slot = 0; slot < 6; slot++) {
    const from = oldMembers[slot] ?? null;
    const to = newMembers[slot] ?? null;
    if (arePokemonEqual(from, to)) continue;

    const kind: MemberChangeKind =
      from === null
        ? "added"
        : to === null
          ? "removed"
          : from.identifier !== to.identifier
            ? "replaced"
            : "updated";

    const changedFields = memberChangedFields(from, to);

    // updated の場合に変更フィールドが空なら内容差分ゼロなので追加しない
    if (kind === "updated" && changedFields.length === 0) {
      continue;
    }

    members.push({
      slot,
      kind,
      identifierFrom: from?.identifier ?? null,
      identifierTo: to?.identifier ?? null,
      changedFields,
      from,
      to,
    });
  }

  const diff: TeamDiff = {
    pokepasteChanged: (oldSnapshot?.pokepaste ?? "") !== newSnapshot.pokepaste,
    members,
    ...(message ? { message } : {}),
  };
  if ((oldSnapshot?.name ?? "") !== newSnapshot.name) {
    (diff as { name?: FieldChange<string> }).name = {
      from: oldSnapshot?.name ?? "",
      to: newSnapshot.name,
    };
  }
  if ((oldSnapshot?.description ?? "") !== newSnapshot.description) {
    (diff as { description?: FieldChange<string> }).description = {
      from: oldSnapshot?.description ?? "",
      to: newSnapshot.description,
    };
  }
  return diff;
}

export function isEmptyTeamDiff(diff: TeamDiff): boolean {
  return (
    diff.name === undefined &&
    diff.description === undefined &&
    diff.pokepasteChanged === false &&
    diff.members.length === 0
  );
}

/**
 * 旧テキストパッチ方式。新規コードでは diffTeamSnapshots を使うこと。
 * チームの表示名、備考、Pokepasteテキストを差分追跡用のプレーンテキストに直列化する。
 */
export function serializeTeamForDiff(
  name: string,
  description: string | undefined,
  pokepaste: string,
): string {
  const parts: string[] = [`=== ${name.trim()} ===`];
  if (description && description.trim()) {
    parts.push(`Note: ${description.trim()}`);
  }
  parts.push("");
  if (pokepaste.trim()) {
    parts.push(pokepaste.trim());
  }
  return parts.join("\n");
}

/**
 * 旧テキストパッチ方式。
 * 直列化されたチームテキストから表示名、備考、Pokepasteテキストを復元する。
 */
export function parseTeamFromDiffText(text: string): {
  readonly name: string;
  readonly description: string;
  readonly pokepaste: string;
} {
  const lines = text.split("\n");
  let name = "";
  let description = "";
  const pokepasteLines: string[] = [];
  let isHeader = true;

  for (const line of lines) {
    if (isHeader) {
      const nameMatch = line.match(/^===\s*(.*?)\s*===$/);
      if (nameMatch) {
        name = nameMatch[1];
        continue;
      }
      const noteMatch = line.match(/^Note:\s*(.*)$/);
      if (noteMatch) {
        description = noteMatch[1];
        continue;
      }
      if (line.trim() === "") {
        isHeader = false;
        continue;
      }
    }
    pokepasteLines.push(line);
  }

  return {
    name: name || "Team",
    description,
    pokepaste: pokepasteLines.join("\n").trim(),
  };
}

/**
 * 旧テキストパッチ方式。
 * 2つのチームテキスト間の unified diff（パッチ）を生成する。
 */
export function createTeamDiff(oldText: string, newText: string): string {
  return createPatch(FILE_NAME, oldText, newText);
}

/**
 * 旧テキストパッチ方式。
 * 過去パッチの累積適用によって、特定リビジョン時点のチームテキストを再現する。
 */
export function reconstructTeamText(
  revisionsAscending: readonly { readonly diff: string }[],
  targetIndex?: number,
): string {
  const limit = targetIndex !== undefined ? targetIndex + 1 : revisionsAscending.length;
  let text = "";
  for (let i = 0; i < limit; i++) {
    const rev = revisionsAscending[i];
    if (rev) {
      const applied = applyPatch(text, rev.diff);
      if (typeof applied === "string") {
        text = applied;
      }
    }
  }
  return text;
}
