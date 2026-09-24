"use client";

import { useState } from "react";
import { alpha, Box, Button, IconButton, Stack, Typography } from "@mui/material";
import Add from "@mui/icons-material/Add";
import Close from "@mui/icons-material/Close";
import EditNote from "@mui/icons-material/EditNote";
import RestartAlt from "@mui/icons-material/RestartAlt";
import Sync from "@mui/icons-material/Sync";
import Image from "next/image";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { useHotkeys } from "react-hotkeys-hook";
import { SelectPokemonDialog } from "@/components/client/team-builder/SelectPokemonDialog";
import type { BattleFormat, OpponentSelectionRole } from "@/store/battle-record/battleRecord";
import { flexRowCenter, sectionLabel } from "@/theme/sx";
import type { OpponentDraft } from "./formState";
import { nextOpponentKey } from "./formState";
import { cycleOpponentRole, selectionLimits } from "./selection";
import { OpponentDetailDialog } from "./OpponentDetailDialog";
import { BACK_COLOR, LEAD_COLOR, Legend } from "./YourTeamSelector";

const MAX_OPPONENTS = 6;

interface OpponentSlotsProps {
  readonly opponents: readonly OpponentDraft[];
  readonly onChange: (opponents: readonly OpponentDraft[]) => void;
  readonly format: BattleFormat;
}

const roleColor = (role: OpponentSelectionRole | null): string | null =>
  role === "lead" ? LEAD_COLOR : role === "back" ? BACK_COLOR : null;

/**
 * 相手6枠。空きスロットは + で種族検索して追加。
 * 追加後はカードのタップで 選出外 → 後発 → 先発 を循環（自チームと同じ操作感）。
 * 鉛筆アイコンで持ち物・技などの詳細をあとから追記でき、更新アイコンで選び直せる。
 */
