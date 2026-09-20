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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { localTeamsAtom, Team } from "@/store/team/team";
import { isAuthenticatedAtom } from "@/store/auth";
import { saveTeamsToServer } from "@services/teams";
import { teamSchema, teamSaveSchema } from "@/lib/validator/team";
import { useActiveTeam } from "@/hooks/useActiveTeam";
import { useTeamsData } from "@/hooks/useTeamsData";
import { formatTeamValidationIssues } from "@/lib/validator/format-issues";
import { isTeamEqual } from "@/lib/team/equality";

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
        // 1. サーバーキャッシュを保存した最新データで即座に同期（楽観的更新）
        queryClient.setQueryData<readonly Team[]>(["teams"], (old = []) => {
          const map = new Map(old.map((t) => [t.id, t]));
          validTeams.forEach((t) => map.set(t.id, t));
          return Array.from(map.values());
        });

        // 2. 保存成功したチームを localTeams（未保存差分）から削除
        const savedIds = new Set(validTeams.map((t) => t.id));
        setLocalTeams((prev) => prev.filter((t) => !savedIds.has(t.id)));

        // 3. バックグラウンドで最新データを再検証（await せずに即時完了）
        void queryClient.invalidateQueries({ queryKey: ["teams"] });

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

    if (!isAuthenticated || !activeTeam) return null;

    const serverTeams = queryClient.getQueryData<readonly Team[]>(["teams"]) ?? [];
    const serverTeam = serverTeams.find((st) => st.id === activeTeam.id);
    const hasUnsavedChanges = !serverTeam || !isTeamEqual(serverTeam, activeTeam);
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
