"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  alpha,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import Close from "@mui/icons-material/Close";
import PlayArrow from "@mui/icons-material/PlayArrow";
import UploadFile from "@mui/icons-material/UploadFile";
import VideoFile from "@mui/icons-material/VideoFile";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { TrainedPokemon } from "@/store/team/team";
import type { BattleRecordDraft } from "./formState";
import {
  analysisSummaryToBattleRecordDraft,
  analyzeBattleVideoFile,
  buildChampionsDictionaries,
  parsePbnToAnalysisSummary,
  type VideoAnalysisProgress,
} from "@/services/videoKifuAnalyzer";
import { flexRowCenter, sectionLabel } from "@/theme/sx";

interface VideoKifuImportDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly teamId: string | null;
  readonly teamMembers: readonly TrainedPokemon[];
  readonly regulation?: string;
  readonly onApplyDraft: (draft: BattleRecordDraft) => void;
}

const formatTimestampMs = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export function VideoKifuImportDialog({
  open,
  onClose,
  teamId,
  teamMembers,
  regulation,
  onApplyDraft,
}: VideoKifuImportDialogProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<VideoAnalysisProgress | null>(null);
  const [pbnText, setPbnText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const dictionaries = useMemo(() => {
    const tEn = i18n.getFixedT("en");
    const tJa = i18n.getFixedT("ja");
    return buildChampionsDictionaries(
      (key) => tEn(key),
      (key) => tJa(key),
    );
  }, [i18n]);

  const parsedSummary = useMemo(
    () => (pbnText.trim().length > 0 ? parsePbnToAnalysisSummary(pbnText) : null),
    [pbnText],
  );

  const handleSelectFile = (file: File | null) => {
    if (!file) return;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextUrl;
    setVideoPreviewUrl(nextUrl);
    setVideoFile(file);
    setErrorMessage(null);
  };

  const handleStartAnalysis = async () => {
    if (!videoFile || analyzing) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAnalyzing(true);
    setErrorMessage(null);
    setProgress(null);

    try {
      const summary = await analyzeBattleVideoFile({
        file: videoFile,
        myTeam: teamMembers,
        dictionaries,
        regulation,
        sampleStepSec: 1.0,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });
      setPbnText(summary.pbnText);
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        const msg =
          err instanceof Error ? err.message : t("battleRecord.videoImport.analysisFailed");
        setErrorMessage(msg || t("battleRecord.videoImport.analysisFailed"));
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSeekTo = (timestampMs: number | null) => {
    if (timestampMs === null || !previewVideoRef.current) return;
    previewVideoRef.current.currentTime = Math.max(0, timestampMs / 1000);
  };

  const handleApplyToForm = () => {
    if (!parsedSummary) return;
    const draft = analysisSummaryToBattleRecordDraft(parsedSummary, {
      teamId,
      myTeam: teamMembers,
    });
    onApplyDraft(draft);
  };

  const progressPct =
    progress && progress.durationSec > 0
      ? Math.min(100, Math.round((progress.currentTimeSec / progress.durationSec) * 100))
      : 0;

  return (
    <Dialog
      open={open}
      onClose={analyzing ? undefined : onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
    >
      <DialogTitle sx={{ px: 3, py: 2 }}>
        <Stack direction="row" sx={{ ...flexRowCenter, justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <VideoFile color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t("battleRecord.videoImport.title")}
            </Typography>
          </Stack>
          <IconButton
            size="small"
            onClick={onClose}
            disabled={analyzing}
            aria-label={t("common.close")}
          >
            <Close />
          </IconButton>
        </Stack>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ py: 2.5 }}>
        <Stack spacing={2.5}>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            hidden
            onChange={(e) => handleSelectFile(e.target.files?.[0] ?? null)}
          />

          {/* 動画選択 / プレビュー領域 */}
          {!videoFile ? (
            <Box
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelectFile(e.dataTransfer.files?.[0] ?? null);
              }}
              sx={{
                border: "2px dashed",
                borderColor: alpha(theme.palette.primary.main, 0.4),
                borderRadius: 2,
                p: 4,
                textAlign: "center",
                cursor: "pointer",
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                "&:hover": {
                  borderColor: theme.palette.primary.main,
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                },
              }}
            >
              <UploadFile sx={{ fontSize: 40, color: "primary.main", mb: 1 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {t("battleRecord.videoImport.dropPrompt")}
              </Typography>
              <Button variant="outlined" size="small">
                {t("battleRecord.videoImport.selectFile")}
              </Button>
            </Box>
          ) : (
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{
                  alignItems: { xs: "stretch", sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: "break-all" }}>
                  {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={analyzing}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t("battleRecord.videoImport.changeFile")}
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={analyzing}
                    startIcon={<PlayArrow />}
                    onClick={() => void handleStartAnalysis()}
                  >
                    {t("battleRecord.videoImport.startAnalysis")}
                  </Button>
                </Stack>
              </Stack>

              {videoPreviewUrl && (
                <Box
                  sx={{
                    width: "100%",
                    maxHeight: 280,
                    bgcolor: "#000",
                    borderRadius: 1.5,
                    overflow: "hidden",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <video
                    ref={previewVideoRef}
                    src={videoPreviewUrl}
                    controls
                    muted
                    playsInline
                    style={{ width: "100%", maxHeight: 280, objectFit: "contain" }}
                  />
                </Box>
              )}

              {/* ターン別ジャンプナビゲーション */}
              {parsedSummary && Object.keys(parsedSummary.turnTimestamps).length > 0 && (
                <Box sx={{ mt: 0.5 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 0.75, fontWeight: 700 }}
                  >
                    {t("battleRecord.videoImport.jumpToTurn")}
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75 }}>
                    {Object.entries(parsedSummary.turnTimestamps).map(([tNumStr, tMs]) => {
                      const tNum = Number.parseInt(tNumStr, 10);
                      const label =
                        tNum === 0
                          ? `Lead (${formatTimestampMs(tMs)})`
                          : `T${tNum} (${formatTimestampMs(tMs)})`;
                      return (
                        <Chip
                          key={tNum}
                          size="small"
                          label={label}
                          onClick={() => handleSeekTo(tMs)}
                          icon={<PlayArrow sx={{ fontSize: "14px !important" }} />}
                          clickable
                          variant="outlined"
                          color="primary"
                          sx={{ fontWeight: 700 }}
                        />
                      );
                    })}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}

          {analyzing && (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.5 }}
              >
                {progress && progress.durationSec > 0
                  ? t("battleRecord.videoImport.analyzing", {
                      current: Math.round(progress.currentTimeSec),
                      total: Math.round(progress.durationSec),
                      turns: progress.detectedTurns,
                    })
                  : t("battleRecord.videoImport.initializing")}
              </Typography>
              <LinearProgress
                variant={progress && progress.durationSec > 0 ? "determinate" : "indeterminate"}
                value={progressPct}
              />
            </Box>
          )}

          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

          {/* PBN エディタ & タイムスタンプ付きレビューリスト */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr" },
              gap: 2,
              alignItems: "start",
            }}
          >
            <Box>
              <Typography variant="overline" sx={{ ...sectionLabel, display: "block", mb: 0.75 }}>
                {t("battleRecord.videoImport.pbnLabel")}
              </Typography>
              <TextField
                value={pbnText}
                onChange={(e) => setPbnText(e.target.value)}
                multiline
                minRows={10}
                maxRows={16}
                fullWidth
                slotProps={{
                  htmlInput: {
                    style: {
                      fontFamily: "monospace",
                      fontSize: "0.78rem",
                      lineHeight: 1.45,
                    },
                  },
                }}
              />
            </Box>

            <Box>
              <Typography variant="overline" sx={{ ...sectionLabel, display: "block", mb: 0.75 }}>
                {t("battleRecord.videoImport.reviewListTitle")}
              </Typography>
              {!parsedSummary || parsedSummary.reviewEvents.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("battleRecord.videoImport.reviewEmpty")}
                </Typography>
              ) : (
                <Stack
                  spacing={0.75}
                  sx={{
                    maxHeight: 340,
                    overflowY: "auto",
                    pr: 0.5,
                  }}
                >
                  {parsedSummary.reviewEvents.map((ev) => (
                    <Box
                      key={ev.id}
                      onClick={() => handleSeekTo(ev.timestampMs)}
                      sx={{
                        p: 1,
                        borderRadius: 1.5,
                        border: "1px solid",
                        borderColor: ev.needsReview
                          ? alpha(theme.palette.warning.main, 0.6)
                          : theme.palette.divider,
                        bgcolor: ev.needsReview
                          ? alpha(theme.palette.warning.main, 0.08)
                          : "background.paper",
                        cursor: ev.timestampMs !== null ? "pointer" : "default",
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.25 }}
                      >
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          {ev.timestampMs !== null && (
                            <Tooltip title={t("battleRecord.videoImport.jumpToTime")}>
                              <Chip
                                size="small"
                                label={formatTimestampMs(ev.timestampMs)}
                                sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700 }}
                              />
                            </Tooltip>
                          )}
                        </Stack>
                        {ev.needsReview && (
                          <Chip
                            size="small"
                            color="warning"
                            icon={<WarningAmberRounded />}
                            label={t("battleRecord.videoImport.needsReviewBadge")}
                            sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }}
                          />
                        )}
                      </Stack>
                      <Typography
                        variant="caption"
                        sx={{ fontFamily: "monospace", display: "block", wordBreak: "break-all" }}
                      >
                        {ev.lineText}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <Divider />
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={analyzing}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={analyzing || !parsedSummary}
          onClick={handleApplyToForm}
        >
          {t("battleRecord.videoImport.applyToForm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
