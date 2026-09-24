import {
  pgTable,
  uuid,
  text,
  jsonb,
  smallint,
  doublePrecision,
  boolean,
  timestamp,
  date,
  check,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { ulidType } from "./ulid-type";
import type { TrainedPokemon } from "@/store/team/team";
import type { TeamDiff, TeamSnapshot } from "@/lib/team-diff";

/** 対戦フォーマット */
export type BattleFormat = "singles" | "doubles";
/** 対戦結果 */
export type BattleResult = "win" | "loss" | "draw";
/** 相手個体の選出役割（null = 選出外） */
export type OpponentSelectionRole = "lead" | "back";

/** チームシェアの公開スナップショット型 */
export interface SharedTeamSnapshot {
  readonly teamName: string;
  readonly description?: string;
  readonly members: readonly (TrainedPokemon | null)[];
  /** true = 実数値・努力値を公開する。false = オープンチームシート（構成のみ公開） */
  readonly showStats: boolean;
}

export const boxPokemon = pgTable(
  "box_pokemon",
  {
    id: ulidType("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    data: jsonb("data").notNull(),
    /** true = BOXに明示的に保存されたもの。false = チームスロット専用（BOXには表示しない） */
    inBox: boolean("in_box").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("box_pokemon_data_is_object", sql`jsonb_typeof(${t.data}) = 'object'`)],
);

export const teams = pgTable(
  "teams",
  {
    id: ulidType("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("teams_name_len", sql`char_length(${t.name}) between 1 and 100`),
    index("teams_user_id_idx").on(t.userId),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: ulidType("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    slotIndex: smallint("slot_index").notNull(),
    boxPokemonId: ulidType("box_pokemon_id")
      .notNull()
      .references(() => boxPokemon.id, { onDelete: "cascade" }),
  },
  (t) => [check("team_members_slot_range", sql`${t.slotIndex} between 0 and 5`)],
);

export const sharedTeams = pgTable(
  "shared_teams",
  {
    id: ulidType("id").primaryKey(),
    /** 作成者 UUID（ゲストシェアは null 可）*/
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    /** チーム名 + members (TrainedPokemon | null)[] のスナップショット */
    snapshot: jsonb("snapshot").notNull().$type<SharedTeamSnapshot>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("shared_teams_snapshot_is_object", sql`jsonb_typeof(${t.snapshot}) = 'object'`)],
);

export const teamRevisions = pgTable(
  "team_revisions",
  {
    id: ulidType("id").primaryKey(),
    teamId: ulidType("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** セマンティック差分。変更があったキーのみ存在する */
    diff: jsonb("diff").notNull().$type<TeamDiff>(),
    /** 改訂時点のフルスナップショット。復元は単体で完結する */
    snapshot: jsonb("snapshot").notNull().$type<TeamSnapshot>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("team_revisions_diff_is_object", sql`jsonb_typeof(${t.diff}) = 'object'`),
    check("team_revisions_snapshot_is_object", sql`jsonb_typeof(${t.snapshot}) = 'object'`),
    index("team_revisions_team_id_idx").on(t.teamId),
    index("team_revisions_created_at_idx").on(t.createdAt),
    index("team_revisions_snapshot_gin").using("gin", t.snapshot),
    index("team_revisions_diff_gin").using("gin", t.diff),
  ],
);

export type TeamRevision = typeof teamRevisions.$inferSelect;

// =====================================================================
// Battle Records（対戦記録）
// 設計: .design/battle-records.md
// =====================================================================

/**
 * シーズン / レギュレーション管理。ユーザーごとに作成。
 */
export const seasons = pgTable(
  "seasons",
  {
    id: ulidType("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "singles" / "doubles" */
    format: text("format").notNull().$type<BattleFormat>(),
    /** "regulation-h" など。任意 */
    ruleMark: text("rule_mark"),
    startedAt: date("started_at"),
    endedAt: date("ended_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("seasons_name_len", sql`char_length(${t.name}) between 1 and 100`),
    check("seasons_format_valid", sql`${t.format} in ('singles', 'doubles')`),
  ],
);

/**
 * 対戦1試合（BO1前提）。
 * my_team は記録時点のチーム構成を jsonb で凍結したスナップショット。
 */
export const battleRecords = pgTable(
  "battle_records",
  {
    id: ulidType("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    seasonId: ulidType("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** 記録時に使用したチーム（任意。チーム削除時は null） */
    teamId: ulidType("team_id").references(() => teams.id, { onDelete: "set null" }),
    /** "win" / "loss" / "draw" */
    result: text("result").notNull().$type<BattleResult>(),
    /** TrainedPokemon[] スナップショット（最大6体） */
    myTeam: jsonb("my_team").notNull().$type<readonly TrainedPokemon[]>(),
    /** my_team 内 index。先頭=先発（フォーマットの active 数）、残り=後発 */
    mySelection: smallint("my_selection").array(),
    /** その試合終了時点のレート（例: 1650.5。任意）。試合間の変動は記録から算出する */
    rating: doublePrecision("rating"),
    /** ギミックや役割などの分類タグ */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text("notes"),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("battle_records_result_valid", sql`${t.result} in ('win', 'loss', 'draw')`),
    check("battle_records_my_team_is_array", sql`jsonb_typeof(${t.myTeam}) = 'array'`),
    index("battle_records_user_season_played_idx").on(t.userId, t.seasonId, t.playedAt),
  ],
);

/**
 * 相手パーティ。1試合につき最大6行。分析集計しやすいよう正規化。
 */
export const battleRecordOpponents = pgTable(
  "battle_record_opponents",
  {
    battleRecordId: ulidType("battle_record_id")
      .notNull()
      .references(() => battleRecords.id, { onDelete: "cascade" }),
    slotIndex: smallint("slot_index").notNull(),
    /** 最小入力項目 */
    pokemonSlug: text("pokemon_slug").notNull(),
    itemSlug: text("item_slug"),
    abilitySlug: text("ability_slug"),
    /** 判明した技（可変長） */
    moves: text("moves").array(),
    /** "lead" / "back" / null(選出外) */
    selectionRole: text("selection_role").$type<OpponentSelectionRole>(),
    notes: text("notes"),
  },
  (t) => [
    primaryKey({ columns: [t.battleRecordId, t.slotIndex] }),
    check("battle_record_opponents_slot_range", sql`${t.slotIndex} between 0 and 5`),
    check(
      "battle_record_opponents_selection_role_valid",
      sql`${t.selectionRole} in ('lead', 'back')`,
    ),
  ],
);

// =====================================================================
// Dashboards（カスタマイズ可能ダッシュボード）
// 設計: .design/dashboard.md
// =====================================================================

/** ウィジェットのデータソース（直指定 or ダッシュボード変数参照） */
export type DataSource =
  | { readonly type: "season"; readonly seasonId: string | null }
  | { readonly type: "variable"; readonly variableId: string };

/**
 * ダッシュボード変数。
 * グリッド上部の Variable バーに表示され、複数ウィジェットが同一変数を参照できる。
 */
export interface DashboardVariable {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly type: "season";
  /** null = 全シーズン統合 */
  readonly defaultSeasonId: string | null;
}

/** ダッシュボードの1ウィジェット（layout jsonb の要素） */
export interface DashboardWidget {
  readonly id: string;
  /** 描画テンプレート（旧 type） */
  readonly templateId?: string;
  readonly title: string;
  /** データソース（シーズン直指定 or Variable 参照） */
  readonly dataSource: DataSource;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly options?: Record<string, unknown>;
}

/**
 * ユーザーがカスタマイズ可能なダッシュボード。
 * ウィジェットの配置・種別・パラメータを layout に jsonb で保持する。
 * 変数の定義を variables に jsonb で保持する。
 */
export const dashboards = pgTable(
  "dashboards",
  {
    id: ulidType("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** ユーザーごとに1件のみ true（アプリ側で保証） */
    isDefault: boolean("is_default").notNull().default(false),
    /** DashboardWidget[] */
    layout: jsonb("layout").notNull().default([]).$type<readonly DashboardWidget[]>(),
    /** DashboardVariable[] */
    variables: jsonb("variables").notNull().default([]).$type<readonly DashboardVariable[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("dashboards_name_len", sql`char_length(${t.name}) between 1 and 100`),
    check("dashboards_layout_is_array", sql`jsonb_typeof(${t.layout}) = 'array'`),
    check("dashboards_variables_is_array", sql`jsonb_typeof(${t.variables}) = 'array'`),
  ],
);
