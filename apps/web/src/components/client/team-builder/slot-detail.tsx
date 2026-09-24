"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Snackbar,
  Stack,
  Typography,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import AllInboxRoundedIcon from "@mui/icons-material/AllInboxRounded";
import { useAtomValue } from "jotai";
import { useSetAtom } from "jotai";
import { Training } from "@/components/client/team-builder/training";
import { activeSlotIndexAtom, TrainedPokemon } from "@/store/team/team";
import { toDefault } from "@/data/utility/training";
import { useActiveTeam } from "@/hooks/useActiveTeam";
import { SelectPokemonDialog } from "@/components/client/team-builder/SelectPokemonDialog";
import { useBoxData } from "@/hooks/useBoxData";
import { isAuthenticatedAtom } from "@/store/auth";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { emptyStateCenter, flexRowCenter } from "@/theme/sx";

/**
 * URLのスロット（`/team-builder/[slot]`）に対応した単一スロットの育成画面。
 * かつてタブ（TeamTabs）で切り替えていた内容を、1ページ＝1スロットとして表示する。
 */
export default function TeamSlotDetail({
  slot,
  showBackButton = false,
  onBack,
}: {
  readonly slot: number;
  readonly showBackButton?: boolean;
  readonly onBack?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<"master" | "box">("master");
  const [savedSnackbar, setSavedSnackbar] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [team, updateSlot] = useActiveTeam();
  const setActiveSlotIndex = useSetAtom(activeSlotIndexAtom);
  const { saveToBox } = useBoxData();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  const handleOpenDialog = (tab: "master" | "box" = "master") => {
    setDialogTab(tab);
    setDialogOpen(true);
  };

  // URL 由来のスロットを、Lint セレクタ（activeSlotLintIssueAtom）が参照する atom に同期する。
  useEffect(() => {
    setActiveSlotIndex(slot);
  }, [slot, setActiveSlotIndex]);

  if (!team) {
    return null;
  }

  const member = team.members[slot] ?? null;

  return (
    <SurfaceCard
      raised
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        border: { xs: "none" },
        borderRadius: { xs: 0 },
        p: { xs: 0 },
      }}
    >
      <Stack
        direction="row"
        sx={{
          ...flexRowCenter,
          px: 2,
          py: 1,
          borderBottom: "1px solid",
          borderColor: theme.palette.divider,
          position: "sticky",
          top: 0,
          zIndex: 10,
          bgcolor: "background.paper",
        }}
      >
        {showBackButton && (
          <IconButton
            edge="start"
            aria-label={t("teamBuilder.back")}
            onClick={
              onBack ??
              (() => router.push(`/${i18n.resolvedLanguage ?? "ja"}/team-builder?view=overview`))
            }
          >
            <ArrowBackIcon />
          </IconButton>
        )}
        {member && (
          <Box
            sx={{
              flexGrow: 1,
              display: "flex",
              justifyContent: "flex-start",
              ml: showBackButton ? 2 : 0,
            }}
          >
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              sx={{
                minHeight: "auto",
                "& .MuiTab-root": {
                  minHeight: "auto",
                  py: 0.5,
                  textTransform: "none",
                  fontWeight: 600,
                },
              }}
            >
              <Tab label={t("teamBuilder.tabOpenSpecs")} />
              <Tab label={t("teamBuilder.tabEvSpreads")} />
            </Tabs>
          </Box>
        )}
        {member && (
          <Stack direction="row" spacing={1} sx={{ display: { xs: "none", md: "flex" } }}>
            {isAuthenticated && (
              <Button
                variant="outlined"
                onClick={() => handleOpenDialog("box")}
                startIcon={<AllInboxRoundedIcon />}
                size="small"
              >
                {t("damageCalc.loadFromBox")}
              </Button>
            )}
            {isAuthenticated && (
              <Button
                variant="contained"
                onClick={() => {
                  saveToBox(member);
                  setSavedSnackbar(true);
                }}
                startIcon={<SaveOutlinedIcon />}
                size="small"
              >
                {t("box.saveToBox")}
              </Button>
            )}
            <Button
              variant="outlined"
              color="error"
              onClick={() => setDeleteDialogOpen(true)}
              startIcon={<DeleteOutlineIcon />}
              size="small"
            >
              {t("teamBuilder.delete")}
            </Button>
          </Stack>
        )}
      </Stack>

      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        {member ? (
          <Box sx={{ p: { xs: 2, md: 0 } }}>
            <Training
              member={member}
              activeTab={activeTab}
              onUpdate={(trained: TrainedPokemon) => updateSlot(slot, trained)}
              onChangePokemonClick={() => handleOpenDialog("master")}
            />
          </Box>
        ) : (
          <Box sx={{ ...emptyStateCenter, py: 6, px: 3 }}>
            <Typography variant="body1" color="text.secondary" gutterBottom>
              {t("teamBuilder.emptySlot")}
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1 }}>
              <Button variant="contained" onClick={() => handleOpenDialog("master")}>
                {t("teamBuilder.selectPokemon")}
              </Button>
              {isAuthenticated && (
                <Button
                  variant="outlined"
                  startIcon={<AllInboxRoundedIcon />}
                  onClick={() => handleOpenDialog("box")}
                >
                  {t("damageCalc.loadFromBox")}
                </Button>
              )}
            </Stack>
          </Box>
        )}
      </Box>

      {member && (
        <SpeedDial
          ariaLabel="Actions"
          sx={{ display: { xs: "flex", md: "none" }, position: "fixed", bottom: 16, right: 16 }}
          icon={<SpeedDialIcon />}
        >
          {isAuthenticated && (
            <SpeedDialAction
              icon={<AllInboxRoundedIcon />}
              title={t("damageCalc.loadFromBox")}
              slotProps={{ tooltip: { title: t("damageCalc.loadFromBox"), open: true } }}
              onClick={() => handleOpenDialog("box")}
            />
          )}
          {isAuthenticated && (
            <SpeedDialAction
              icon={<SaveOutlinedIcon />}
              title={t("box.saveToBox")}
              slotProps={{ tooltip: { title: t("box.saveToBox"), open: true } }}
              onClick={() => {
                saveToBox(member);
                setSavedSnackbar(true);
              }}
            />
          )}
          <SpeedDialAction
            icon={<DeleteOutlineIcon />}
            title={t("teamBuilder.delete")}
            slotProps={{ tooltip: { title: t("teamBuilder.delete"), open: true } }}
            onClick={() => setDeleteDialogOpen(true)}
          />
        </SpeedDial>
      )}

      <SelectPokemonDialog
        title={t("teamBuilder.selectPokemon")}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        translator={t}
        initialTab={dialogTab}
        onChange={(identifier) => {
          updateSlot(slot, toDefault(identifier));
          setDialogOpen(false);
        }}
        onSelectFromBox={(pokemon) => {
          updateSlot(slot, pokemon);
          setDialogOpen(false);
        }}
        excludedIdentifiers={team.members.map((m) => m?.identifier).filter(Boolean) as string[]}
      />

      <Snackbar
        open={savedSnackbar}
        autoHideDuration={2000}
        onClose={() => setSavedSnackbar(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setSavedSnackbar(false)}>
          {t("box.savedToBox")}
        </Alert>
      </Snackbar>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        aria-labelledby="delete-pokemon-dialog-title"
      >
        <DialogTitle id="delete-pokemon-dialog-title">{t("teamBuilder.delete")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("teamBuilder.deleteTeamConfirm", {
              name: member?.identifier
                ? t(`pokemon.${member.identifier}.name`)
                : t("pokemon.unknown"),
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t("teamBuilder.cancel")}</Button>
          <Button
            color="error"
            variant="contained"
            disableElevation
            onClick={() => {
              updateSlot(slot, null);
              setDeleteDialogOpen(false);
            }}
          >
            {t("teamBuilder.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </SurfaceCard>
  );
}
