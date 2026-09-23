"use client";

import React, { useState } from "react";
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
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CheckIcon from "@mui/icons-material/Check";
import { useAtomValue, useSetAtom } from "jotai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { localTeamsAtom, Team } from "@/store/team/team";
import { isAuthenticatedAtom } from "@/store/auth";
import { fetchTeamsFromServer, saveTeamsToServer } from "@services/teams";
import { teamSchema, teamSaveSchema } from "@/lib/validator/team";
import { useActiveTeam } from "@/hooks/useActiveTeam";
import { useTeamsData } from "@/hooks/useTeamsData";
import { formatTeamValidationIssues } from "@/lib/validator/format-issues";

type CloudSaveButtonProps = {
  asSpeedDialAction?: boolean;
} & Partial<SpeedDialActionProps>;

export const CloudSaveButton = React.forwardRef<HTMLButtonElement, CloudSaveButtonProps>(
  ({ asSpeedDialAction, ...props }, ref) => {
    const { t } = useTranslation();
    const isAuthenticated = useAtomValue(isAuthenticatedAtom);
    const localTeams = useAtomValue(localTeamsAtom);
    const setLocalTeams = useSetAtom(localTeamsAtom);
    const [activeTeam] = useActiveTeam();
    const { isLoading: isTeamsLoading } = useTeamsData();
    const queryClient = useQueryClient();

    const [snackOpen, setSnackOpen] = useState(false);
    const [snackMessage, setSnackMessage] = useState("");
    const [snackSeverity, setSnackSeverity] = useState<"success" | "error">("success");

    const saveMutation = useMutation({
      mutationFn: async () => {
        if (!activeTeam) throw new Error("No active team to save");
        const candidates = [activeTeam, ...localTeams.filter((t) => t.id !== activeTeam.id)];
        const validTeams = candidates.filter((t) => teamSaveSchema.safeParse(t).success);
        if (validTeams.length === 0) {
          throw new Error(t("teamBuilder.validation.noValidTeams"));
        }
        await saveTeamsToServer(validTeams);
        return validTeams;
      },
      onSuccess: async (validTeams) => {
        // 1. サーバーからの最新データで refetch し、キャッシュを確定状態にする
        //    invalidateQueries は再フェッチ完了を await しないため refetchQueries を使う。
        //    これにより「localTeams 削除後にキャッシュにも存在しない」消失ウィンドウを防ぐ。
        await queryClient.refetchQueries({ queryKey: ["teams"] });

        // 2. refetch 完了後に localTeams（未保存差分）から保存済みチームを削除
        //    この時点ではサーバーから返ったデータがキャッシュに入っているため UI に乖離がない
        const savedIds = new Set(validTeams.map((t) => t.id));
        setLocalTeams((prev) => prev.filter((t) => !savedIds.has(t.id)));

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

    // ["teams"] キャッシュをリアクティブに購読する（enabled: false で fetch は走らない）
    const { data: serverTeams = [] } = useQuery<readonly Team[]>({
      queryKey: ["teams"],
      queryFn: fetchTeamsFromServer,
      enabled: false,
    });

    if (!isAuthenticated || !activeTeam) return null;

    // localTeams に存在する = 未保存差分がある（新規作成 or ローカル編集）
    // これが「Synced か否か」を判定する唯一の真実
    const isInLocalTeams = localTeams.some((lt) => lt.id === activeTeam.id);
    // サーバーに存在しない = まだ一度も同期されていない新規チーム
    const isNewTeam = !serverTeams.some((st) => st.id === activeTeam.id);
    const hasUnsavedChanges = isInLocalTeams || isNewTeam;
    const parseResult = teamSchema.safeParse(activeTeam);
    const isDraft = !parseResult.success;
    const draftReasons = formatTeamValidationIssues(parseResult, t, activeTeam.members);

    const isLoading = saveMutation.isPending || isTeamsLoading;
    const isSaved = !hasUnsavedChanges;

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

    const button = asSpeedDialAction ? (
      <SpeedDialAction
        {...(props as SpeedDialActionProps)}
        ref={ref as React.Ref<HTMLDivElement>}
        icon={actionIcon}
        title={actionText}
        onClick={() => saveMutation.mutate()}
        slotProps={{
          tooltip: { title: actionText, open: true },
          fab: { disabled: isLoading || isSaved },
        }}
      />
    ) : (
      <Button
        ref={ref}
        variant={hasUnsavedChanges ? "contained" : "outlined"}
        disableElevation
        color={hasUnsavedChanges ? (isDraft ? "warning" : "primary") : "inherit"}
        disabled={isLoading || isSaved}
        startIcon={actionIcon}
        onClick={() => saveMutation.mutate()}
        sx={{ transition: "all 0.2s", minWidth: 140 }}
      >
        {actionText}
      </Button>
    );

    return (
      <>
        {hasUnsavedChanges && isDraft && draftReasons.length > 0 && !asSpeedDialAction ? (
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
            {/* disabled な Button は ref を受け取れないため span でラップ */}
            <span>{button}</span>
          </Tooltip>
        ) : (
          button
        )}

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
