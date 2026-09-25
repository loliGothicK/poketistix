"use client";

import { useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { localTeamsAtom, type Team, type TrainedPokemon } from "@/store/team/team";
import { isAuthenticatedAtom } from "@/store/auth";
import { teamStashAtom, type StashEntry } from "@/store/team/stash";
import { arePokemonEqual, memberChangedFields, type MemberChangeKind } from "@/lib/team-diff";
import { fetchTeamsFromServer } from "@services/teams";

export type PokemonField =
  | "item"
  | "ability"
  | "moves"
  | "evs"
  | "nature"
  | "gender"
  | "description";

export interface SlotFieldChange {
  readonly id: `slot-${number}:${PokemonField}`;
  readonly field: PokemonField;
  readonly from: TrainedPokemon;
  readonly to: TrainedPokemon;
}

export type SyncChangeItem =
  | {
      readonly id: "name";
      readonly type: "name";
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly id: "description";
      readonly type: "description";
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly id: `slot-${number}`;
      readonly type: "slot";
      readonly slot: number;
      readonly kind: MemberChangeKind;
      readonly identifier: string | null;
      readonly changedFields: readonly string[];
      readonly fieldChanges: readonly SlotFieldChange[];
      readonly from: TrainedPokemon | null;
      readonly to: TrainedPokemon | null;
    };

/**
 * サーバー版と現在のローカル版の差分項目を計算・取得する。
 */
export function useSyncableChanges(activeTeam: Team | undefined | null): {
  readonly changes: readonly SyncChangeItem[];
  readonly serverTeam: Team | null;
} {
  const localTeams = useAtomValue(localTeamsAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  const { data: serverTeams = [] } = useQuery<readonly Team[]>({
    queryKey: ["teams"],
    queryFn: fetchTeamsFromServer,
    enabled: false,
  });

  if (!activeTeam || !isAuthenticated) return { changes: [], serverTeam: null };

  const localVersion = localTeams.find((t) => t.id === activeTeam.id) ?? activeTeam;
  const serverVersion = serverTeams.find((t) => t.id === activeTeam.id) ?? null;

  // ローカル版が localTeams にも入っておらず、サーバー版が存在する場合は差分なし
  const isInLocalTeams = localTeams.some((t) => t.id === activeTeam.id);
  if (!isInLocalTeams && serverVersion) {
    return { changes: [], serverTeam: serverVersion };
  }

  const changes: SyncChangeItem[] = [];

  if (serverVersion) {
    if (localVersion.name !== serverVersion.name) {
      changes.push({
        id: "name",
        type: "name",
        from: serverVersion.name,
        to: localVersion.name,
      });
    }
    if ((localVersion.description ?? "") !== (serverVersion.description ?? "")) {
      changes.push({
        id: "description",
        type: "description",
        from: serverVersion.description ?? "",
        to: localVersion.description ?? "",
      });
    }
  } else {
    // 新規チームの場合
    changes.push({
      id: "name",
      type: "name",
      from: "",
      to: localVersion.name,
    });
    if (localVersion.description) {
      changes.push({
        id: "description",
        type: "description",
        from: "",
        to: localVersion.description,
      });
    }
  }

  for (let slot = 0; slot < 6; slot++) {
    const from = serverVersion?.members[slot] ?? null;
    const to = localVersion.members[slot] ?? null;

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
    const fieldChanges: SlotFieldChange[] = [];

    if (kind === "updated" && from && to) {
      for (const field of changedFields) {
        fieldChanges.push({
          id: `slot-${slot}:${field as PokemonField}`,
          field: field as PokemonField,
          from,
          to,
        });
      }
    }

    changes.push({
      id: `slot-${slot}`,
      type: "slot",
      slot,
      kind,
      identifier: to?.identifier ?? from?.identifier ?? null,
      changedFields: changedFields.length > 0 ? changedFields : ["details"],
      fieldChanges,
      from,
      to,
    });
  }

  return { changes, serverTeam: serverVersion };
}

/**
 * アクティブチームとサーバー上の最後に保存されたチームの間に
 * semantic diff（意味のある変更）があるかどうかを判定する。
 * useSyncableChanges と 100% 連動。
 */
export function useHasSyncableDiff(activeTeam: Team | undefined | null): boolean {
  const { changes } = useSyncableChanges(activeTeam);
  return changes.length > 0;
}

/**
 * Stash 機能のための hooks。
 * - stash: 現在のチームをスタッシュに保存し、サーバーバージョンに戻す
 * - unstash: スタッシュからチームを復元する
 * - stashEntry: 現在のチームのスタッシュエントリ
 */
export function useTeamStash(activeTeam: Team | undefined | null) {
  const [stashMap, setStashMap] = useAtom(teamStashAtom);
  const [, setLocalTeams] = useAtom(localTeamsAtom);

  const stashEntry: StashEntry | undefined = activeTeam ? stashMap[activeTeam.id] : undefined;

  const stash = useCallback(
    (message?: string) => {
      if (!activeTeam) return;

      // 現在のローカル状態（変更済み）をスタッシュに保存
      const entry: StashEntry = {
        teamId: activeTeam.id,
        team: activeTeam,
        savedAt: new Date().toISOString(),
        ...(message ? { message } : {}),
      };
      setStashMap((prev) => ({ ...prev, [activeTeam.id]: entry }));

      // localTeams からこのチームを削除してサーバー版に戻す
      setLocalTeams((prev) => prev.filter((t) => t.id !== activeTeam.id));
    },
    [activeTeam, setStashMap, setLocalTeams],
  );

  const unstash = useCallback(() => {
    if (!activeTeam || !stashEntry) return;

    // スタッシュから復元（localTeams に戻す）
    setLocalTeams((prev) => {
      const without = prev.filter((t) => t.id !== activeTeam.id);
      return [...without, stashEntry.team];
    });

    // スタッシュをクリア
    setStashMap((prev) => {
      const next = { ...prev };
      delete next[activeTeam.id];
      return next;
    });
  }, [activeTeam, stashEntry, setLocalTeams, setStashMap]);

  const dropStash = useCallback(() => {
    if (!activeTeam) return;
    setStashMap((prev) => {
      const next = { ...prev };
      delete next[activeTeam.id];
      return next;
    });
  }, [activeTeam, setStashMap]);

  const hasStash = !!stashEntry;

  return { stash, unstash, dropStash, stashEntry, hasStash };
}

/**
 * 現在の変更の簡易サマリーを生成する。
 * 例: "+3 / -1" (3匹追加、1匹削除)
 */
export function useDiffSummary(activeTeam: Team | undefined | null): string | null {
  const { changes, serverTeam } = useSyncableChanges(activeTeam);

  if (!activeTeam || changes.length === 0 || !serverTeam) return null;

  const parts: string[] = [];

  if (changes.some((c) => c.type === "name")) parts.push("✎");
  if (changes.some((c) => c.type === "description")) parts.push("📝");

  let added = 0;
  let removed = 0;
  let updated = 0;

  for (const c of changes) {
    if (c.type !== "slot") continue;
    if (c.kind === "added") added++;
    else if (c.kind === "removed") removed++;
    else if (c.kind === "replaced") {
      added++;
      removed++;
    } else {
      updated++;
    }
  }

  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`-${removed}`);
  if (updated > 0) parts.push(`~${updated}`);

  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * 差分項目一覧から、選択可能なすべての差分ID（アトミックな変更単位）をフラットに抽出する。
 */
export function getAllChangeIds(changes: readonly SyncChangeItem[]): string[] {
  const ids: string[] = [];
  for (const c of changes) {
    if (c.type === "name" || c.type === "description") {
      ids.push(c.id);
    } else if (c.type === "slot") {
      if (c.kind === "updated" && c.fieldChanges.length > 0) {
        for (const fc of c.fieldChanges) {
          ids.push(fc.id);
        }
      } else {
        ids.push(c.id);
      }
    }
  }
  return ids;
}

/**
 * 選択された変更 ID のみを適用したチームを作成する（git commit -i 用）。
 * ポケモン単位だけでなく、技・持ち物・努力値などのフィールド単位の選択的マージに対応。
 */
export function buildPartialTeam(
  baseServerTeam: Team | null,
  activeTeam: Team,
  selectedChangeIds: ReadonlySet<string>,
): Team {
  const initialMembers = baseServerTeam ? [...baseServerTeam.members] : Array(6).fill(null);
  const initialName = baseServerTeam ? baseServerTeam.name : activeTeam.name;
  const initialDescription = baseServerTeam ? baseServerTeam.description : activeTeam.description;

  const nextMembers = [...initialMembers];
  for (let slot = 0; slot < 6; slot++) {
    const from = baseServerTeam?.members[slot] ?? null;
    const to = activeTeam.members[slot] ?? null;

    if (arePokemonEqual(from, to)) {
      nextMembers[slot] = to;
      continue;
    }

    const isAdded = from === null && to !== null;
    const isRemoved = from !== null && to === null;
    const isReplaced = from !== null && to !== null && from.identifier !== to.identifier;

    if (isAdded) {
      nextMembers[slot] = selectedChangeIds.has(`slot-${slot}`) ? to : null;
    } else if (isRemoved) {
      nextMembers[slot] = selectedChangeIds.has(`slot-${slot}`) ? null : from;
    } else if (isReplaced) {
      nextMembers[slot] = selectedChangeIds.has(`slot-${slot}`) ? to : from;
    } else if (from !== null && to !== null) {
      // updated: フィールドごとのマージ
      // スロット親ID (`slot-${slot}`) が選択されている場合も全フィールド選択とみなす
      const isWholeSlot = selectedChangeIds.has(`slot-${slot}`);

      const nextPokemon: TrainedPokemon = {
        ...from,
        item: isWholeSlot || selectedChangeIds.has(`slot-${slot}:item`) ? to.item : from.item,
        ability:
          isWholeSlot || selectedChangeIds.has(`slot-${slot}:ability`) ? to.ability : from.ability,
        moves: isWholeSlot || selectedChangeIds.has(`slot-${slot}:moves`) ? to.moves : from.moves,
        evs: isWholeSlot || selectedChangeIds.has(`slot-${slot}:evs`) ? to.evs : from.evs,
        nature:
          isWholeSlot || selectedChangeIds.has(`slot-${slot}:nature`) ? to.nature : from.nature,
        gender:
          isWholeSlot || selectedChangeIds.has(`slot-${slot}:gender`) ? to.gender : from.gender,
        description:
          isWholeSlot || selectedChangeIds.has(`slot-${slot}:description`)
            ? to.description
            : from.description,
      };

      nextMembers[slot] = arePokemonEqual(from, nextPokemon) ? from : nextPokemon;
    }
  }

  return {
    id: activeTeam.id,
    name: selectedChangeIds.has("name") ? activeTeam.name : initialName,
    description: selectedChangeIds.has("description") ? activeTeam.description : initialDescription,
    members: nextMembers,
  };
}
