import { atomWithStorage } from "jotai/utils";
import type { Team } from "./team";

export interface StashEntry {
  readonly teamId: string;
  readonly team: Team;
  readonly savedAt: string; // ISO 8601
  readonly message?: string;
}

/**
 * git stash 相当の機能。
 * チームIDごとに最新のスタッシュを保持する（1チーム1スロット）。
 * localStorage に永続化される。
 */
export const teamStashAtom = atomWithStorage<Record<string, StashEntry>>("team_stash_v1", {});
