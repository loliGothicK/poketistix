import * as v from "valibot";
import type { DataSource, DashboardVariable } from "@/lib/db/schema";

export type { DataSource, DashboardVariable };

export const visualizationTypeSchema = v.picklist([
  "table",
  "gauge",
  "stat",
  "histogram",
  "heatmap",
  "custom",
] as const);
export type VisualizationType = v.InferOutput<typeof visualizationTypeSchema>;

// =====================================================================
// DTO（クライアント⇔サーバ間でやり取りするシリアライズ済みの形）
// 設計: .design/dashboard.md
// =====================================================================

/** ウィジェットのデータソース（Valibot スキーマ） */
export const dataSourceSchema = v.variant("type", [
  v.object({ type: v.literal("season"), seasonId: v.nullable(v.pipe(v.string(), v.minLength(1))) }),
  v.object({ type: v.literal("variable"), variableId: v.pipe(v.string(), v.minLength(1)) }),
]);

/** ダッシュボード変数で最新シーズンをデフォルトにするための特別な値 */
export const VARIABLE_LATEST_SEASON = "__latest__";

/** ダッシュボード変数（Valibot スキーマ） */
export const dashboardVariableSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  type: v.literal("season"),
  defaultSeasonId: v.nullable(v.pipe(v.string(), v.minLength(1))),
});

/** ダッシュボード上の1ウィジェット */
export interface DashboardWidget {
  readonly id: string;
  readonly templateId?: string;
  readonly title: string;
  readonly dataSource: DataSource;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly options?: Record<string, unknown>;
  readonly visualization?: VisualizationType;
  readonly query?: string;
  /**
   * Transformer ID.
   * - "none" | undefined : パススルー
   * - "winrate" / "streak" / "ratingDiff" : プリセット
   * - "custom" : transformerCode を new Function で実行
   */
  readonly transformer?: string;
  /** transformer === "custom" のときのユーザー定義 JS 関数本体 */
  readonly transformerCode?: string;
}

/** ダッシュボード1件 */
export interface Dashboard {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly layout: readonly DashboardWidget[];
  readonly variables: readonly DashboardVariable[];
  /** ISO 8601 */
  readonly createdAt: string;
  /** ISO 8601 */
  readonly updatedAt: string;
}

// =====================================================================
// 入力バリデーション（Valibot）
// =====================================================================

/** グリッド列数の上限（lg ブレークポイント基準） */
export const DASHBOARD_GRID_MAX_COLS = 8;
/** ウィジェット行高の上限 */
export const DASHBOARD_GRID_MAX_ROWS = 12;

export const dashboardWidgetSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  templateId: v.optional(v.string()),
  title: v.pipe(v.string(), v.maxLength(100)),
  dataSource: dataSourceSchema,
  x: v.pipe(v.number(), v.integer(), v.minValue(0)),
  y: v.pipe(v.number(), v.integer(), v.minValue(0)),
  w: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(DASHBOARD_GRID_MAX_COLS)),
  h: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(DASHBOARD_GRID_MAX_ROWS)),
  options: v.optional(v.record(v.string(), v.unknown())),
  visualization: v.optional(visualizationTypeSchema),
  query: v.optional(v.string()),
  transformer: v.optional(v.string()),
  transformerCode: v.optional(v.string()),
});

const dashboardInputObject = v.object({
  id: v.optional(v.pipe(v.string(), v.minLength(1))),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  isDefault: v.optional(v.boolean()),
  layout: v.optional(
    v.pipe(
      v.array(dashboardWidgetSchema),
      v.maxLength(30),
      v.check(
        (arr) => new Set(arr.map((w) => w.id)).size === arr.length,
        "widget id must be unique",
      ),
    ),
  ),
  variables: v.optional(
    v.pipe(
      v.array(dashboardVariableSchema),
      v.maxLength(20),
      v.check(
        (arr) => new Set(arr.map((vr) => vr.name)).size === arr.length,
        "variable name must be unique",
      ),
    ),
  ),
});

export const dashboardInputSchema = dashboardInputObject;

export type DashboardInput = v.InferOutput<typeof dashboardInputSchema>;

export const dashboardUpdateSchema = v.partial(v.omit(dashboardInputObject, ["id"]));

export type DashboardUpdate = Partial<Omit<DashboardInput, "id">>;
