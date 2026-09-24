"use client";

import { useMemo } from "react";
import { alpha, Box, Chip, IconButton, Stack, Typography } from "@mui/material";
import Edit from "@mui/icons-material/Edit";
import Delete from "@mui/icons-material/Delete";
import Image from "next/image";
import { useTheme, type Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import type { BattleRecord, BattleResult } from "@/store/battle-record/battleRecord";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { EmptyState } from "@/components/common/EmptyState";
import { flexRowCenter } from "@/theme/sx";
import { resolveMyTeamDisplay, resolveOpponentDisplay } from "./battleRecordList.logic";

interface BattleRecordListProps {
  /** playedAt 降順で並んだ記録 */
  readonly records: readonly BattleRecord[];
  readonly formatLabel?: string;
  readonly teamNameMap?: ReadonlyMap<string, string>;
  readonly onEdit: (record: BattleRecord) => void;
  readonly onDelete: (id: string) => void;
}

const resultAccent = (result: BattleResult, theme: Theme): string =>
  match(result)
    .with("win", () => theme.palette.success.main)
    .with("loss", () => theme.palette.error.main)
    .with("draw", () => theme.palette.text.disabled)
    .exhaustive();

function SpriteRow({
  slugs,
  selectedIndices,
}: {
  readonly slugs: readonly string[];
  /** 選出されているインデックスのセット。null の場合は全て選出扱い */
  readonly selectedIndices: ReadonlySet<number> | null;
}) {
  return (
    <Stack direction="row" spacing={-0.5} sx={flexRowCenter}>
      {slugs.map((slug, i) => {
        const isSelected = selectedIndices === null || selectedIndices.has(i);
        return (
          <Box
            key={`${slug}-${i}`}
            sx={{
              width: { xs: 18, sm: 26 },
              height: { xs: 18, sm: 26 },
              position: "relative",
              flexShrink: 0,
              opacity: isSelected ? 1 : 0.35,
              filter: isSelected ? "none" : "grayscale(1)",
              transition: "opacity 0.15s, filter 0.15s",
            }}
          >
            <Image
              src={`/pokemon/${slug}.png`}
              alt={slug}
              width={26}
              height={26}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </Box>
        );
      })}
    </Stack>
  );
}

export function BattleRecordList({
  records,
  teamNameMap,
  onEdit,
  onDelete,
}: BattleRecordListProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();

  // 直前（1つ古い）記録とのレート差分
  const deltas = useMemo(
    () =>
      records.map((record, i) => {
        const older = records[i + 1];
        if (record.rating === null || !older || older.rating === null) return null;
        const diff = record.rating - older.rating;
        return Math.round(diff * 100) / 100;
      }),
    [records],
  );

  if (records.length === 0) {
    return <EmptyState message={t("battleRecord.empty")} />;
  }

  return (
    <Stack spacing={1}>
      {records.map((record, index) => {
        const accent = resultAccent(record.result, theme);

        const { slugs: myAllSlugs, selectedIndices: mySelectedSet } = resolveMyTeamDisplay(record);
        const { slugs: oppAllSlugs, selectedIndices: oppSelectedSet } =
          resolveOpponentDisplay(record);

        const delta = deltas[index];
        const teamName = record.teamId && teamNameMap ? teamNameMap.get(record.teamId) : null;

        return (
          <SurfaceCard
            key={record.id}
            sx={{
              position: "relative",
              borderRadius: "10px",
              bgcolor: alpha(accent, 0.05),
              border: "1px solid",
              borderColor: alpha(accent, 0.25),
              px: 2,
              py: 1.25,
              transition: "border-color 0.2s, box-shadow 0.2s",
              "&:hover": {
                borderColor: alpha(accent, 0.5),
                boxShadow: `0 2px 8px -2px ${alpha(accent, 0.15)}`,
              },
              "&:hover .row-actions": { opacity: 1 },
            }}
          >
            <Stack
              direction="row"
              spacing={1.25}
              sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}
            >
              {/* インジケーターバー */}
              <Box
                sx={{
                  width: 3.5,
                  height: 24,
                  borderRadius: "2px",
                  bgcolor: accent,
                  flexShrink: 0,
                }}
              />

              {/* 結果 */}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  color: accent,
                  bgcolor: alpha(accent, 0.12),
                  px: 0.85,
                  py: 0.25,
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  textAlign: "center",
                  minWidth: 42,
                }}
              >
                {t(`battleRecord.result.${record.result}`).toUpperCase()}
              </Typography>

              {/* 自軍 vs 相手 */}
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ alignItems: "center", flexGrow: 1, minWidth: 0 }}
              >
                <SpriteRow slugs={myAllSlugs} selectedIndices={mySelectedSet} />
                <Typography variant="caption" color="text.secondary" sx={{ px: 0.25 }}>
                  {t("battleRecord.vs")}
                </Typography>
                {oppAllSlugs.length > 0 ? (
                  <SpriteRow slugs={oppAllSlugs} selectedIndices={oppSelectedSet} />
                ) : (
                  <Typography variant="caption" color="text.disabled">
                    {t("battleRecord.form.noOpponents")}
                  </Typography>
                )}
              </Stack>

              {/* レート変動 / 記録レート */}
              {delta !== null ? (
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 800,
                    color:
                      delta > 0
                        ? theme.palette.success.main
                        : delta < 0
                          ? theme.palette.error.main
                          : "text.secondary",
                    minWidth: 40,
                    textAlign: "right",
                  }}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </Typography>
              ) : record.rating !== null ? (
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 700, minWidth: 40, textAlign: "right" }}
                >
                  {record.rating}
                </Typography>
              ) : null}

              {/* アクション (Desktop) */}
              <Stack
                direction="row"
                className="row-actions"
                sx={{
                  display: { xs: "none", md: "flex" },
                  opacity: 0,
                  transition: "opacity 0.15s",
                  ml: "auto",
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => onEdit(record)}
                  aria-label={t("common.edit")}
                >
                  <Edit fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => onDelete(record.id)}
                  aria-label={t("common.delete")}
                >
                  <Delete fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>

            {/* 日時 + メモ + アクション(Mobile) */}
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", mt: 0.25, flexWrap: "wrap" }}
            >
              <Typography variant="caption" color="text.secondary">
                {new Date(record.playedAt).toLocaleString(i18n.language, {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </Typography>
              {teamName && (
                <Chip
                  size="small"
                  label={teamName}
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.65rem", "& .MuiChip-label": { px: 0.75 } }}
                />
              )}
              {record.notes && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  sx={{ maxWidth: { xs: 140, md: 320 } }}
                >
                  {record.notes}
                </Typography>
              )}

              <Box sx={{ flexGrow: 1 }} />

              {/* アクション (Mobile) */}
              <Stack direction="row" sx={{ display: { xs: "flex", md: "none" } }}>
                <IconButton
                  size="small"
                  onClick={() => onEdit(record)}
                  aria-label={t("common.edit")}
                >
                  <Edit fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => onDelete(record.id)}
                  aria-label={t("common.delete")}
                >
                  <Delete fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          </SurfaceCard>
        );
      })}
    </Stack>
  );
}