export function OpponentSlots({ opponents, onChange, format }: OpponentSlotsProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectSlotIndex, setSelectSlotIndex] = useState<number | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const limits = selectionLimits(format);

  const backCount = opponents.filter((o) => o.selectionRole !== null).length;
  const leadCount = opponents.filter((o) => o.selectionRole === "lead").length;

  const openSelectFor = (index: number | null) => {
    setSelectSlotIndex(index);
    setSelectOpen(true);
  };

  const handlePokemonSelected = (identifier: string | null) => {
    if (!identifier) return;
    if (selectSlotIndex !== null && selectSlotIndex < opponents.length) {
      // 既存スロットの選び直し（置換）
      onChange(
        opponents.map((o, i) =>
          i === selectSlotIndex
            ? {
                ...o,
                pokemonSlug: identifier,
                abilitySlug: null,
                moves: [],
              }
            : o,
        ),
      );
    } else if (opponents.length < MAX_OPPONENTS) {
      // 新規スロット追加
      onChange([
        ...opponents,
        {
          key: nextOpponentKey(),
          pokemonSlug: identifier,
          itemSlug: null,
          abilitySlug: null,
          moves: [],
          selectionRole: null,
          notes: "",
        },
      ]);
    }
    setSelectOpen(false);
    setSelectSlotIndex(null);
  };

  const removeAt = (index: number) => {
    onChange(opponents.filter((_, i) => i !== index));
  };

  const cycleAt = (index: number) => {
    const current = opponents[index];
    if (!current) return;
    const others = opponents.filter((_, i) => i !== index);
    const counts = {
      back: others.filter((o) => o.selectionRole !== null).length,
      leads: others.filter((o) => o.selectionRole === "lead").length,
    };
    const nextRole = cycleOpponentRole(current.selectionRole, counts, format);
    onChange(opponents.map((o, i) => (i === index ? { ...o, selectionRole: nextRole } : o)));
  };

  const handleSlotHotkey = (index: number) => {
    if (index < opponents.length) {
      cycleAt(index);
    } else if (index === opponents.length && opponents.length < MAX_OPPONENTS) {
      openSelectFor(null);
    }
  };

  useHotkeys(
    "a",
    () => {
      if (opponents.length < MAX_OPPONENTS) {
        openSelectFor(null);
      }
    },
    [opponents],
  );

  useHotkeys("alt+r, shift+r", () => onChange([]), [onChange]);

  useHotkeys("alt+1, shift+1", () => handleSlotHotkey(0), [opponents, format]);
  useHotkeys("alt+2, shift+2", () => handleSlotHotkey(1), [opponents, format]);
  useHotkeys("alt+3, shift+3", () => handleSlotHotkey(2), [opponents, format]);
  useHotkeys("alt+4, shift+4", () => handleSlotHotkey(3), [opponents, format]);
  useHotkeys("alt+5, shift+5", () => handleSlotHotkey(4), [opponents, format]);
  useHotkeys("alt+6, shift+6", () => handleSlotHotkey(5), [opponents, format]);

  const slots = Array.from({ length: MAX_OPPONENTS }, (_, i) => opponents[i] ?? null);

  const excludedIdentifiers =
    selectSlotIndex !== null && selectSlotIndex < opponents.length
      ? (opponents
          .filter((_, i) => i !== selectSlotIndex)
          .map((o) => o.pokemonSlug)
          .filter(Boolean) as string[])
      : (opponents.map((o) => o?.pokemonSlug).filter(Boolean) as string[]);

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ ...flexRowCenter, mb: 1, flexWrap: "wrap" }}>
        <Typography variant="overline" sx={{ ...sectionLabel, fontWeight: 700 }}>
          {t("battleRecord.form.opponents")}
        </Typography>
        <Stack direction="row" spacing={1.5} sx={flexRowCenter}>
          <Legend color={LEAD_COLOR} label={t("battleRecord.selection.lead")} />
          <Legend color={BACK_COLOR} label={t("battleRecord.selection.back")} />
        </Stack>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {backCount}/{limits.maxBack} · {leadCount}/{limits.leadCount}{" "}
          {t("battleRecord.selection.leadShort")}
        </Typography>
        {backCount > 0 && (
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={() => onChange(opponents.map((o) => ({ ...o, selectionRole: null })))}
            sx={{
              fontSize: "0.75rem",
              py: 0.25,
              px: 0.75,
              minWidth: "auto",
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
            }}
          >
            {t("battleRecord.form.resetSelection")}
          </Button>
        )}
        {opponents.length > 0 && (
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={() => onChange([])}
            startIcon={<RestartAlt sx={{ fontSize: 15 }} />}
            sx={{
              fontSize: "0.75rem",
              py: 0.25,
              px: 0.75,
              minWidth: "auto",
              color: "text.secondary",
              "&:hover": { color: "error.main" },
            }}
          >
            {t("battleRecord.form.resetSlots")}
          </Button>
        )}
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(3, 1fr)", sm: "repeat(6, 1fr)" },
          gap: 1,
        }}
      >
        {slots.map((opponent, index) => {
          if (!opponent) {
            return (
              <Box
                key={`empty-${index}`}
                onClick={() => opponents.length < MAX_OPPONENTS && openSelectFor(null)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " " || e.key === "a" || e.key === "A") {
                    e.preventDefault();
                    if (opponents.length < MAX_OPPONENTS) openSelectFor(null);
                  }
                }}
                role="button"
                aria-label={t("battleRecord.form.addOpponent")}
                sx={{
                  aspectRatio: "1 / 1",
                  border: "1px dashed",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: opponents.length < MAX_OPPONENTS ? "pointer" : "default",
                  color: "text.disabled",
                  "&:hover": {
                    borderColor: opponents.length < MAX_OPPONENTS ? "primary.main" : "divider",
                  },
                  "&:focus-visible": {
                    outline: "2px solid",
                    outlineColor: "primary.main",
                  },
                  borderRadius: "10px",
                }}
              >
                <Add fontSize="small" />
              </Box>
            );
          }

          const color = roleColor(opponent.selectionRole);
          const hasDetail = Boolean(opponent.itemSlug) || opponent.moves.length > 0;

          return (
            <Box
              key={opponent.key}
              onClick={() => cycleAt(index)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  cycleAt(index);
                } else if (e.key === "c" || e.key === "C") {
                  e.preventDefault();
                  openSelectFor(index);
                } else if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  removeAt(index);
                } else if (e.key === "d" || e.key === "D") {
                  e.preventDefault();
                  setDetailIndex(index);
                }
              }}
              role="button"
              aria-label={t(`pokemon.${opponent.pokemonSlug}.name`)}
              aria-pressed={opponent.selectionRole !== null}
              sx={{
                position: "relative",
                aspectRatio: "1 / 1",
                border: "2px solid",
                borderColor: color ?? "divider",
                bgcolor: color ? alpha(color, 0.12) : "background.paper",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                opacity: opponent.selectionRole === null ? 0.75 : 1,
                transition: "border-color 0.15s, background-color 0.15s",
                "&:hover .slot-action": { opacity: 1 },
                "&:focus-visible .slot-action": { opacity: 1 },
                "&:focus-visible": {
                  outline: "2px solid",
                  outlineColor: "primary.main",
                },
                borderRadius: "10px",
              }}
            >
              <Image
                src={`/pokemon/${opponent.pokemonSlug}.png`}
                alt={opponent.pokemonSlug}
                width={44}
                height={44}
              />
              {/* 選出ロール表示（左下） */}
              {color && (
                <Box
                  sx={{
                    position: "absolute",
                    bottom: 4,
                    left: 4,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    bgcolor: color,
                    border: "2px solid",
                    borderColor: "background.paper",
                  }}
                />
              )}
              {/* 選び直す（左上） */}
              <IconButton
                className="slot-action"
                size="small"
                aria-label={t("battleRecord.form.changePokemon")}
                onClick={(e) => {
                  e.stopPropagation();
                  openSelectFor(index);
                }}
                sx={{
                  position: "absolute",
                  top: 2,
                  left: 2,
                  opacity: { xs: 1, sm: 0 },
                  transition: "opacity 0.15s",
                  bgcolor: "background.paperRaised",
                  border: "1px solid",
                  borderColor: "divider",
                  width: 22,
                  height: 22,
                  color: "text.secondary",
                  "&:hover": { bgcolor: "background.paperRaised", color: "primary.main" },
                }}
              >
                <Sync sx={{ fontSize: 14 }} />
              </IconButton>
              {/* 詳細を追記（右下） */}
              <IconButton
                className="slot-action"
                size="small"
                aria-label={t("battleRecord.form.editOpponent")}
                onClick={(e) => {
                  e.stopPropagation();
                  setDetailIndex(index);
                }}
                sx={{
                  position: "absolute",
                  bottom: 2,
                  right: 2,
                  opacity: { xs: 1, sm: 0 },
                  transition: "opacity 0.15s",
                  bgcolor: "background.paperRaised",
                  border: "1px solid",
                  borderColor: "divider",
                  width: 22,
                  height: 22,
                  color: hasDetail ? theme.palette.success.main : "text.secondary",
                  "&:hover": { bgcolor: "background.paperRaised" },
                }}
              >
                <EditNote sx={{ fontSize: 15 }} />
              </IconButton>
              {/* 削除（右上） */}
              <IconButton
                className="slot-action"
                size="small"
                aria-label={t("battleRecord.form.removeOpponent")}
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(index);
                }}
                sx={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  opacity: { xs: 1, sm: 0 },
                  transition: "opacity 0.15s",
                  bgcolor: "error.main",
                  color: "#fff",
                  width: 20,
                  height: 20,
                  "&:hover": { bgcolor: "error.dark" },
                }}
              >
                <Close sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          );
        })}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
        {t("battleRecord.selection.hint")}
      </Typography>

      <SelectPokemonDialog
        title={
          selectSlotIndex !== null
            ? t("battleRecord.form.changePokemon")
            : t("battleRecord.form.addOpponent")
        }
        open={selectOpen}
        onClose={() => {
          setSelectOpen(false);
          setSelectSlotIndex(null);
        }}
        translator={t}
        onChange={handlePokemonSelected}
        excludedIdentifiers={excludedIdentifiers}
      />

      <OpponentDetailDialog
        open={detailIndex !== null}
        opponent={detailIndex !== null ? (opponents[detailIndex] ?? null) : null}
        onClose={() => setDetailIndex(null)}
        onSave={(updated) => {
          if (detailIndex !== null) {
            onChange(opponents.map((o, i) => (i === detailIndex ? updated : o)));
          }
          setDetailIndex(null);
        }}
      />
    </Box>
  );
}
