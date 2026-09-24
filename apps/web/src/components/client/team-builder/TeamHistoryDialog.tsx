"use client";

import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
  Stack,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  List,
  ListItemButton,
  useTheme,
  useMediaQuery,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RestoreIcon from "@mui/icons-material/Restore";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HistoryIcon from "@mui/icons-material/History";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { parseDiffFromFile } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { fetchTeamRevisions, TeamRevisionData } from "@services/teams";
import { diffTeamSnapshots, type TeamSnapshot, type MemberChange } from "@/lib/team-diff";
import { itemById } from "@/data/items";
import { abilityById } from "@/data/abilities";
import { moveById } from "@/data/moves";
import { natureObjectToString } from "@/data/nature";
import type { TrainedPokemon } from "@/store/team/team";

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly teamId: string;
  readonly onRestore: (snapshot: TeamSnapshot) => void;
}

const STAT_LABELS: Record<string, string> = {
  hp: "H",
  atk: "A",
  def: "B",
  spa: "C",
  spd: "D",
  spe: "S",
};

function formatEvsSummary(pokemon: TrainedPokemon, t: (key: string) => string): string {
  const parts: string[] = [];
  const natureStr = natureObjectToString(pokemon.nature);
  const natureName = natureStr ? t(`natures.${natureStr.toLowerCase()}.name`) : "";

  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const val = pokemon.evs?.[key as keyof typeof pokemon.evs] ?? 0;
    if (val > 0) {
      let suffix = "";
      if (pokemon.nature?.plus === key) suffix = "+";
      if (pokemon.nature?.minus === key) suffix = "-";
      parts.push(`${label}${val}${suffix}`);
    }
  }

  const evs = parts.length > 0 ? parts.join(" ") : "0";
  return natureName ? `${natureName} (${evs})` : evs;
}

function formatFieldLabel(field: string, t: (key: string) => string): string {
  switch (field) {
    case "item":
      return t("teamBuilder.heldItem");
    case "ability":
      return t("teamBuilder.ability");
    case "nature":
      return t("teamBuilder.nature");
    case "moves":
      return t("teamBuilder.moves");
    case "evs":
      return t("teamBuilder.tabEvSpreads");
    case "gender":
      return t("teamBuilder.gender");
    case "description":
      return t("teamBuilder.pokemonNotes.title");
    default:
      return field;
  }
}

export function renderFieldDiff(
  field: string,
  from: TrainedPokemon,
  to: TrainedPokemon,
  t: (key: string) => string,
  primaryColor: string,
  isMobile = false,
) {
  switch (field) {
    case "item": {
      const fromItem = from.item ? itemById.get(from.item) : null;
      const toItem = to.item ? itemById.get(to.item) : null;
      return (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="body2" sx={{ textDecoration: "line-through", opacity: 0.6 }}>
            {fromItem
              ? t(`items.${fromItem.identifier}.name`)
              : t("teamBuilder.historyDialog.none")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            →
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, color: primaryColor }}>
            {toItem ? t(`items.${toItem.identifier}.name`) : t("teamBuilder.historyDialog.none")}
          </Typography>
        </Stack>
      );
    }
    case "ability": {
      const fromAbility = from.ability ? abilityById.get(from.ability) : null;
      const toAbility = to.ability ? abilityById.get(to.ability) : null;
      return (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="body2" sx={{ textDecoration: "line-through", opacity: 0.6 }}>
            {fromAbility
              ? t(`abilities.${fromAbility.identifier}.name`)
              : t("teamBuilder.historyDialog.none")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            →
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, color: primaryColor }}>
            {toAbility
              ? t(`abilities.${toAbility.identifier}.name`)
              : t("teamBuilder.historyDialog.none")}
          </Typography>
        </Stack>
      );
    }
    case "nature":
    case "evs": {
      if (isMobile) {
        return (
          <Box sx={{ minWidth: 0, my: 0.25 }}>
            <Typography
              variant="body2"
              sx={{ textDecoration: "line-through", opacity: 0.6, wordBreak: "break-word" }}
            >
              {formatEvsSummary(from, t)}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                lineHeight: 1.2,
                display: "block",
                my: 0.25,
                fontSize: "0.8rem",
              }}
            >
              ↓
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: primaryColor, wordBreak: "break-word" }}
            >
              {formatEvsSummary(to, t)}
            </Typography>
          </Box>
        );
      }

      return (
        <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
          <span style={{ textDecoration: "line-through", opacity: 0.6 }}>
            {formatEvsSummary(from, t)}
          </span>
          {" → "}
          <span style={{ fontWeight: 600, color: primaryColor }}>{formatEvsSummary(to, t)}</span>
        </Typography>
      );
    }
    case "moves": {
      const getMoveName = (id: number | null) =>
        id ? t(`moves.${moveById.get(id)?.identifier}.name`) : "-";
      const changedMoves: { from: string; to: string }[] = [];
      for (let i = 0; i < 4; i++) {
        if (from.moves?.[i] !== to.moves?.[i]) {
          changedMoves.push({
            from: getMoveName(from.moves?.[i] ?? null),
            to: getMoveName(to.moves?.[i] ?? null),
          });
        }
      }
      return (
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          {changedMoves.map((m, i) => (
            <Typography key={i} variant="body2" sx={{ wordBreak: "break-word" }}>
              <span style={{ textDecoration: "line-through", opacity: 0.6 }}>{m.from}</span>
              {" → "}
              <span style={{ fontWeight: 600, color: primaryColor }}>{m.to}</span>
            </Typography>
          ))}
        </Stack>
      );
    }
    case "description": {
      return (
        <Typography variant="body2" sx={{ fontStyle: "italic" }}>
          {to.description ? to.description : t("teamBuilder.historyDialog.none")}
        </Typography>
      );
    }
    default:
      return null;
  }
}

