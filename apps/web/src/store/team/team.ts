import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { Gender, EV } from "@/types/pokemon";
import { Lens } from "monocle-ts";

export interface TrainedPokemon {
  readonly boxId: string; // box_pokemon.id (ULID) — individual instance identifier
  readonly identifier: string;
  readonly slug: string;
  readonly item: number | null;
  readonly ability: number;
  readonly gender: {
    readonly fixed: boolean;
    readonly specified?: Gender;
  };
  readonly nature: {
    readonly plus?: "hp" | "atk" | "def" | "spa" | "spd" | "spe" | null;
    readonly minus?: "hp" | "atk" | "def" | "spa" | "spd" | "spe" | null;
  };
  readonly moves: [number | null, number | null, number | null, number | null];
  readonly evs: {
    readonly hp: EV;
    readonly atk: EV;
    readonly def: EV;
    readonly spa: EV;
    readonly spd: EV;
    readonly spe: EV;
  };
  readonly description?: string;
}

// 1. まず、TrainedPokemon から `evs` プロパティへフォーカスするLensを作る
const evsLens = Lens.fromProp<TrainedPokemon>()("evs");
export const movesLens = Lens.fromProp<TrainedPokemon>()("moves");

// 2. ループ内で動的に適用するためのLensファクトリ（関数）を作る
export const getStatLens = (stat: keyof TrainedPokemon["evs"]) =>
  evsLens.compose(Lens.fromProp<TrainedPokemon["evs"]>()(stat));

// --- 型定義 ---
export interface Team {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly members: readonly (TrainedPokemon | null)[];
}

export const activeSlotIndexAtom = atom(0);

// =====================================================================
// 未ログイン時のオフラインデータ（localStorageに永続化）
// ログイン時は TanStack Query の ["teams"] キャッシュがデータソースになる
// =====================================================================
export const localTeamsAtom = atomWithStorage<readonly Team[]>("pokemon_teams_v2", []);

// =====================================================================
// 【一生残るAtom（純粋なクライアント状態）】
// ユーザーが「今どのチームを見ているか」はUIの状態であり、DBには保存しない。
// したがって、これは将来も Jotai が担当し続ける。
// =====================================================================
export const activeTeamIdAtom = atomWithStorage<string | null>("active_team_id", null);

export const drawerOpenAtom = atomWithStorage("team-drawer", true);
