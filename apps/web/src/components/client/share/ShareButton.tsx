"use client";

import { useState, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Snackbar,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import IosShareIcon from "@mui/icons-material/IosShare";
import CheckIcon from "@mui/icons-material/Check";
import BarChartIcon from "@mui/icons-material/BarChart";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useActiveTeam } from "@/hooks/useActiveTeam";
import { useTheme } from "@mui/material/styles";
import { alpha } from "@mui/material";

import { teamSchema } from "@/lib/validator/team";
import { formatTeamValidationIssues } from "@/lib/validator/format-issues";

type ShareState = "idle" | "loading" | "success" | "error";

export function ShareButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const [activeTeam] = useActiveTeam();

  // ダイアログの開閉
  const [dialogOpen, setDialogOpen] = useState(false);
  // オプション
  const [showStats, setShowStats] = useState(false);
  // シェア実行状態
  const [shareState, setShareState] = useState<ShareState>("idle");
  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMessage, setSnackMessage] = useState("");
  const [snackSeverity, setSnackSeverity] = useState<"success" | "error">("success");

  const handleOpenDialog = () => {
    if (!activeTeam) return;
    setDialogOpen(true);
  };

  const handleShare = useCallback(async () => {
    if (!activeTeam) return;
    setDialogOpen(false);
    setShareState("loading");

    const snapshot = {
      teamName: activeTeam.name,
      description: activeTeam.description,
      members: activeTeam.members,
      showStats,
    };

    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = t("share.shareError");
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error && Array.isArray(parsed.error)) {
            errorMsg = parsed.error.map((e: { message: string }) => e.message).join(", ");
          }
        } catch {
          errorMsg = errorText;
        }
        throw new Error(errorMsg);
      }

      const { id } = (await res.json()) as { readonly id: string };
      setShareState("success");
      setSnackMessage(t("share.shareSuccess"));
      setSnackSeverity("success");
      setSnackOpen(true);

      setTimeout(() => {
        router.push(`/share/${id}`);
        setShareState("idle");
      }, 800);
    } catch (e: unknown) {
      setShareState("error");
      const errorMsg = e instanceof Error ? e.message : t("share.shareError");
      setSnackMessage(errorMsg);
      setSnackSeverity("error");
      setSnackOpen(true);
      setTimeout(() => setShareState("idle"), 2000);
    }
  }, [activeTeam, showStats, t, router]);

  const isLoading = shareState === "loading";
  const isSuccess = shareState === "success";

  const parseResult = activeTeam ? teamSchema.safeParse(activeTeam) : null;
  const isDraft = parseResult ? !parseResult.success : false;
  const draftReasons =
    parseResult && !parseResult.success && activeTeam
      ? formatTeamValidationIssues(parseResult, t, activeTeam.members)
      : [];

  const actionText = isLoading
    ? t("share.sharing")
    : isSuccess
      ? t("share.shareSuccess")
      : isDraft
        ? `${t("share.shareTeam")} (${t("teamBuilder.draft")})`
        : t("share.shareTeam");

  const button = (
    <Button
      variant="contained"
      disableElevation
      color={isSuccess ? "success" : "primary"}
      disabled={isLoading || !activeTeam || isDraft}
      startIcon={
        isLoading ? (
          <CircularProgress size={16} color="inherit" />
        ) : isSuccess ? (
          <CheckIcon />
        ) : (
          <IosShareIcon />
        )
      }
      onClick={handleOpenDialog}
      sx={{ transition: "all 0.2s", minWidth: 120 }}
    >
      {actionText}
    </Button>
  );

  return (
    <>
      {/* トリガーボタン */}
      {isDraft && draftReasons.length > 0 ? (
        <Tooltip
          arrow
          title={
            <Box sx={{ p: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.5 }}>
                {t("share.draftReasonTitle")}
              </Typography>
              {draftReasons.map((reason, i) => (
                <Typography key={i} variant="caption" sx={{ display: "block" }}>
                  • {reason}
                </Typography>
              ))}
            </Box>
          }
        >
          <Box component="span" sx={{ display: "inline-flex" }}>
            {button}
          </Box>
        </Tooltip>
      ) : (
        button
      )}

      {/* シェアオプションダイアログ */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{t("share.shareTeam")}</DialogTitle>

        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("share.dialogDescription")}
          </Typography>

          <Divider sx={{ mb: 2 }} />

          {/* showStats トグル */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              border: "1px solid",
              borderColor: showStats ? alpha(theme.palette.primary.main, 0.35) : "divider",
              bgcolor: showStats ? alpha(theme.palette.primary.main, 0.05) : "transparent",
              transition: "all 0.2s",
              cursor: "pointer",
              borderRadius: 2,
              py: 2,
              px: 4,
            }}
            onClick={() => setShowStats((v) => !v)}
          >
            <BarChartIcon
              fontSize="small"
              sx={{ color: showStats ? "primary.main" : "text.disabled", flexShrink: 0 }}
            />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {t("share.showStatsLabel")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("share.showStatsDescription")}
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={showStats}
                  onChange={(e) => {
                    e.stopPropagation();
                    setShowStats(e.target.checked);
                  }}
                  size="small"
                />
              }
              label=""
              sx={{ mr: 0 }}
            />
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDialogOpen(false)} color="inherit">
            {t("teamBuilder.cancel")}
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={handleShare}
            startIcon={<IosShareIcon />}
          >
            {t("share.createLink")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 結果スナックバー */}
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
}