export function TeamHistoryDialog({ open, onClose, teamId, onRestore }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const {
    data: revisions = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["team-revisions", teamId],
    queryFn: () => fetchTeamRevisions(teamId),
    enabled: open && Boolean(teamId),
  });

  // 最新のリビジョンを先頭に表示
  const sortedRevisions = useMemo(() => [...revisions].reverse(), [revisions]);

  const [selectedRevId, setSelectedRevId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  // 選択中のリビジョン（未選択なら最新）
  const activeRev = useMemo(() => {
    if (sortedRevisions.length === 0) return null;
    return sortedRevisions.find((r) => r.id === selectedRevId) ?? sortedRevisions[0];
  }, [sortedRevisions, selectedRevId]);

  // 1つ前のリビジョン（時系列順で前のもの）
  const prevRev = useMemo(() => {
    if (!activeRev) return null;
    const origIndex = revisions.findIndex((r) => r.id === activeRev.id);
    return origIndex > 0 ? revisions[origIndex - 1] : null;
  }, [revisions, activeRev]);

  // 選択リビジョンのセマンティック差分
  // 1つ前のリビジョンが存在する場合、スナップショット同士から最新の正規化ロジックで差分を動的再計算
  const semanticDiff = useMemo(() => {
    if (!activeRev) return null;
    if (prevRev) {
      return diffTeamSnapshots(prevRev.snapshot, activeRev.snapshot);
    }
    return activeRev.diff;
  }, [activeRev, prevRev]);

  // Pokepaste の diff データを計算
  const fileDiff = useMemo(() => {
    if (!activeRev) return null;
    const oldText = prevRev?.snapshot.pokepaste ?? "";
    const newText = activeRev.snapshot.pokepaste;
    try {
      return parseDiffFromFile(
        { name: "pokepaste", contents: oldText },
        { name: "pokepaste", contents: newText },
      );
    } catch {
      return null;
    }
  }, [activeRev, prevRev]);

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString(i18n.language === "ja" ? "ja-JP" : "en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      return `${y}/${m}/${d} ${hh}:${mm}`;
    } catch {
      return isoString;
    }
  };

  const formatDateShort = (isoString: string) => {
    return formatDateTime(isoString);
  };

  const handleSelectRev = (rev: TeamRevisionData) => {
    setSelectedRevId(rev.id);
    if (isMobile) {
      setMobileShowDetail(true);
    }
  };

  const handleRestore = () => {
    if (!activeRev) return;
    onRestore(activeRev.snapshot);
    onClose();
  };

  const handleCopyPokepaste = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderMemberChangeCard = (change: MemberChange, idx: number, isMobileCard = false) => {
    const targetIdentifier = change.to?.identifier ?? change.from?.identifier ?? "";
    const targetName = targetIdentifier
      ? t(`pokemon.${targetIdentifier}.name`)
      : t("teamBuilder.emptySlot");

    return (
      <Paper
        key={idx}
        variant="outlined"
        sx={{
          p: 1.5,
          borderRadius: 1.5,
          bgcolor: "background.paperTint",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", justifyContent: "space-between", minWidth: 0 }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", minWidth: 0, flexGrow: 1 }}
          >
            {targetIdentifier && (
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                <Image
                  src={`/pokemon/${targetIdentifier}.png`}
                  alt={targetIdentifier}
                  width={28}
                  height={28}
                />
              </Box>
            )}
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                {targetName}
              </Typography>
            </Box>
          </Stack>

          <Chip
            size="small"
            color={
              change.kind === "added"
                ? "success"
                : change.kind === "removed"
                  ? "error"
                  : change.kind === "replaced"
                    ? "warning"
                    : "info"
            }
            label={
              change.kind === "added"
                ? `+ ${t("teamBuilder.historyDialog.kindAdded")}`
                : change.kind === "removed"
                  ? `- ${t("teamBuilder.historyDialog.kindRemoved")}`
                  : change.kind === "replaced"
                    ? t("teamBuilder.historyDialog.kindReplaced")
                    : t("teamBuilder.historyDialog.kindUpdated")
            }
            sx={{ fontWeight: 600, height: 22, fontSize: "0.72rem", flexShrink: 0 }}
          />
        </Stack>

        {change.kind === "replaced" && change.from && change.to && (
          <Typography variant="body2" sx={{ pl: 0.5, wordBreak: "break-word" }}>
            <span style={{ textDecoration: "line-through", opacity: 0.6 }}>
              {t(`pokemon.${change.from.identifier}.name`)}
            </span>
            {" → "}
            <span style={{ fontWeight: 600, color: theme.palette.warning.main }}>
              {t(`pokemon.${change.to.identifier}.name`)}
            </span>
          </Typography>
        )}

        {change.kind === "updated" && change.from && change.to && (
          <Stack spacing={0.75} sx={{ pl: 0.5, minWidth: 0 }}>
            {change.changedFields.map((field) => (
              <Box key={field} sx={{ minWidth: 0 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600, display: "block" }}
                >
                  {formatFieldLabel(field, t)}:
                </Typography>
                <Box sx={{ pl: 1, mt: 0.25, minWidth: 0 }}>
                  {renderFieldDiff(
                    field,
                    change.from!,
                    change.to!,
                    t,
                    theme.palette.primary.main,
                    isMobileCard,
                  )}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>
    );
  };

  const renderPokemonLineupCard = (pokemon: TrainedPokemon | null, slotIdx: number) => {
    if (!pokemon) {
      return (
        <Paper
          key={slotIdx}
          variant="outlined"
          sx={{
            p: 1.25,
            borderRadius: 1.5,
            bgcolor: "background.paperTint",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 60,
            borderStyle: "dashed",
            opacity: 0.6,
            minWidth: 0,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {t("teamBuilder.emptySlot")}
          </Typography>
        </Paper>
      );
    }

    const item = pokemon.item ? itemById.get(pokemon.item) : null;
    const ability = pokemon.ability ? abilityById.get(pokemon.ability) : null;

    return (
      <Paper
        key={slotIdx}
        variant="outlined"
        sx={{
          p: 1.25,
          borderRadius: 1.5,
          bgcolor: "background.paperTint",
          display: "flex",
          flexDirection: "column",
          gap: 0.75,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1,
              bgcolor: "action.hover",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <Image
              src={`/pokemon/${pokemon.identifier}.png`}
              alt={pokemon.identifier}
              width={32}
              height={32}
            />
          </Box>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
              {t(`pokemon.${pokemon.identifier}.name`)}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ display: "block", fontSize: "0.72rem" }}
            >
              {item
                ? `@ ${t(`items.${item.identifier}.name`)}`
                : `@ ${t("teamBuilder.historyDialog.none")}`}
            </Typography>
          </Box>
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          sx={{
            flexWrap: "wrap",
            gap: 0.5,
            alignItems: "center",
            minWidth: 0,
          }}
        >
          {ability && (
            <Chip
              size="small"
              variant="outlined"
              label={t(`abilities.${ability.identifier}.name`)}
              sx={{ height: 20, fontSize: "0.68rem" }}
            />
          )}
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, fontSize: "0.72rem", wordBreak: "break-word" }}
          >
            {formatEvsSummary(pokemon, t)}
          </Typography>
        </Stack>

        {pokemon.moves && pokemon.moves.some(Boolean) && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontSize: "0.68rem",
              wordBreak: "break-word",
            }}
          >
            {pokemon.moves
              .filter((m): m is number => Boolean(m))
              .map((id) => t(`moves.${moveById.get(id)?.identifier}.name`))
              .join(" / ")}
          </Typography>
        )}
      </Paper>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            height: isMobile ? "100%" : "85vh",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: 1.5,
          px: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          {isMobile && mobileShowDetail ? (
            <>
              <IconButton
                edge="start"
                size="small"
                onClick={() => setMobileShowDetail(false)}
                aria-label={t("common.back")}
              >
                <ArrowBackIcon />
              </IconButton>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                {activeRev ? formatDateTime(activeRev.createdAt) : ""}
              </Typography>
            </>
          ) : (
            <>
              <HistoryIcon color="primary" />
              <Typography variant="h6" component="div">
                {t("teamBuilder.historyDialog.title")}
              </Typography>
            </>
          )}
        </Stack>
        <IconButton size="small" onClick={onClose} aria-label={t("common.close")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, flexGrow: 1, display: "flex", overflow: "hidden" }}>
        {isLoading ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              width: "100%",
              p: 4,
            }}
          >
            <CircularProgress />
          </Box>
        ) : isError ? (
          <Box sx={{ p: 3, width: "100%" }}>
            <Alert severity="error">{t("teamBuilder.historyDialog.error")}</Alert>
          </Box>
        ) : sortedRevisions.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              p: 4,
            }}
          >
            <HistoryIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1, opacity: 0.5 }} />
            <Typography variant="body1" color="text.secondary">
              {t("teamBuilder.historyDialog.empty")}
            </Typography>
          </Box>
        ) : isMobile ? (
          // ── モバイル専用 2ステップ UI ──────────────────────────────────
          !mobileShowDetail ? (
            // [モバイル Step 1: 一覧リスト画面]
            <Box sx={{ width: "100%", height: "100%", overflowY: "auto" }}>
              <List disablePadding>
                {sortedRevisions.map((rev, index) => {
                  const isLatest = index === 0;
                  const validCount = rev.diff.members.filter(
                    (m) => m.kind !== "updated" || m.changedFields.length > 0,
                  ).length;

                  return (
                    <React.Fragment key={rev.id}>
                      <ListItemButton
                        onClick={() => handleSelectRev(rev)}
                        sx={{
                          py: 1.5,
                          px: 2,
                          alignItems: "stretch",
                          flexDirection: "column",
                          gap: 1,
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: "center", justifyContent: "space-between" }}
                        >
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Typography
                              variant="caption"
                              sx={{
                                fontFamily: "monospace",
                                bgcolor: "action.hover",
                                px: 0.75,
                                py: 0.25,
                                borderRadius: 0.5,
                                fontWeight: 700,
                              }}
                            >
                              {rev.id.slice(0, 7)}
                            </Typography>
                            {isLatest && (
                              <Chip
                                label={t("teamBuilder.historyDialog.latest")}
                                size="small"
                                color="primary"
                                sx={{ height: 20, fontSize: "0.7rem" }}
                              />
                            )}
                            <Typography variant="caption" color="text.secondary">
                              {formatDateShort(rev.createdAt)}
                            </Typography>
                          </Stack>
                          <ChevronRightIcon color="action" fontSize="small" />
                        </Stack>

                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                          {rev.snapshot.name || t("teamBuilder.historyDialog.untitled")}
                        </Typography>

                        {/* 変更サマリーバッジ */}
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                          {rev.diff.name && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={t("teamBuilder.historyDialog.nameChanged")}
                              sx={{ height: 20, fontSize: "0.68rem" }}
                            />
                          )}
                          {rev.diff.description && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={t("teamBuilder.historyDialog.noteChanged")}
                              sx={{ height: 20, fontSize: "0.68rem" }}
                            />
                          )}
                          {validCount > 0 && (
                            <Chip
                              size="small"
                              variant="outlined"
                              color="secondary"
                              label={t("teamBuilder.historyDialog.memberChangesCount", {
                                count: validCount,
                              })}
                              sx={{ height: 20, fontSize: "0.68rem" }}
                            />
                          )}
                        </Stack>

                        {/* ポケモンアイコン 6枠 */}
                        <Stack direction="row" spacing={0.5}>
                          {rev.snapshot.members.map((member, slotIdx) => (
                            <Box
                              key={slotIdx}
                              sx={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                bgcolor: "action.hover",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "hidden",
                              }}
                            >
                              {member ? (
                                <Image
                                  src={`/pokemon/${member.identifier}.png`}
                                  alt={member.identifier}
                                  width={22}
                                  height={22}
                                />
                              ) : null}
                            </Box>
                          ))}
                        </Stack>
                      </ListItemButton>
                      <Divider />
                    </React.Fragment>
                  );
                })}
              </List>
            </Box>
          ) : (
            // [モバイル Step 2: 専用詳細画面]
            activeRev && (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  width: "100%",
                }}
              >
                {/* スクロール領域 */}
                <Box
                  sx={{ flexGrow: 1, overflowY: "auto", overflowX: "hidden", p: 2, minWidth: 0 }}
                >
                  {/* チーム名・備考 */}
                  <Box sx={{ mb: 2.5, minWidth: 0 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, wordBreak: "break-word" }}>
                      {activeRev.snapshot.name || t("teamBuilder.historyDialog.untitled")}
                    </Typography>
                    {activeRev.snapshot.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontStyle: "italic", mt: 0.5, wordBreak: "break-word" }}
                      >
                        {activeRev.snapshot.description}
                      </Typography>
                    )}
                  </Box>

                  {/* 前バージョンからの変更点 (最重要のため上に配置) */}
                  <Box sx={{ mb: 3, minWidth: 0 }}>
                    <Typography
                      variant="subtitle2"
                      color="text.secondary"
                      sx={{ fontWeight: 700, mb: 1 }}
                    >
                      {t("teamBuilder.historyDialog.changesTitle")}
                    </Typography>

                    {!prevRev ? (
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          bgcolor: "background.paperTint",
                          borderRadius: 1.5,
                          minWidth: 0,
                        }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          {t("teamBuilder.historyDialog.initialCommit")}
                        </Typography>
                      </Paper>
                    ) : (
                      <Stack spacing={1} sx={{ minWidth: 0 }}>
                        {semanticDiff?.name && (
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 1.5,
                              bgcolor: "background.paperTint",
                              borderRadius: 1.5,
                              minWidth: 0,
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontWeight: 600 }}
                            >
                              {t("teamBuilder.teamName")}
                            </Typography>
                            <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                              <span style={{ textDecoration: "line-through", opacity: 0.6 }}>
                                {semanticDiff.name.from || t("teamBuilder.historyDialog.untitled")}
                              </span>
                              {" → "}
                              <span style={{ fontWeight: 600, color: theme.palette.primary.main }}>
                                {semanticDiff.name.to}
                              </span>
                            </Typography>
                          </Paper>
                        )}

                        {semanticDiff?.description && (
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 1.5,
                              bgcolor: "background.paperTint",
                              borderRadius: 1.5,
                              minWidth: 0,
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontWeight: 600 }}
                            >
                              {t("teamBuilder.teamDescription")}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ fontStyle: "italic", wordBreak: "break-word" }}
                            >
                              {semanticDiff.description.to || t("teamBuilder.historyDialog.none")}
                            </Typography>
                          </Paper>
                        )}

                        {semanticDiff &&
                        semanticDiff.members.filter(
                          (m) => m.kind !== "updated" || m.changedFields.length > 0,
                        ).length > 0 ? (
                          semanticDiff.members
                            .filter((m) => m.kind !== "updated" || m.changedFields.length > 0)
                            .map((change, idx) => renderMemberChangeCard(change, idx, true))
                        ) : !semanticDiff?.name && !semanticDiff?.description ? (
                          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                            {t("teamBuilder.historyDialog.noDiff")}
                          </Typography>
                        ) : null}
                      </Stack>
                    )}
                  </Box>

                  {/* その時点のパーティ (6体) */}
                  <Box sx={{ mb: 3, minWidth: 0 }}>
                    <Typography
                      variant="subtitle2"
                      color="text.secondary"
                      sx={{ fontWeight: 700, mb: 1 }}
                    >
                      {t("teamBuilder.historyDialog.lineupTitle")}
                    </Typography>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "minmax(0, 1fr)",
                          sm: "repeat(2, minmax(0, 1fr))",
                        },
                        gap: 1,
                        minWidth: 0,
                      }}
                    >
                      {activeRev.snapshot.members.map((m, idx) => renderPokemonLineupCard(m, idx))}
                    </Box>
                  </Box>

                  {/* Pokepaste テキスト (Collapsed Accordion) */}
                  <Accordion
                    disableGutters
                    sx={{
                      bgcolor: "transparent",
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 1.5,
                      "&:before": { display: "none" },
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {t("teamBuilder.historyDialog.viewPokepaste")}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 1.5 }}>
                      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
                          onClick={() => handleCopyPokepaste(activeRev.snapshot.pokepaste)}
                        >
                          {copied
                            ? t("teamBuilder.historyDialog.copied")
                            : t("teamBuilder.historyDialog.copyPokepaste")}
                        </Button>
                      </Box>
                      <Box
                        component="pre"
                        sx={{
                          p: 1.5,
                          bgcolor: "background.paperTint",
                          borderRadius: 1,
                          fontSize: "0.75rem",
                          overflowX: "auto",
                          fontFamily: "monospace",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          m: 0,
                        }}
                      >
                        {activeRev.snapshot.pokepaste || t("teamBuilder.historyDialog.noDiff")}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </Box>

                {/* 画面下部固定の復元バー */}
                <Box
                  sx={{
                    p: 2,
                    bgcolor: "background.paper",
                    borderTop: 1,
                    borderColor: "divider",
                    flexShrink: 0,
                  }}
                >
                  <Button
                    variant="contained"
                    color="primary"
                    fullWidth
                    size="large"
                    startIcon={<RestoreIcon />}
                    onClick={handleRestore}
                  >
                    {t("teamBuilder.historyDialog.restoreAction")}
                  </Button>
                </Box>
              </Box>
            )
          )
        ) : (
          // ── デスクトップ用 2ペイン UI ───────────────────────────────────
          <Box sx={{ display: "flex", width: "100%", height: "100%" }}>
            {/* 左ペイン: コミット一覧 */}
            <Box
              sx={{
                width: 320,
                minWidth: 280,
                borderRight: 1,
                borderColor: "divider",
                overflowY: "auto",
                bgcolor: "background.paper",
              }}
            >
              <List disablePadding>
                {sortedRevisions.map((rev, index) => {
                  const isSelected = rev.id === activeRev?.id;
                  const isLatest = index === 0;
                  const validCount = rev.diff.members.filter(
                    (m) => m.kind !== "updated" || m.changedFields.length > 0,
                  ).length;

                  return (
                    <React.Fragment key={rev.id}>
                      <ListItemButton
                        selected={isSelected}
                        onClick={() => handleSelectRev(rev)}
                        sx={{
                          py: 1.5,
                          px: 2,
                          alignItems: "flex-start",
                          flexDirection: "column",
                          gap: 0.5,
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ width: "100%", alignItems: "center" }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              fontFamily: "monospace",
                              bgcolor: "action.hover",
                              px: 0.75,
                              py: 0.25,
                              borderRadius: 0.5,
                              fontWeight: 700,
                            }}
                          >
                            {rev.id.slice(0, 7)}
                          </Typography>
                          {isLatest && (
                            <Chip
                              label={t("teamBuilder.historyDialog.latest")}
                              size="small"
                              color="primary"
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                          )}
                          <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                            {formatDate(rev.createdAt)}
                          </Typography>
                        </Stack>

                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                          {rev.snapshot.name || t("teamBuilder.historyDialog.untitled")}
                        </Typography>

                        {/* 変更の概要バッジ */}
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.5 }}
                        >
                          {rev.diff.name && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={t("teamBuilder.historyDialog.nameChanged")}
                              sx={{ height: 20, fontSize: "0.68rem" }}
                            />
                          )}
                          {rev.diff.description && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={t("teamBuilder.historyDialog.noteChanged")}
                              sx={{ height: 20, fontSize: "0.68rem" }}
                            />
                          )}
                          {validCount > 0 && (
                            <Chip
                              size="small"
                              variant="outlined"
                              color="secondary"
                              label={t("teamBuilder.historyDialog.memberChangesCount", {
                                count: validCount,
                              })}
                              sx={{ height: 20, fontSize: "0.68rem" }}
                            />
                          )}
                        </Stack>

                        {/* ポケモンアイコン 6枠 */}
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }}>
                          {rev.snapshot.members.map((member, slotIdx) => (
                            <Box
                              key={slotIdx}
                              sx={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                bgcolor: "action.hover",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "hidden",
                              }}
                            >
                              {member ? (
                                <Image
                                  src={`/pokemon/${member.identifier}.png`}
                                  alt={member.identifier}
                                  width={22}
                                  height={22}
                                />
                              ) : null}
                            </Box>
                          ))}
                        </Stack>
                      </ListItemButton>
                      <Divider />
                    </React.Fragment>
                  );
                })}
              </List>
            </Box>

            {/* 右ペイン: 詳細 */}
            {activeRev && (
              <Box
                sx={{
                  flexGrow: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflowY: "auto",
                  p: 3,
                }}
              >
                {/* リビジョンヘッダー */}
                <Stack spacing={1.5} sx={{ mb: 2 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
                  >
                    <Box>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: "monospace",
                            bgcolor: "action.hover",
                            px: 1,
                            py: 0.25,
                            borderRadius: 0.5,
                            fontWeight: 700,
                          }}
                        >
                          {activeRev.id.slice(0, 7)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(activeRev.createdAt)}
                        </Typography>
                      </Stack>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {activeRev.snapshot.name || t("teamBuilder.historyDialog.untitled")}
                      </Typography>
                      {activeRev.snapshot.description && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontStyle: "italic", mt: 0.5 }}
                        >
                          {activeRev.snapshot.description}
                        </Typography>
                      )}
                    </Box>

                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<RestoreIcon />}
                      onClick={handleRestore}
                      size="small"
                    >
                      {t("teamBuilder.historyDialog.restoreAction")}
                    </Button>
                  </Stack>

                  {/* メンバーミニプレビュー */}
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    {activeRev.snapshot.members.map((member, slotIdx) => (
                      <Tooltip
                        key={slotIdx}
                        title={member ? member.identifier : t("teamBuilder.emptySlot")}
                      >
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 1,
                            bgcolor: "background.paperTint",
                            border: 1,
                            borderColor: "divider",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {member ? (
                            <Image
                              src={`/pokemon/${member.identifier}.png`}
                              alt={member.identifier}
                              width={32}
                              height={32}
                            />
                          ) : null}
                        </Box>
                      </Tooltip>
                    ))}
                  </Stack>

                  {/* セマンティック差分カード一覧 */}
                  {semanticDiff &&
                    (semanticDiff.name ||
                      semanticDiff.description ||
                      semanticDiff.members.some(
                        (m) => m.kind !== "updated" || m.changedFields.length > 0,
                      )) && (
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: "background.paperTint",
                          border: 1,
                          borderColor: "divider",
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 700, display: "block", mb: 1 }}
                        >
                          {t("teamBuilder.historyDialog.semanticDiffTitle")}
                        </Typography>
                        <Stack spacing={1}>
                          {semanticDiff.name && (
                            <Typography variant="body2">
                              {t("teamBuilder.teamName")}:{" "}
                              <span style={{ textDecoration: "line-through", opacity: 0.6 }}>
                                {semanticDiff.name.from}
                              </span>
                              {" → "}
                              <span style={{ fontWeight: 600, color: theme.palette.primary.main }}>
                                {semanticDiff.name.to}
                              </span>
                            </Typography>
                          )}
                          {semanticDiff.description && (
                            <Typography variant="body2">
                              {t("teamBuilder.teamDescription")}:{" "}
                              <span style={{ fontStyle: "italic" }}>
                                {semanticDiff.description.to}
                              </span>
                            </Typography>
                          )}
                          {semanticDiff.members
                            .filter(
                              (change) =>
                                change.kind !== "updated" || change.changedFields.length > 0,
                            )
                            .map((change, idx) => renderMemberChangeCard(change, idx, false))}
                        </Stack>
                      </Box>
                    )}
                </Stack>

                <Divider sx={{ my: 1.5 }} />

                {/* Git diff 形式表示 */}
                <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, display: "block", mb: 1, color: "text.secondary" }}
                  >
                    {t("teamBuilder.historyDialog.pokepasteDiffTitle")}
                  </Typography>
                  {fileDiff ? (
                    <Box
                      sx={{
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 1,
                        overflow: "hidden",
                      }}
                    >
                      <FileDiff fileDiff={fileDiff} disableWorkerPool />
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t("teamBuilder.historyDialog.noDiff")}
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      {/* モバイルで詳細画面表示中以外はダイアログ下部に閉じるボタンを表示 */}
      {(!isMobile || !mobileShowDetail) && (
        <DialogActions sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
          <Button onClick={onClose} color="inherit">
            {t("common.close")}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
