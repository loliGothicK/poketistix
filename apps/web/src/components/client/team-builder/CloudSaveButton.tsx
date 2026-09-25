"use client";

import React, { useState, useRef, useCallback } from "react";
import Image from "next/image";
import {
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  Box,
  Typography,
  SpeedDialAction,
  SpeedDialActionProps,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Checkbox,
  Stack,
  Badge,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CheckIcon from "@mui/icons-material/Check";
import CommitIcon from "@mui/icons-material/Commit";
import ChecklistIcon from "@mui/icons-material/Checklist";
import ArchiveIcon from "@mui/icons-material/Archive";
import UnarchiveIcon from "@mui/icons-material/Unarchive";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import { useAtomValue, useSetAtom } from "jotai";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { localTeamsAtom, Team } from "@/store/team/team";
import { isAuthenticatedAtom } from "@/store/auth";
import { saveTeamsToServer } from "@services/teams";
import { teamSchema, teamSaveSchema } from "@/lib/validator/team";
import { useActiveTeam } from "@/hooks/useActiveTeam";
import { useTeamsData } from "@/hooks/useTeamsData";
import { formatTeamValidationIssues } from "@/lib/validator/format-issues";
import { formatFieldLabel, renderFieldDiff } from "./TeamHistoryDialog";
import { useTheme } from "@mui/material/styles";
import {
  useHasSyncableDiff,
  useTeamStash,
  useSyncableChanges,
  buildPartialTeam,
  getAllChangeIds,
  type SyncChangeItem,
} from "@/hooks/useSyncState";

const LONG_PRESS_MS = 500;

type CloudSaveButtonProps = {
  asSpeedDialAction?: boolean;
} & Partial<SpeedDialActionProps>;

type SaveMutationOptions = {
  teamToSave?: Team;
  commitMessage?: string;
  isPartialCommit?: boolean;
};

export const CloudSaveButton = React.forwardRef<HTMLButtonElement, CloudSaveButtonProps>(
  ({ asSpeedDialAction, ...props }, ref) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const isAuthenticated = useAtomValue(isAuthenticatedAtom);
    const localTeams = useAtomValue(localTeamsAtom);
    const setLocalTeams = useSetAtom(localTeamsAtom);
    const [activeTeam] = useActiveTeam();
    const { isLoading: isTeamsLoading } = useTeamsData();
    const queryClient = useQueryClient();

    const [snackOpen, setSnackOpen] = useState(false);
    const [snackMessage, setSnackMessage] = useState("");
    const [snackSeverity, setSnackSeverity] = useState<"success" | "error">("success");

    // コンテキストメニュー (長押し / 右クリック)
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // git commit -am ダイアログ
    const [commitDialogOpen, setCommitDialogOpen] = useState(false);
    const [commitMessage, setCommitMessage] = useState("");

    // git commit -i (変更を選択してコミット) ダイアログ
    const [includeDialogOpen, setIncludeDialogOpen] = useState(false);
    const [selectedChangeIds, setSelectedChangeIds] = useState<Set<string>>(new Set());
    const [includeCommitMessage, setIncludeCommitMessage] = useState("");

    // Semantic diff 状態
    const { changes: syncableChanges, serverTeam } = useSyncableChanges(activeTeam);
    const hasSyncableDiff = useHasSyncableDiff(activeTeam);
    const { stash, unstash, dropStash, stashEntry, hasStash } = useTeamStash(activeTeam);

    const saveMutation = useMutation({
      mutationFn: async (options?: SaveMutationOptions) => {
        if (!activeTeam) throw new Error("No active team to save");
        const targetTeam = options?.teamToSave ?? activeTeam;
        const candidates = [targetTeam, ...localTeams.filter((t) => t.id !== activeTeam.id)];
        const validTeams = candidates.filter((t) => teamSaveSchema.safeParse(t).success);
        if (validTeams.length === 0) {
          throw new Error(t("teamBuilder.validation.noValidTeams"));
        }
        await saveTeamsToServer(validTeams, options?.commitMessage);
        return { validTeams, isPartialCommit: Boolean(options?.isPartialCommit) };
      },
      onSuccess: async ({ validTeams, isPartialCommit }) => {
        await queryClient.refetchQueries({ queryKey: ["teams"] });
        void queryClient.invalidateQueries({ queryKey: ["team-revisions"] });

        // 部分コミット（git commit -i で一部のみ同期）の場合は、未コミット差分を継続して編集できるように localTeams から削除しない
        if (!isPartialCommit) {
          const savedIds = new Set(validTeams.map((t) => t.id));
          setLocalTeams((prev) => prev.filter((t) => !savedIds.has(t.id)));
        }

        setSnackMessage(t("teamBuilder.saveSuccess"));
        setSnackSeverity("success");
        setSnackOpen(true);
      },
      onError: (error) => {
        setSnackMessage(error.message);
        setSnackSeverity("error");
        setSnackOpen(true);
      },
    });

    // 長押し開始
    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return; // 左クリックのみ
      longPressTimer.current = setTimeout(() => {
        setMenuAnchor(e.currentTarget);
      }, LONG_PRESS_MS);
    }, []);

    // 長押し解除
    const handlePointerUp = useCallback(() => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }, []);

    // 右クリック
    const handleContextMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      setMenuAnchor(e.currentTarget);
    }, []);

    // 通常クリック（即時 Sync）
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLElement>) => {
        // 長押しが発火していた場合はメニューが開いているのでクリックを無視
        if (menuAnchor) return;
        if (!isSaved && !isLoading) {
          saveMutation.mutate(undefined);
        }
        void e;
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [menuAnchor, saveMutation],
    );

    const handleMenuClose = () => setMenuAnchor(null);

    const handleCommitWithMessage = () => {
      handleMenuClose();
      setCommitMessage("");
      setCommitDialogOpen(true);
    };

    const handleCommitConfirm = () => {
      setCommitDialogOpen(false);
      saveMutation.mutate({ commitMessage: commitMessage.trim() || undefined });
    };

    const allChangeIds = getAllChangeIds(syncableChanges);

    const handleOpenIncludeCommit = () => {
      handleMenuClose();
      // デフォルトはすべての変更を選択
      setSelectedChangeIds(new Set(allChangeIds));
      setIncludeCommitMessage("");
      setIncludeDialogOpen(true);
    };

    const handleToggleChange = (id: string) => {
      setSelectedChangeIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    };

    const handleToggleSlot = (change: Extract<SyncChangeItem, { type: "slot" }>) => {
      if (change.kind === "updated" && change.fieldChanges.length > 0) {
        const fieldIds = change.fieldChanges.map((f) => f.id);
        const isAllSelected = fieldIds.every((id) => selectedChangeIds.has(id));
        setSelectedChangeIds((prev) => {
          const next = new Set(prev);
          if (isAllSelected) {
            fieldIds.forEach((id) => next.delete(id));
            next.delete(change.id);
          } else {
            fieldIds.forEach((id) => next.add(id));
          }
          return next;
        });
      } else {
        handleToggleChange(change.id);
      }
    };

    const handleSelectAll = () => {
      setSelectedChangeIds(new Set(allChangeIds));
    };

    const handleDeselectAll = () => {
      setSelectedChangeIds(new Set());
    };

    const handleIncludeCommitConfirm = () => {
      if (!activeTeam || selectedChangeIds.size === 0) return;
      const partialTeam = buildPartialTeam(serverTeam, activeTeam, selectedChangeIds);
      const isPartialCommit = selectedChangeIds.size < allChangeIds.length;
      saveMutation.mutate({
        teamToSave: partialTeam,
        commitMessage: includeCommitMessage.trim() || undefined,
        isPartialCommit,
      });
      setIncludeDialogOpen(false);
    };

    const handleStash = () => {
      handleMenuClose();
      stash();
      setSnackMessage(t("teamBuilder.sync.stashed"));
      setSnackSeverity("success");
      setSnackOpen(true);
    };

    const handleUnstash = () => {
      handleMenuClose();
      unstash();
      setSnackMessage(t("teamBuilder.sync.unstashed"));
      setSnackSeverity("success");
      setSnackOpen(true);
    };

    const handleDropStash = () => {
      handleMenuClose();
      dropStash();
      setSnackMessage(t("teamBuilder.sync.stashDropped"));
      setSnackSeverity("success");
      setSnackOpen(true);
    };

    if (!isAuthenticated || !activeTeam) return null;

    const parseResult = teamSchema.safeParse(activeTeam);
    const isDraft = !parseResult.success;
    const draftReasons = formatTeamValidationIssues(parseResult, t, activeTeam.members);

    // semantic diff がある時のみ Sync をアクティブにする（差分がなければ同期済み）
    const isSaved = !hasSyncableDiff;
    const isLoading = saveMutation.isPending || isTeamsLoading;

    const actionIcon = isLoading ? (
      <CircularProgress size={16} color="inherit" />
    ) : isSaved ? (
      <CheckIcon />
    ) : (
      <CloudUploadIcon />
    );

    const actionText = isLoading
      ? t("teamBuilder.saving")
      : isSaved
        ? t("teamBuilder.saved")
        : isDraft
          ? `${t("teamBuilder.saveToCloud")} (${t("teamBuilder.draft")})`
          : t("teamBuilder.saveToCloud");

    const changedPokemonChanges = syncableChanges.filter(
      (c): c is Extract<SyncChangeItem, { type: "slot" }> => c.type === "slot",
    );
    const teamMetadataChanges = syncableChanges.filter((c) => c.type !== "slot");

    // 変更された項目（Diffs）の総数
    // 技（moves）は1個で1カウント、その他（持ち物、特性、性格、努力値、チーム名等）も各1カウント
    const totalChangedItemsCount = syncableChanges.reduce((acc, change) => {
      if (change.type === "slot") {
        if (change.kind === "added" || change.kind === "removed" || change.kind === "replaced") {
          return acc + 1;
        }
        return acc + (change.changedFields.length > 0 ? change.changedFields.length : 1);
      }
      return acc + 1;
    }, 0);

    const badgeInvisible = isSaved || isLoading || totalChangedItemsCount === 0;

    const badgedActionIcon = (
      <Badge
        color="secondary"
        badgeContent={totalChangedItemsCount}
        invisible={badgeInvisible}
        overlap="circular"
        sx={{
          "& .MuiBadge-badge": {
            fontSize: "0.65rem",
            fontWeight: 700,
            fontFamily: "monospace",
            pointerEvents: "none",
          },
        }}
      >
        {actionIcon}
      </Badge>
    );

    const button = asSpeedDialAction ? (
      <SpeedDialAction
        {...(props as SpeedDialActionProps)}
        ref={ref as React.Ref<HTMLDivElement>}
        icon={badgedActionIcon}
        title={actionText}
        onClick={() => saveMutation.mutate(undefined)}
        slotProps={{
          tooltip: { title: actionText, open: true },
          fab: { disabled: isLoading || isSaved },
        }}
      />
    ) : (
      <Box sx={{ display: "inline-flex", alignItems: "center" }} onContextMenu={handleContextMenu}>
        <Badge
          badgeContent={totalChangedItemsCount}
          color="secondary"
          invisible={badgeInvisible}
          overlap="circular"
          sx={{
            "& .MuiBadge-badge": {
              top: 4,
              right: 12,
              fontSize: "0.68rem",
              fontWeight: 700,
              fontFamily: "monospace",
              pointerEvents: "none",
              border: (theme) => `2px solid ${theme.palette.background.paper}`,
              boxShadow: 1,
            },
          }}
        >
          <Button
            ref={ref}
            variant={hasSyncableDiff ? "contained" : "outlined"}
            disableElevation
            color={hasSyncableDiff ? (isDraft ? "warning" : "primary") : "inherit"}
            disabled={isLoading || isSaved}
            startIcon={actionIcon}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            aria-label={
              badgeInvisible
                ? actionText
                : `${actionText}, ${t("teamBuilder.sync.changedItemsCount", { count: totalChangedItemsCount })}`
            }
            sx={{ transition: "all 0.2s", minWidth: 120 }}
          >
            {actionText}
          </Button>
        </Badge>
      </Box>
    );

    // 差分変更項目ホバー Tooltip コンテンツ（複数行・折り返しタグで幅不足を解消）
    const diffTooltipContent = hasSyncableDiff ? (
      <Box sx={{ p: 1.25, minWidth: 260, maxWidth: 360 }}>
        {/* ドラフト理由 */}
        {isDraft && draftReasons.length > 0 && (
          <Box sx={{ mb: 1, pb: 0.75, borderBottom: 1, borderColor: "divider" }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, display: "block", color: "warning.main", mb: 0.25 }}
            >
              {t("teamBuilder.draftReasonTitle")}
            </Typography>
            {draftReasons.map((reason, i) => (
              <Typography
                key={i}
                variant="caption"
                sx={{ display: "block", color: "text.secondary" }}
              >
                • {reason}
              </Typography>
            ))}
          </Box>
        )}

        {/* 差分ヘッダー（変更項目数の合計を表示） */}
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: "text.secondary", display: "block", mb: 1 }}
        >
          {t("teamBuilder.sync.diffOverlayTitle")} (
          {t("teamBuilder.sync.changedItemsCount", { count: totalChangedItemsCount })})
        </Typography>

        {/* 変更されたポケモン・項目リスト */}
        <Stack spacing={1}>
          {changedPokemonChanges.map((change) => {
            const pokemonName = change.identifier
              ? t(`pokemon.${change.identifier}.name`)
              : t("teamBuilder.emptySlot");

            return (
              <Box
                key={change.id}
                sx={{
                  p: 0.75,
                  borderRadius: 1.25,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: (theme) =>
                    theme.palette.mode === "dark"
                      ? "rgba(255, 255, 255, 0.03)"
                      : "rgba(0, 0, 0, 0.02)",
                }}
              >
                {/* 1行目: スロット番号 + ポケモン名 + 変更種別バッジ */}
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  {change.identifier && (
                    <Image
                      src={`/pokemon/${change.identifier}.png`}
                      alt={change.identifier}
                      width={22}
                      height={22}
                      style={{ objectFit: "contain" }}
                    />
                  )}
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    Slot {change.slot + 1}:
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {change.kind === "replaced"
                      ? `${t(`pokemon.${change.from?.identifier}.name`)} → ${t(`pokemon.${change.to?.identifier}.name`)}`
                      : pokemonName}
                  </Typography>
                  {change.kind !== "updated" && (
                    <Chip
                      label={t(
                        `teamBuilder.historyDialog.kind${
                          change.kind.charAt(0).toUpperCase() + change.kind.slice(1)
                        }`,
                      )}
                      size="small"
                      color={
                        change.kind === "added"
                          ? "success"
                          : change.kind === "removed"
                            ? "error"
                            : "primary"
                      }
                      variant="outlined"
                      sx={{ height: 16, fontSize: "0.6rem", ml: "auto" }}
                    />
                  )}
                </Stack>

                {/* 2行目: 変更された項目（タグ一覧・折り返し表示で幅不足を解消） */}
                {change.kind === "updated" && change.changedFields.length > 0 && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.75 }}>
                    {change.changedFields.map((field: string) => (
                      <Chip
                        key={field}
                        label={formatFieldLabel(field, t)}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 18,
                          fontSize: "0.65rem",
                          color: "text.secondary",
                          borderColor: "divider",
                          bgcolor: "background.paper",
                        }}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}

          {/* チーム名 / メモ変更 */}
          {teamMetadataChanges.map((change) => (
            <Box
              key={change.id}
              sx={{
                p: 0.75,
                borderRadius: 1.25,
                border: 1,
                borderColor: "divider",
                bgcolor: (theme) =>
                  theme.palette.mode === "dark"
                    ? "rgba(255, 255, 255, 0.03)"
                    : "rgba(0, 0, 0, 0.02)",
              }}
            >
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {change.type === "name"
                    ? t("teamBuilder.sync.teamNameChange")
                    : t("teamBuilder.sync.teamNotesChange")}
                </Typography>
                {change.type === "name" && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                    {change.from || "—"} → {change.to}
                  </Typography>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    ) : null;

    const wrappedButton =
      hasSyncableDiff && !asSpeedDialAction && diffTooltipContent ? (
        <Tooltip
          arrow
          enterDelay={300}
          leaveDelay={200}
          placement="bottom-end"
          title={diffTooltipContent}
          slotProps={{
            tooltip: {
              sx: {
                bgcolor: "background.paper",
                color: "text.primary",
                boxShadow: 6,
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                p: 0.5,
              },
            },
            arrow: {
              sx: {
                color: "background.paper",
                "&::before": {
                  border: 1,
                  borderColor: "divider",
                },
              },
            },
          }}
        >
          <span>{button}</span>
        </Tooltip>
      ) : isDraft && draftReasons.length > 0 && !asSpeedDialAction ? (
        <Tooltip
          arrow
          title={
            <Box sx={{ p: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.5 }}>
                {t("teamBuilder.draftReasonTitle")}
              </Typography>
              {draftReasons.map((reason, i) => (
                <Typography key={i} variant="caption" sx={{ display: "block" }}>
                  • {reason}
                </Typography>
              ))}
            </Box>
          }
        >
          <span>{button}</span>
        </Tooltip>
      ) : (
        button
      );

    return (
      <>
        {wrappedButton}

        {/* パワーユーザー向けコンテキストメニュー */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { elevation: 2, sx: { minWidth: 240, borderRadius: 2 } } }}
        >
          <MenuItem
            onClick={() => {
              handleMenuClose();
              if (!isSaved && !isLoading) saveMutation.mutate(undefined);
            }}
            disabled={isLoading || isSaved}
          >
            <ListItemIcon>
              <CloudUploadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={t("teamBuilder.sync.quickSync")}
              secondary={t("teamBuilder.sync.quickSyncHint")}
              slotProps={{ secondary: { sx: { fontSize: "0.7rem" } } }}
            />
          </MenuItem>

          <MenuItem onClick={handleCommitWithMessage} disabled={isLoading || isSaved}>
            <ListItemIcon>
              <CommitIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={t("teamBuilder.sync.commitWithMessage")}
              secondary={t("teamBuilder.sync.commitWithMessageHint")}
              slotProps={{ secondary: { sx: { fontSize: "0.7rem" } } }}
            />
          </MenuItem>

          <MenuItem onClick={handleOpenIncludeCommit} disabled={isLoading || isSaved}>
            <ListItemIcon>
              <ChecklistIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={t("teamBuilder.sync.includeCommit")}
              secondary={t("teamBuilder.sync.includeCommitHint")}
              slotProps={{ secondary: { sx: { fontSize: "0.7rem" } } }}
            />
          </MenuItem>

          <Divider />

          {hasStash ? (
            <>
              <MenuItem onClick={handleUnstash}>
                <ListItemIcon>
                  <UnarchiveIcon fontSize="small" color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary={t("teamBuilder.sync.unstash")}
                  secondary={
                    stashEntry?.message
                      ? stashEntry.message
                      : new Date(stashEntry?.savedAt ?? "").toLocaleString()
                  }
                  slotProps={{ secondary: { sx: { fontSize: "0.7rem", fontFamily: "monospace" } } }}
                />
              </MenuItem>
              <MenuItem onClick={handleDropStash}>
                <ListItemIcon>
                  <DeleteSweepIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText sx={{ color: "error.main" }}>
                  {t("teamBuilder.sync.dropStash")}
                </ListItemText>
              </MenuItem>
            </>
          ) : (
            <MenuItem onClick={handleStash} disabled={isSaved}>
              <ListItemIcon>
                <ArchiveIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={t("teamBuilder.sync.stash")}
                secondary={t("teamBuilder.sync.stashHint")}
                slotProps={{ secondary: { sx: { fontSize: "0.7rem" } } }}
              />
            </MenuItem>
          )}
        </Menu>

        {/* git commit -am (メッセージ付きでコミット) ダイアログ */}
        <Dialog
          open={commitDialogOpen}
          onClose={() => setCommitDialogOpen(false)}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle sx={{ pb: 1, fontWeight: 700, fontFamily: "monospace", fontSize: "1rem" }}>
            git commit -am
          </DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label={t("teamBuilder.sync.commitMessageLabel")}
              placeholder={t("teamBuilder.sync.commitMessagePlaceholder")}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCommitConfirm();
                }
              }}
              slotProps={{ htmlInput: { maxLength: 200 } }}
              helperText={`${commitMessage.length} / 200`}
              sx={{ mt: 1 }}
              multiline
              rows={2}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
            <Button variant="outlined" color="inherit" onClick={() => setCommitDialogOpen(false)}>
              {t("teamBuilder.cancel")}
            </Button>
            <Button
              variant="contained"
              onClick={handleCommitConfirm}
              disabled={isLoading}
              sx={{ fontFamily: "monospace" }}
            >
              commit
            </Button>
          </DialogActions>
        </Dialog>

        {/* git commit -i (変更を選択してコミット) ダイアログ */}
        <Dialog
          open={includeDialogOpen}
          onClose={() => setIncludeDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ pb: 1, fontWeight: 700, fontFamily: "monospace", fontSize: "1rem" }}>
            git commit -i
          </DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <TextField
              fullWidth
              size="small"
              label={t("teamBuilder.sync.commitMessageLabel")}
              placeholder={t("teamBuilder.sync.commitMessagePlaceholder")}
              value={includeCommitMessage}
              onChange={(e) => setIncludeCommitMessage(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 200 } }}
              sx={{ mb: 2, mt: 1 }}
            />

            <Stack
              direction="row"
              sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                {t("teamBuilder.sync.selectedChangesCount", {
                  count: Array.from(selectedChangeIds).filter((id) => allChangeIds.includes(id))
                    .length,
                  total: allChangeIds.length,
                })}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={handleSelectAll} sx={{ fontSize: "0.75rem", p: 0.5 }}>
                  {t("teamBuilder.sync.selectAll")}
                </Button>
                <Button
                  size="small"
                  onClick={handleDeselectAll}
                  sx={{ fontSize: "0.75rem", p: 0.5 }}
                >
                  {t("teamBuilder.sync.deselectAll")}
                </Button>
              </Stack>
            </Stack>

            <Stack spacing={1} sx={{ maxHeight: 380, overflowY: "auto", pr: 0.5 }}>
              {syncableChanges.map((change) => {
                if (change.type === "slot" && change.kind === "updated") {
                  const fieldIds = change.fieldChanges.map((f) => f.id);
                  const selectedFieldsCount = fieldIds.filter((id) =>
                    selectedChangeIds.has(id),
                  ).length;
                  const isSlotChecked =
                    selectedFieldsCount === fieldIds.length && fieldIds.length > 0;
                  const isSlotIndeterminate =
                    selectedFieldsCount > 0 && selectedFieldsCount < fieldIds.length;

                  return (
                    <Box
                      key={change.id}
                      sx={{
                        borderRadius: 1.5,
                        border: "1px solid",
                        borderColor: selectedFieldsCount > 0 ? "primary.main" : "divider",
                        bgcolor: "background.paper",
                        overflow: "hidden",
                        transition: "border-color 0.15s",
                      }}
                    >
                      {/* スロット親ヘッダー（一括選択可能） */}
                      <Box
                        onClick={() => handleToggleSlot(change)}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          p: 1,
                          bgcolor:
                            selectedFieldsCount > 0
                              ? alpha(theme.palette.primary.main, 0.04)
                              : "transparent",
                          cursor: "pointer",
                          "&:hover": {
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                          },
                        }}
                      >
                        <Checkbox
                          checked={isSlotChecked}
                          indeterminate={isSlotIndeterminate}
                          size="small"
                          sx={{ p: 0.5, mr: 1 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSlot(change);
                          }}
                        />
                        <Stack
                          direction="row"
                          spacing={1.25}
                          sx={{ alignItems: "center", flex: 1, minWidth: 0 }}
                        >
                          {change.identifier ? (
                            <Image
                              src={`/pokemon/${change.identifier}.png`}
                              alt={change.identifier}
                              width={28}
                              height={28}
                              style={{ objectFit: "contain" }}
                            />
                          ) : null}
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Slot {change.slot + 1}
                          </Typography>
                          <Chip
                            label={t("teamBuilder.historyDialog.kindUpdated")}
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ height: 18, fontSize: "0.65rem" }}
                          />
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ ml: "auto !important" }}
                          >
                            {selectedFieldsCount} / {fieldIds.length}
                          </Typography>
                        </Stack>
                      </Box>

                      {/* サブ項目: 各フィールドの差分 (技、持ち物、努力値など個別選択) */}
                      <Stack
                        spacing={0.5}
                        sx={{
                          p: 1,
                          pt: 0.5,
                          pl: 3,
                          bgcolor: alpha(theme.palette.action.hover, 0.5),
                          borderTop: "1px dashed",
                          borderColor: "divider",
                        }}
                      >
                        {change.fieldChanges.map((fc) => {
                          const isFieldSelected = selectedChangeIds.has(fc.id);
                          return (
                            <Box
                              key={fc.id}
                              onClick={() => handleToggleChange(fc.id)}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                p: 0.75,
                                borderRadius: 1,
                                border: "1px solid",
                                borderColor: isFieldSelected ? "primary.main" : "divider",
                                bgcolor: isFieldSelected
                                  ? alpha(theme.palette.primary.main, 0.06)
                                  : "background.paper",
                                cursor: "pointer",
                                transition: "all 0.15s",
                                "&:hover": {
                                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                                },
                              }}
                            >
                              <Checkbox
                                checked={isFieldSelected}
                                size="small"
                                sx={{ p: 0.25, mr: 1 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleChange(fc.id);
                                }}
                              />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography
                                  variant="caption"
                                  sx={{ fontWeight: 700, display: "block" }}
                                >
                                  {formatFieldLabel(fc.field, t)}
                                </Typography>
                                <Box sx={{ mt: 0.25 }}>
                                  {renderFieldDiff(
                                    fc.field,
                                    fc.from,
                                    fc.to,
                                    t,
                                    theme.palette.primary.main,
                                  )}
                                </Box>
                              </Box>
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>
                  );
                }

                const isSelected = selectedChangeIds.has(change.id);
                return (
                  <Box
                    key={change.id}
                    onClick={() => handleToggleChange(change.id)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      p: 1,
                      borderRadius: 1.5,
                      border: "1px solid",
                      borderColor: isSelected ? "primary.main" : "divider",
                      bgcolor: isSelected
                        ? (t) => alpha(t.palette.primary.main, 0.05)
                        : "background.paper",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      "&:hover": {
                        bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                      },
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      size="small"
                      sx={{ p: 0.5, mr: 1 }}
                      onChange={() => handleToggleChange(change.id)}
                    />
                    {change.type === "slot" ? (
                      <Stack
                        direction="row"
                        spacing={1.25}
                        sx={{ alignItems: "center", flex: 1, minWidth: 0 }}
                      >
                        {change.identifier ? (
                          <Image
                            src={`/pokemon/${change.identifier}.png`}
                            alt={change.identifier}
                            width={32}
                            height={32}
                            style={{ objectFit: "contain" }}
                          />
                        ) : (
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: 1,
                              bgcolor: "action.hover",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Typography variant="caption" color="text.secondary">
                              —
                            </Typography>
                          </Box>
                        )}
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              Slot {change.slot + 1}
                            </Typography>
                            <Chip
                              label={t(
                                `teamBuilder.historyDialog.kind${
                                  change.kind.charAt(0).toUpperCase() + change.kind.slice(1)
                                }`,
                              )}
                              size="small"
                              color={
                                change.kind === "added"
                                  ? "success"
                                  : change.kind === "removed"
                                    ? "error"
                                    : "primary"
                              }
                              variant="outlined"
                              sx={{ height: 18, fontSize: "0.65rem" }}
                            />
                          </Stack>
                        </Box>
                      </Stack>
                    ) : change.type === "name" ? (
                      <Box sx={{ flex: 1 }}>
                        <Stack
                          direction="row"
                          spacing={0.75}
                          sx={{ alignItems: "center", mb: 0.25 }}
                        >
                          <Chip
                            label={t("teamBuilder.sync.teamNameChange")}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: "0.65rem" }}
                          />
                        </Stack>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block" }}
                        >
                          {change.from || "—"} → {change.to}
                        </Typography>
                      </Box>
                    ) : (
                      <Box sx={{ flex: 1 }}>
                        <Chip
                          label={t("teamBuilder.sync.teamNotesChange")}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: "0.65rem" }}
                        />
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
            <Button variant="outlined" color="inherit" onClick={() => setIncludeDialogOpen(false)}>
              {t("teamBuilder.cancel")}
            </Button>
            <Button
              variant="contained"
              onClick={handleIncludeCommitConfirm}
              disabled={isLoading || selectedChangeIds.size === 0}
              sx={{ fontFamily: "monospace" }}
            >
              {t("teamBuilder.sync.commitSelected")} (
              {Array.from(selectedChangeIds).filter((id) => allChangeIds.includes(id)).length})
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={snackOpen}
          autoHideDuration={3000}
          onClose={() => setSnackOpen(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            severity={snackSeverity}
            onClose={() => setSnackOpen(false)}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {snackMessage}
          </Alert>
        </Snackbar>
      </>
    );
  },
);
