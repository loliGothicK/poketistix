"use client";

import { useMemo, useState } from "react";
import { Box, Typography, Tabs, Tab, Stack, Chip } from "@mui/material";
import { useTranslation } from "react-i18next";
import EditNoteIcon from "@mui/icons-material/EditNote";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import SportsScoreOutlinedIcon from "@mui/icons-material/SportsScoreOutlined";
import SportsMmaOutlinedIcon from "@mui/icons-material/SportsMmaOutlined";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { parseTeamNotes, serializeTeamNotes, TeamNotes } from "@/lib/team-notes";
import { InlineMarkdownEditor } from "./InlineMarkdownEditor";

interface Props {
  readonly description?: string;
  readonly onUpdateDescription: (description: string) => void;
  readonly isMobile?: boolean;
}

export function TeamNotesWorkspace({ description, onUpdateDescription, isMobile = false }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);

  const notes = useMemo(() => parseTeamNotes(description), [description]);

  const handleFieldChange = (field: keyof TeamNotes, value: string) => {
    const updated: TeamNotes = {
      ...notes,
      [field]: value,
    };
    onUpdateDescription(serializeTeamNotes(updated));
  };

  const buildProcessCount = (notes.buildProcess ?? "").length;
  const basicConceptsCount = (notes.basicConcepts ?? "").length;
  const metaPlansCount = (notes.metaPlans ?? "").length;
  const totalCount = buildProcessCount + basicConceptsCount + metaPlansCount;

  return (
    <SurfaceCard
      raised={!isMobile}
      sx={{
        width: "100%",
        height: "100%",
        minHeight: isMobile ? 350 : 600,
        display: "flex",
        flexDirection: "column",
        border: { xs: "none" },
        borderRadius: { xs: 0 },
        boxShadow: { xs: "none" },
        bgcolor: { xs: "transparent" },
        p: { xs: 0, md: 3 },
      }}
    >
      {/* ── デスクトップ用ヘッダー ── */}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          display: { xs: "none", md: "flex" },
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
          pb: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1.5,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <EditNoteIcon />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {t("teamBuilder.notes.title")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("teamBuilder.notes.subtitle")}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.5 }}>
          {buildProcessCount > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={`${t("teamBuilder.notes.tabBuildProcess")}: ${buildProcessCount}`}
              sx={{ height: 22, fontSize: "0.7rem" }}
            />
          )}
          {basicConceptsCount > 0 && (
            <Chip
              size="small"
              variant="outlined"
              color="primary"
              label={`${t("teamBuilder.notes.tabBasicConcepts")}: ${basicConceptsCount}`}
              sx={{ height: 22, fontSize: "0.7rem" }}
            />
          )}
          {metaPlansCount > 0 && (
            <Chip
              size="small"
              variant="outlined"
              color="secondary"
              label={`${t("teamBuilder.notes.tabMetaPlans")}: ${metaPlansCount}`}
              sx={{ height: 22, fontSize: "0.7rem" }}
            />
          )}
        </Stack>
      </Stack>

      {/* ── モバイル用コンパクトステータスバー ── */}
      <Stack
        direction="row"
        sx={{
          display: { xs: "flex", md: "none" },
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
          px: 0.5,
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
          {t("teamBuilder.notes.title")}
        </Typography>
        {totalCount > 0 && (
          <Typography variant="caption" color="text.secondary">
            {`${totalCount} chars`}
          </Typography>
        )}
      </Stack>

      {/* セクション切り替えタブ */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant={isMobile ? "fullWidth" : "standard"}
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          mb: { xs: 1.5, md: 2.5 },
          "& .MuiTab-root": {
            textTransform: "none",
            fontWeight: 700,
            fontSize: { xs: "0.82rem", md: "0.95rem" },
            minHeight: { xs: 38, md: 44 },
            px: { xs: 0.5, md: 2 },
            minWidth: { xs: "auto", md: 90 },
          },
        }}
      >
        <Tab
          icon={isMobile ? undefined : <AccountTreeOutlinedIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
          label={
            isMobile
              ? t("teamBuilder.notes.tabBuildProcessShort")
              : t("teamBuilder.notes.tabBuildProcess")
          }
        />
        <Tab
          icon={isMobile ? undefined : <SportsScoreOutlinedIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
          label={
            isMobile
              ? t("teamBuilder.notes.tabBasicConceptsShort")
              : t("teamBuilder.notes.tabBasicConcepts")
          }
        />
        <Tab
          icon={isMobile ? undefined : <SportsMmaOutlinedIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
          label={
            isMobile
              ? t("teamBuilder.notes.tabMetaPlansShort")
              : t("teamBuilder.notes.tabMetaPlans")
          }
        />
      </Tabs>

      {/* タブ 0: 構築経緯 */}
      {activeTab === 0 && (
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", width: "100%" }}>
          <Box sx={{ mb: 1, px: { xs: 0.5, md: 0 } }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
              {t("teamBuilder.notes.buildProcessTitle")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("teamBuilder.notes.buildProcessHelper")}
            </Typography>
          </Box>
          <InlineMarkdownEditor
            placeholder={t("teamBuilder.notes.buildProcessPlaceholder")}
            value={notes.buildProcess ?? ""}
            onChange={(val) => handleFieldChange("buildProcess", val)}
            isMobile={isMobile}
            minHeight={isMobile ? 260 : 380}
          />
        </Box>
      )}

      {/* タブ 1: 基本コンセプト・立ち回り */}
      {activeTab === 1 && (
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", width: "100%" }}>
          <Box sx={{ mb: 1, px: { xs: 0.5, md: 0 } }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
              {t("teamBuilder.notes.basicConceptsTitle")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("teamBuilder.notes.basicConceptsHelper")}
            </Typography>
          </Box>
          <InlineMarkdownEditor
            placeholder={t("teamBuilder.notes.basicConceptsPlaceholder")}
            value={notes.basicConcepts ?? ""}
            onChange={(val) => handleFieldChange("basicConcepts", val)}
            isMobile={isMobile}
            minHeight={isMobile ? 260 : 380}
          />
        </Box>
      )}

      {/* タブ 2: 対戦相手別・選出メモ */}
      {activeTab === 2 && (
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", width: "100%" }}>
          <Box sx={{ mb: 1, px: { xs: 0.5, md: 0 } }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
              {t("teamBuilder.notes.metaPlansTitle")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("teamBuilder.notes.metaPlansHelper")}
            </Typography>
          </Box>
          <InlineMarkdownEditor
            placeholder={t("teamBuilder.notes.metaPlansPlaceholder")}
            value={notes.metaPlans ?? ""}
            onChange={(val) => handleFieldChange("metaPlans", val)}
            isMobile={isMobile}
            minHeight={isMobile ? 260 : 380}
          />
        </Box>
      )}
    </SurfaceCard>
  );
}
