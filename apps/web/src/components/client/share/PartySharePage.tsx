"use client";

import {
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Snackbar,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { useState, useCallback } from "react";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import BarChartIcon from "@mui/icons-material/BarChart";
import EditNoteIcon from "@mui/icons-material/EditNote";
import { PokemonBuildCard } from "@/components/client/share/PokemonBuildCard";
import type { SharedTeamSnapshot } from "@/lib/db/schema";
import { parseTeamNotes, hasTeamNotes } from "@/lib/team-notes";
import { useSetAtom } from "jotai";
import { localTeamsAtom, activeTeamIdAtom } from "@/store/team/team";
import { ulid } from "ulid";
import { useRouter } from "next/navigation";

// ── Props ────────────────────────────────────────────────────────────────────

export interface PartySharePageProps {
  readonly shareId: string;
  readonly snapshot: SharedTeamSnapshot;
  readonly createdAt: string;
}

// ── 空スロットのプレースホルダー（フルカード用）──────────────────────────────

function EmptyFullCard() {
  return (
    <Paper
      elevation={0}
      sx={{
        border: "1px dashed",
        borderColor: "divider",
        borderRadius: "12px",
        bgcolor: "transparent",
        minHeight: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography variant="body2" sx={{ color: "text.disabled", fontStyle: "italic" }}>
        —
      </Typography>
    </Paper>
  );
}

// ── 空スロットのプレースホルダー（コンパクト行用）────────────────────────────

function EmptyCompactRow() {
  return (
    <Paper
      elevation={0}
      sx={{
        border: "1px dashed",
        borderColor: "divider",
        borderRadius: "12px",
        bgcolor: "transparent",
        height: "52px",
        display: "flex",
        alignItems: "center",
        px: "16px",
      }}
    >
      <Typography
        sx={{
          color: "text.disabled",
          fontStyle: "italic",
          fontSize: "0.8rem",
        }}
      >
        —
      </Typography>
    </Paper>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

export function PartySharePage({ shareId, snapshot, createdAt }: PartySharePageProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const setLocalTeams = useSetAtom(localTeamsAtom);
  const setActiveTeamId = useSetAtom(activeTeamIdAtom);

  // ブレークポイント検出
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [copied, setCopied] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareId}`
      : `/share/${shareId}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setSnackOpen(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API が使えない環境（古いブラウザ等）
    }
  }, [shareUrl]);

  // スナップショットを新しいチームとして localTeams に追加し、チームビルダーへ遷移
  const handleOpenInBuilder = useCallback(() => {
    const newId = ulid();
    setLocalTeams((prev) => [
      ...prev,
      {
        id: newId,
        name: snapshot.teamName,
        description: snapshot.description,
        members: snapshot.members,
      },
    ]);
    setActiveTeamId(newId);
    router.push("/team-builder?view=overview");
  }, [snapshot, setLocalTeams, setActiveTeamId, router]);

  // 日付フォーマット（ロケール対応）
  const formattedDate = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // 有効なメンバー数
  const memberCount = snapshot.members.filter(Boolean).length;

  return (
    <Box
      sx={{
        maxWidth: 1200,
        mx: "auto",
        px: { xs: 1.5, sm: 3 },
        py: { xs: 2.5, sm: 4 },
      }}
    >
      {/* ── ヘッダー ─────────────────────────────────────────────── */}
      <Box
        sx={{
          mb: { xs: 2.5, sm: 3.5 },
          pb: { xs: 1.5, sm: 2 },
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        {/* チーム名 */}
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontWeight: 800,
            fontSize: { xs: "1.35rem", sm: "1.85rem", md: "2.25rem" },
            letterSpacing: -0.5,
            mb: 1,
            lineHeight: 1.15,
          }}
        >
          {snapshot.teamName}
        </Typography>

        {/* メタ情報 + ボタン群 */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 1.5, sm: 2 }}
          sx={{
            alignItems: { xs: "flex-start", sm: "center" },
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <Typography variant="caption" color="text.secondary">
              {t("share.createdAt", { date: formattedDate })}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              ·
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("share.memberCount", { count: memberCount })}
            </Typography>
            {snapshot.showStats && (
              <Chip
                label={t("share.showStatsLabel")}
                size="small"
                icon={<BarChartIcon sx={{ fontSize: "0.85rem !important" }} />}
                sx={{ height: 20, fontSize: "0.65rem", fontWeight: 600 }}
              />
            )}
          </Stack>

          {/* ボタン群 */}
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              variant="outlined"
              size="small"
              color={copied ? "success" : "primary"}
              startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
              onClick={handleCopy}
              disableElevation
              sx={{
                fontSize: "0.75rem",
                transition: "all 0.2s",
              }}
            >
              {copied ? t("share.linkCopied") : t("share.copyLink")}
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<EditNoteIcon />}
              onClick={handleOpenInBuilder}
              disableElevation
              sx={{
                fontSize: "0.75rem",
              }}
            >
              {t("share.openInBuilder")}
            </Button>
          </Stack>
        </Stack>
        {(() => {
          const notes = parseTeamNotes(snapshot.description);
          const hasAny = hasTeamNotes(notes);
          if (!hasAny) return null;

          return (
            <Stack spacing={1.5} sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
              {notes.buildProcess && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: "primary.main", display: "block" }}
                  >
                    {t("teamBuilder.notes.buildProcessTitle")}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.25 }}>
                    {notes.buildProcess}
                  </Typography>
                </Box>
              )}
              {notes.basicConcepts && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: "primary.main", display: "block" }}
                  >
                    {t("teamBuilder.notes.basicConceptsTitle")}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.25 }}>
                    {notes.basicConcepts}
                  </Typography>
                </Box>
              )}
              {notes.metaPlans && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: "secondary.main", display: "block" }}
                  >
                    {t("teamBuilder.notes.metaPlansTitle")}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.25 }}>
                    {notes.metaPlans}
                  </Typography>
                </Box>
              )}
            </Stack>
          );
        })()}
      </Box>

      {/* ── パーティ一覧 ─────────────────────────────────────────── */}

      {isMobile ? (
        // ── モバイル: コンパクト行リスト ──────────────────────────────────
        <Stack spacing={1}>
          {snapshot.members.map((member, index) =>
            member ? (
              <PokemonBuildCard
                key={index}
                pokemon={member}
                showStats={snapshot.showStats}
                variant="compact"
              />
            ) : (
              <EmptyCompactRow key={index} />
            ),
          )}
        </Stack>
      ) : (
        // ── タブレット / デスクトップ: グリッド ──────────────────────────
        <Grid container spacing={{ sm: 2, md: 2.5 }}>
          {snapshot.members.map((member, index) => (
            <Grid component="div" size={{ sm: 6, lg: 4 }} key={index}>
              {member ? (
                <PokemonBuildCard pokemon={member} showStats={snapshot.showStats} variant="full" />
              ) : (
                <EmptyFullCard />
              )}
            </Grid>
          ))}
        </Grid>
      )}

      {/* コピー完了スナックバー */}
      <Snackbar
        open={snackOpen}
        autoHideDuration={2500}
        onClose={() => setSnackOpen(false)}
        message={t("share.linkCopied")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
