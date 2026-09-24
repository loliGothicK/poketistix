// 複数コンポーネントで繰り返し使われる sx 断片をファクトリ関数として集約する。
// テーマに依存する値を含むため、単純なオブジェクト定数ではなく (theme) => SxProps<Theme> の形にする。
// 呼び出し側では `sx={{ ...surfaceCard(theme), mt: 2 }}` のように差分だけ追記して使う。
// 詳細: .design/sx-common.md
import type { SxProps, Theme } from "@mui/material/styles";
import type { SystemStyleObject } from "@mui/system";

/**
 * カード/パネルの表面スタイル（枠線 + 角丸 + 背景色）。
 * `raised: true` で `background.paperRaised` を使う（浮き上がったパネル用）。
 */
export function surfaceCard(
  theme: Theme,
  options?: { readonly raised?: boolean; readonly borderRadius?: number },
): SxProps<Theme> {
  return {
    border: "1px solid",
    borderColor: "divider",
    borderRadius: options?.borderRadius ?? 1,
    bgcolor: options?.raised ? "background.paperRaised" : "background.paper",
  };
}

/** flexboxで横並び・縦中央揃え。Box/Stack どちらでも使える。 */
export const flexRowCenter: SystemStyleObject<Theme> = {
  display: "flex",
  alignItems: "center",
};

/** overline的な見出しラベル（太字 + letterSpacing + secondaryカラー）。 */
export const sectionLabel: SystemStyleObject<Theme> = {
  fontWeight: 800,
  letterSpacing: "0.08em",
  color: "text.secondary",
};

/** 空状態表示を中央に配置する。 */
export const emptyStateCenter: SystemStyleObject<Theme> = {
  textAlign: "center",
  py: 8,
};

/** 1行に収まらない場合に "..." で省略する。 */
export const truncateText: SystemStyleObject<Theme> = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** 枠線 + 背景色付きの丸型IconButton（テーマ切り替えボタン等）。 */
export function iconButtonBordered(): SxProps<Theme> {
  return {
    border: "1px solid",
    borderColor: "divider",
    bgcolor: "background.paper",
    borderRadius: 2.5,
  };
}
