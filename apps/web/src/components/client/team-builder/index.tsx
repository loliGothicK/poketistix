"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { activeTeamIdAtom, drawerOpenAtom, Team } from "@/store/team/team";
import { useTeamsData } from "@/hooks/useTeamsData";

import TeamOverview from "@/components/client/team-builder/overview";
import TeamSlotDetail from "@/components/client/team-builder/slot-detail";

import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
  Button,
  Divider,
  Grid,
  useTheme,
  useMediaQuery,
  styled,
  Snackbar,
  Alert,
  Stack,
  GlobalStyles,
  Paper,
  FormControlLabel,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  IconButton as MuiIconButton,
  Fab,
} from "@mui/material";
import MuiAppBar, { AppBarProps as MuiAppBarProps } from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import WorkspacesIcon from "@mui/icons-material/Workspaces";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import { exportPokepaste } from "@/lib/pokepaste";
import { ulid } from "ulid";
import ImportPokepasteDialog from "@/components/client/team-builder/importDialog";
import { MitamaError } from "@/errors/anyhow/error";
import { match } from "ts-pattern";
import { ParseError } from "@/errors/thiserror/thiserror";
import LinkIcon from "@mui/icons-material/Link";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { ShareButton } from "@/components/client/share/ShareButton";
import { CloudSaveButton } from "@/components/client/team-builder/CloudSaveButton";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { teamSchema } from "@/lib/validator/team";
import { formatTeamValidationIssues } from "@/lib/validator/format-issues";
import { Chip, Tooltip } from "@mui/material";
import { flexRowCenter } from "@/theme/sx";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import { useHotkeys } from "react-hotkeys-hook";

const MAX_TEAM_SIZE = 6;
const drawerWidth = 240;

const Main = styled("main", { shouldForwardProp: (prop) => prop !== "open" })<{
  readonly open?: boolean;
}>(({ theme, open }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  height: "100%",
  overflowY: "auto",
  transition: theme.transitions.create("margin", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  marginLeft: `-${drawerWidth}px`,
  ...(open && {
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
    marginLeft: 0,
  }),
}));

interface AppBarProps extends MuiAppBarProps {
  readonly open?: boolean;
}
const AppBar = styled(MuiAppBar, { shouldForwardProp: (prop) => prop !== "open" })<AppBarProps>(
  ({ theme, open }) => ({
    position: "absolute",
    transition: theme.transitions.create(["margin", "width"], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
    ...(open && {
      width: `calc(100% - ${drawerWidth}px)`,
      marginLeft: `${drawerWidth}px`,
      transition: theme.transitions.create(["margin", "width"], {
        easing: theme.transitions.easing.easeOut,
        duration: theme.transitions.duration.enteringScreen,
      }),
    }),
  }),
);

const DrawerHeader = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  padding: theme.spacing(0, 1),
  ...theme.mixins.toolbar,
  justifyContent: "flex-end",
}));

import * as React from "react";
import { alpha } from "@mui/material/styles";
import Menu, { MenuProps } from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import EditIcon from "@mui/icons-material/Edit";
import FileCopyIcon from "@mui/icons-material/FileCopy";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DownloadIcon from "@mui/icons-material/Download";
import UploadIcon from "@mui/icons-material/Upload";
import RuleIcon from "@mui/icons-material/Rule";
import { useActiveTeam } from "@/hooks/useActiveTeam";
import { activeTeamLintAtom } from "@/store/team/options";
import Add from "@mui/icons-material/Add";

import { SpeedDial, SpeedDialIcon, SpeedDialAction } from "@mui/material";

const StyledMenu = styled((props: MenuProps) => (
  <Menu
    elevation={0}
    anchorOrigin={{
      vertical: "bottom",
      horizontal: "right",
    }}
    transformOrigin={{
      vertical: "top",
      horizontal: "right",
    }}
    {...props}
  />
))(({ theme }) => ({
  "& .MuiPaper-root": {
    marginTop: theme.spacing(1),
    minWidth: 180,
    color: "rgb(55, 65, 81)",
    boxShadow:
      "rgb(255, 255, 255) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.05) 0px 4px 6px -2px",
    "& .MuiMenu-list": {
      padding: "4px 0",
    },
    "& .MuiMenuItem-root": {
      "& .MuiSvgIcon-root": {
        fontSize: 18,
        color: theme.palette.text.secondary,
        marginRight: theme.spacing(1.5),
        ...theme.applyStyles("dark", {
          color: "inherit",
        }),
      },
      "&:active": {
        backgroundColor: alpha(theme.palette.primary.main, theme.palette.action.selectedOpacity),
      },
    },
    ...theme.applyStyles("dark", {
      color: theme.palette.grey[300],
    }),
    borderRadius: 6,
    py: 6,
    px: 12,
  },
}));

const ImportMenu = React.forwardRef<
  HTMLButtonElement,
  {
    readonly createTeamAction: (team: { readonly members: Team["members"] }) => void;
    readonly onError: (diagnostics: Diagnostics) => void;
    readonly isMobile: boolean;
    readonly asSpeedDialAction?: boolean;
    readonly fullWidth?: boolean;
    readonly variant?: "contained" | "outlined" | "text";
    readonly startIcon?: React.ReactNode;
  } & Omit<Partial<import("@mui/material").SpeedDialActionProps>, "onError">
>(
  (
    {
      createTeamAction,
      onError,
      isMobile,
      asSpeedDialAction,
      fullWidth,
      variant = "contained",
      startIcon,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [openPaste, setOpenPaste] = useState(false);
    const [openFromUrl, setOpenFromUrl] = useState(false);
    const open = Boolean(anchorEl);
    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
    };
    const handleClose = () => {
      setAnchorEl(null);
    };

    return (
      <>
        {asSpeedDialAction ? (
          <SpeedDialAction
            {...(props as import("@mui/material").SpeedDialActionProps)}
            ref={ref as React.Ref<HTMLDivElement>}
            icon={<DownloadIcon />}
            title={t("teamBuilder.importAction")}
            slotProps={{ tooltip: { title: t("teamBuilder.importAction"), open: true } }}
            onClick={handleClick}
          />
        ) : (
          <Button
            ref={ref}
            variant={variant}
            disableElevation
            onClick={handleClick}
            startIcon={startIcon}
            endIcon={<KeyboardArrowDownIcon />}
            size={isMobile ? "small" : "medium"}
            fullWidth={fullWidth}
          >
            {t("teamBuilder.importAction")}
          </Button>
        )}
        <StyledMenu anchorEl={anchorEl} open={open} onClose={handleClose}>
          <MenuItem
            onClick={() => {
              setOpenFromUrl(true);
              handleClose();
            }}
            disableRipple
          >
            <EditIcon />
            {t("teamBuilder.importFromUrl")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpenPaste(true);
              handleClose();
            }}
            disableRipple
          >
            <FileCopyIcon />
            {t("teamBuilder.importFromPaste")}
          </MenuItem>
        </StyledMenu>
        <ImportPokepasteDialog
          type={"paste"}
          open={openPaste}
          onClose={() => setOpenPaste(false)}
          onImport={(data) => createTeamAction(data)}
          onError={onError}
        />
        <ImportPokepasteDialog
          type={"url"}
          open={openFromUrl}
          onClose={() => setOpenFromUrl(false)}
          onImport={(data) => createTeamAction(data)}
          onError={onError}
        />
      </>
    );
  },
);

const ExportMenu = React.forwardRef<
  HTMLButtonElement,
  {
    readonly asSpeedDialAction?: boolean;
  } & Partial<import("@mui/material").SpeedDialActionProps>
>(({ asSpeedDialAction, ...props }, ref) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [activeTeam] = useActiveTeam();

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const handleMenuClick = (type: "clipboard" | "pokepaste") => async () => {
    if (activeTeam) {
      const paste = exportPokepaste(activeTeam);
      if (type === "clipboard") {
        await navigator.clipboard.writeText(paste);
      } else {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = "https://pokepast.es/create";
        form.target = "_blank";

        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "paste";
        input.value = paste;

        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
      }
    }
    handleClose();
  };

  return (
    <>
      {asSpeedDialAction ? (
        <SpeedDialAction
          {...(props as import("@mui/material").SpeedDialActionProps)}
          ref={ref as React.Ref<HTMLDivElement>}
          icon={<UploadIcon />}
          title={t("teamBuilder.exportAction")}
          slotProps={{ tooltip: { title: t("teamBuilder.exportAction"), open: true } }}
          onClick={handleClick}
        />
      ) : (
        <Button
          ref={ref}
          variant="contained"
          disableElevation
          onClick={handleClick}
          endIcon={<KeyboardArrowDownIcon />}
        >
          {t("teamBuilder.exportAction")}
        </Button>
      )}
      <StyledMenu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <MenuItem onClick={handleMenuClick("clipboard")} disableRipple>
          <ContentCopyIcon />
          {t("teamBuilder.exportToClipboard")}
        </MenuItem>
        <MenuItem onClick={handleMenuClick("pokepaste")} disableRipple>
          <LinkIcon />
          {t("teamBuilder.exportToPokepaste")}
        </MenuItem>
      </StyledMenu>
    </>
  );
});

export type Diagnostics =
  | {
      readonly severity: "success" | "info" | "warning";
      readonly message: string;
    }
  | {
      readonly severity: "error";
      readonly message: readonly MitamaError[];
    };

function MobileTeamList({
  teams,
  onSelectTeam,
  onCreateTeam,
  onImportTeam,
  onError,
}: {
  readonly teams: readonly Team[];
  readonly onSelectTeam: (id: string) => void;
  readonly onCreateTeam: () => void;
  readonly onImportTeam: (team: { readonly members: Team["members"] }) => void;
  readonly onError: (d: Diagnostics) => void;
}) {
  const { t } = useTranslation();

  if (teams.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 400,
          px: 3,
          gap: 2,
        }}
      >
        <WorkspacesIcon sx={{ fontSize: 72, color: "text.disabled", opacity: 0.4 }} />
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("teamBuilder.noTeamsTitle")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("teamBuilder.noTeamsDescription")}
          </Typography>
        </Box>
        <Stack spacing={1.5} sx={{ width: "100%", maxWidth: 280 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<AddIcon />}
            onClick={onCreateTeam}
            fullWidth
            sx={{
              borderRadius: 3,
              py: 3,
              px: 6,
            }}
          >
            {t("teamBuilder.createTeam")}
          </Button>
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <ImportMenu createTeamAction={onImportTeam} onError={onError} isMobile={true} />
          </Box>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          ...flexRowCenter,
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t("teamBuilder.title")}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ ...flexRowCenter }}>
          <ImportMenu createTeamAction={onImportTeam} onError={onError} isMobile={true} />
        </Stack>
      </Box>
      <Stack spacing={1.5}>
        {teams.map((team) => (
          <SurfaceCard
            key={team.id}
            onClick={() => onSelectTeam(team.id)}
            sx={{
              p: 2,
              display: "flex",
              alignItems: "center",
              gap: 2,
              cursor: "pointer",
              transition: "all 0.18s ease",
              "&:hover": {
                borderColor: "primary.main",
                boxShadow: (theme) => `0 4px 16px ${alpha(theme.palette.primary.main, 0.12)}`,
                transform: "translateY(-2px)",
              },
            }}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                borderRadius: 2,
                py: 2,
                px: 4,
              }}
            >
              <WorkspacesIcon sx={{ color: "primary.main", fontSize: 22 }} />
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>
              {team.name}
            </Typography>
          </SurfaceCard>
        ))}
      </Stack>
      <Fab
        variant="extended"
        color="primary"
        aria-label={t("teamBuilder.add")}
        onClick={() => {
          onCreateTeam();
        }}
        sx={{
          display: { xs: "flex", md: "none" },
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 1000,
        }}
      >
        <Add sx={{ mr: 1 }} /> {t("teamBuilder.createTeam")}
      </Fab>
    </Box>
  );
}

export default function TeamBuilderPage({
  regulation: _regulation,
  activeSlot,
}: {
  readonly regulation?: string;
  readonly activeSlot?: number;
}) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "ja";
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const searchParams = useSearchParams();
  const router = useRouter();
  const slotParam = searchParams.get("slot");
  const parsedSlot =
    slotParam !== null && !isNaN(Number(slotParam)) ? Number(slotParam) : undefined;
  const [selectedSlot, setSelectedSlot] = useState<number | undefined>(undefined);
  const effectiveSlot =
    typeof parsedSlot === "number" && parsedSlot >= 0 && parsedSlot < MAX_TEAM_SIZE
      ? parsedSlot
      : (activeSlot ?? selectedSlot);
  const hasSelection =
    typeof effectiveSlot === "number" &&
    Number.isInteger(effectiveSlot) &&
    effectiveSlot >= 0 &&
    effectiveSlot < MAX_TEAM_SIZE;
  const [drawerOpen, setDrawerOpen] = useAtom(drawerOpenAtom);
  const mobileView = searchParams.get("view") === "overview" ? "overview" : "list";
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({
    severity: "info",
    message: "Info",
  });

  const [activeTeamId, setActiveTeamId] = useAtom(activeTeamIdAtom);
  const { teams: rawTeams, isLoading, addTeam, removeTeam } = useTeamsData();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const teams = useMemo(() => (mounted ? rawTeams : []), [mounted, rawTeams]);

  const teamParam = searchParams.get("team");

  // 選択チームはレンダー時に導出する: URL指定 > 保存済み選択 > 先頭チーム。
  // effect による atom への書き戻しはしない (部分的な一覧での上書きや URL との往復が不整合の原因になるため)。
  // 選択変更は handleSelectTeam などのイベントハンドラで atom と URL の両方を直接更新する。
  const effectiveTeamId = useMemo(() => {
    if (teamParam && teams.some((t) => t.id === teamParam)) return teamParam;
    if (activeTeamId && teams.some((t) => t.id === activeTeamId)) return activeTeamId;
    return teams[0]?.id ?? null;
  }, [teams, teamParam, activeTeamId]);

  const handleSelectTeam = (id: string) => {
    setActiveTeamId(id);
    setSelectedSlot(undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.set("team", id);
    params.delete("slot");
    router.replace(`/${lang}/team-builder?${params.toString()}`, { scroll: false });
  };

  const handleSelectSlot = (slot: number) => {
    setSelectedSlot(slot);
    const params = new URLSearchParams(searchParams.toString());
    params.set("slot", slot.toString());
    if (effectiveTeamId) {
      params.set("team", effectiveTeamId);
    }
    if (isMobile) {
      router.push(`/${lang}/team-builder?${params.toString()}`);
    } else {
      router.replace(`/${lang}/team-builder?${params.toString()}`, { scroll: false });
    }
  };

  const handleBackFromSlot = () => {
    setSelectedSlot(undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("slot");
    if (isMobile) {
      params.set("view", "overview");
      router.push(`/${lang}/team-builder?${params.toString()}`);
    } else {
      router.replace(`/${lang}/team-builder?${params.toString()}`, { scroll: false });
    }
  };

  const [isLintOn, setIsLintOn] = useAtom(activeTeamLintAtom);
  const [, , , , undo, redo, canUndo, canRedo] = useActiveTeam();

  useHotkeys(
    "ctrl+z",
    (e) => {
      e.preventDefault();
      undo();
    },
    [undo],
  );
  useHotkeys(
    "ctrl+y, ctrl+shift+z",
    (e) => {
      e.preventDefault();
      redo();
    },
    [redo],
  );

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const deleteTargetTeam = teams.find((t) => t.id === deleteTargetId) ?? null;

  if (isLoading) return <Box sx={{ p: 3 }}>{t("teamBuilder.loading")}</Box>;

  const activeTeam = teams.find((t) => t.id === effectiveTeamId) || null;

  const handleCreateTeam = (team: {
    readonly name?: string;
    readonly members: Team["members"];
  }): Team => {
    const newTeam: Team = {
      id: ulid(),
      name: team.name || t("teamBuilder.teamLabel", { index: teams.length + 1 }),
      members: team.members,
    };
    addTeam(newTeam);
    handleSelectTeam(newTeam.id);
    return newTeam;
  };

  const handleCreateNewTeam = (): Team => {
    return handleCreateTeam({
      name: t("teamBuilder.teamLabel", { index: teams.length + 1 }),
      members: Array(MAX_TEAM_SIZE).fill(null),
    });
  };

  const handleDeleteTeam = (teamId: string) => {
    removeTeam(teamId);
    if (effectiveTeamId === teamId) {
      const remaining = teams.filter((t) => t.id !== teamId);
      if (remaining.length > 0) {
        handleSelectTeam(remaining[0].id);
      } else {
        setActiveTeamId(null);
        setSelectedSlot(undefined);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("team");
        params.delete("slot");
        router.replace(`/${lang}/team-builder?${params.toString()}`, { scroll: false });
      }
    }
    setDeleteTargetId(null);
    if (isMobile) {
      router.push(`/${lang}/team-builder`);
    }
  };

  return (
    <>
      {isMobile && hasSelection && activeTeam && (
        <GlobalStyles styles={{ body: { overflow: "hidden" } }} />
      )}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          position: "relative",
          overflow: "hidden",
          height: { xs: hasSelection && activeTeam ? "calc(100dvh - 60px)" : "auto", md: "100vh" },
        }}
      >
        <Dialog
          open={deleteTargetId !== null}
          onClose={() => setDeleteTargetId(null)}
          aria-labelledby="delete-team-dialog-title"
        >
          <DialogTitle id="delete-team-dialog-title">
            {t("teamBuilder.deleteTeamTitle")}
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              {t("teamBuilder.deleteTeamConfirm", { name: deleteTargetTeam?.name ?? "" })}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteTargetId(null)}>{t("teamBuilder.cancel")}</Button>
            <Button
              color="error"
              variant="contained"
              disableElevation
              onClick={() => deleteTargetId && handleDeleteTeam(deleteTargetId)}
            >
              {t("teamBuilder.delete")}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          autoHideDuration={5000}
          open={snackbarOpen}
          onClose={() => setSnackbarOpen(false)}
        >
          <Alert severity={diagnostics.severity} sx={{ whiteSpace: "pre-wrap" }}>
            {match(diagnostics)
              .with({ severity: "error" }, ({ message }) => (
                <>
                  <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1 }}>
                    {message.length} errors occurred：
                  </Typography>
                  <Stack spacing={1.5}>
                    {message.map((err, index) => (
                      <Box
                        key={index}
                        sx={{ pl: 1, borderLeft: "3px solid", borderColor: "error.main" }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                          {err.message}
                        </Typography>
                        {err instanceof ParseError && (
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 1,
                              mt: 0.5,
                              bgcolor: "background.default",
                              fontFamily: "monospace",
                            }}
                          >
                            {err.meta.raw}
                          </Paper>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </>
              ))
              .otherwise(({ message }) => (
                <Typography>{message}</Typography>
              ))}
          </Alert>
        </Snackbar>

        {!isMobile && (
          <>
            <AppBar open={drawerOpen}>
              <Toolbar>
                <IconButton
                  color="inherit"
                  onClick={() => setDrawerOpen(true)}
                  edge="start"
                  sx={[{ mr: 2 }, drawerOpen && { display: "none" }]}
                >
                  <MenuIcon />
                </IconButton>
                <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
                  {t("teamBuilder.title")}
                </Typography>
                {activeTeam && (
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <FormControlLabel
                      control={
                        <Switch checked={isLintOn} onChange={() => setIsLintOn(!isLintOn)} />
                      }
                      label={t("teamBuilder.lintToggle")}
                    />
                    <Tooltip title={t("teamBuilder.undo")}>
                      <span>
                        <MuiIconButton
                          color="inherit"
                          onClick={undo}
                          disabled={!canUndo}
                          aria-label={t("teamBuilder.undo")}
                        >
                          <UndoIcon />
                        </MuiIconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={t("teamBuilder.redo")}>
                      <span>
                        <MuiIconButton
                          color="inherit"
                          onClick={redo}
                          disabled={!canRedo}
                          aria-label={t("teamBuilder.redo")}
                        >
                          <RedoIcon />
                        </MuiIconButton>
                      </span>
                    </Tooltip>
                    <ExportMenu />
                    <CloudSaveButton />
                    <ShareButton />
                    <MuiIconButton
                      color="inherit"
                      aria-label={t("teamBuilder.deleteTeamTitle")}
                      onClick={() => setDeleteTargetId(activeTeam.id)}
                      sx={{ "&:hover": { color: "error.light" } }}
                    >
                      <DeleteOutlineIcon />
                    </MuiIconButton>
                  </Box>
                )}
              </Toolbar>
            </AppBar>

            <Drawer
              sx={{
                width: drawerWidth,
                flexShrink: 0,
                "& .MuiDrawer-paper": {
                  width: drawerWidth,
                  boxSizing: "border-box",
                  position: "absolute",
                  bgcolor: "background.paper",
                  borderRight: "1px solid",
                  borderColor: theme.palette.divider,
                },
              }}
              variant="persistent"
              anchor="left"
              open={drawerOpen}
            >
              <DrawerHeader>
                <IconButton onClick={() => setDrawerOpen(false)}>
                  {theme.direction === "ltr" ? <ChevronLeftIcon /> : <ChevronRightIcon />}
                </IconButton>
              </DrawerHeader>
              <Divider sx={{ borderColor: theme.palette.divider }} />
              <Box sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    fullWidth
                    onClick={handleCreateNewTeam}
                  >
                    {t("teamBuilder.createTeam")}
                  </Button>
                  <ImportMenu
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    fullWidth
                    createTeamAction={handleCreateTeam}
                    onError={(diagnostics) => {
                      setDiagnostics(diagnostics);
                      setSnackbarOpen(true);
                    }}
                    isMobile={false}
                  />
                </Stack>
              </Box>
              <Divider sx={{ borderColor: theme.palette.divider }} />
              <List>
                {teams.length === 0 ? (
                  <ListItem>
                    <ListItemText
                      primary={t("teamBuilder.noTeamsTitle")}
                      secondary={t("teamBuilder.noTeamsDescription")}
                    />
                  </ListItem>
                ) : (
                  teams.map((team) => (
                    <ListItem key={team.id} disablePadding>
                      <ListItemButton
                        selected={team.id === effectiveTeamId}
                        onClick={() => handleSelectTeam(team.id)}
                        sx={{
                          mx: 1,
                          mb: 0.5,
                          "&.Mui-selected": { bgcolor: "background.paperRaised" },
                          borderRadius: 2,
                          py: 2,
                          px: 4,
                        }}
                      >
                        <ListItemIcon>
                          <WorkspacesIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                              <Box
                                sx={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {team.name}
                              </Box>
                              {(() => {
                                const result = teamSchema.safeParse(team);
                                if (result.success) return null;
                                const reasons = formatTeamValidationIssues(result, t, team.members);
                                return (
                                  <Tooltip
                                    arrow
                                    title={
                                      <Box sx={{ p: 0.5 }}>
                                        <Typography
                                          variant="caption"
                                          sx={{ fontWeight: 700, display: "block", mb: 0.5 }}
                                        >
                                          {t("teamBuilder.draftReasonTitle")}
                                        </Typography>
                                        {reasons.map((r: string, i: number) => (
                                          <Typography
                                            key={i}
                                            variant="caption"
                                            sx={{ display: "block" }}
                                          >
                                            • {r}
                                          </Typography>
                                        ))}
                                      </Box>
                                    }
                                  >
                                    <Chip
                                      label={t("teamBuilder.draft")}
                                      size="small"
                                      color="warning"
                                      sx={{
                                        height: 20,
                                        fontSize: "0.7rem",
                                        flexShrink: 0,
                                        cursor: "help",
                                      }}
                                    />
                                  </Tooltip>
                                );
                              })()}
                            </Stack>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  ))
                )}
              </List>
            </Drawer>
          </>
        )}

        <Main
          open={isMobile ? false : drawerOpen}
          sx={
            isMobile
              ? {
                  ml: 0,
                  height: hasSelection && activeTeam ? "100%" : "auto",
                  overflowY: hasSelection && activeTeam ? "hidden" : "visible",
                  display: hasSelection && activeTeam ? "flex" : "block",
                  flexDirection: "column",
                  p: 0,
                }
              : undefined
          }
        >
          {!isMobile && <DrawerHeader />}

          {isMobile ? (
            hasSelection && activeTeam ? (
              <TeamSlotDetail
                key={effectiveSlot}
                slot={effectiveSlot!}
                showBackButton
                onBack={handleBackFromSlot}
              />
            ) : mobileView === "list" ? (
              <MobileTeamList
                teams={teams}
                onSelectTeam={(id) => {
                  handleSelectTeam(id);
                  router.push(`/${lang}/team-builder?view=overview&team=${id}`);
                }}
                onCreateTeam={() => {
                  const newTeam = handleCreateNewTeam();
                  router.push(`/${lang}/team-builder?view=overview&team=${newTeam.id}`);
                }}
                onImportTeam={(team) => {
                  const newTeam = handleCreateTeam(team);
                  router.push(`/${lang}/team-builder?view=overview&team=${newTeam.id}`);
                }}
                onError={(d) => {
                  setDiagnostics(d);
                  setSnackbarOpen(true);
                }}
              />
            ) : activeTeam ? (
              <TeamOverview
                activeSlot={hasSelection ? effectiveSlot : undefined}
                onSelectSlot={handleSelectSlot}
                onBack={() => {
                  setSelectedSlot(undefined);
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete("slot");
                  params.delete("view");
                  router.push(`/${lang}/team-builder?${params.toString()}`);
                }}
              />
            ) : null
          ) : !activeTeam ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100%",
                minHeight: { xs: 240, md: "100%" },
              }}
            >
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h5" color="text.secondary">
                  {t("teamBuilder.selectTeamHint")}
                </Typography>
              </Box>
            </Box>
          ) : (
            <Grid container spacing={3}>
              <Grid component={"div"} size={{ xs: 12, md: 3 }} sx={{ height: "100%" }}>
                <TeamOverview
                  activeSlot={hasSelection ? effectiveSlot : undefined}
                  onSelectSlot={handleSelectSlot}
                />
              </Grid>
              <Grid component={"div"} size={{ xs: 12, md: 9 }} sx={{ height: "100%" }}>
                {hasSelection ? (
                  <TeamSlotDetail key={effectiveSlot} slot={effectiveSlot!} />
                ) : (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      height: "100%",
                      minHeight: 240,
                    }}
                  >
                    <Typography variant="body1" color="text.secondary">
                      {t("teamBuilder.slotDescription")}
                    </Typography>
                  </Box>
                )}
              </Grid>
            </Grid>
          )}
        </Main>
        {isMobile && activeTeam && !hasSelection && mobileView === "overview" && (
          <SpeedDial
            ariaLabel="Team Actions"
            sx={{ position: "fixed", bottom: 16, right: 16 }}
            icon={<SpeedDialIcon />}
          >
            <CloudSaveButton asSpeedDialAction />
            <ExportMenu asSpeedDialAction />
            <SpeedDialAction
              icon={<RuleIcon color={isLintOn ? "primary" : "inherit"} />}
              title={t("teamBuilder.lintToggle")}
              slotProps={{
                tooltip: { title: t("teamBuilder.lintToggle"), open: true },
              }}
              onClick={() => setIsLintOn(!isLintOn)}
            />
            <SpeedDialAction
              icon={<DeleteOutlineIcon />}
              title={t("teamBuilder.deleteTeamTitle")}
              slotProps={{
                tooltip: { title: t("teamBuilder.deleteTeamTitle"), open: true },
              }}
              onClick={() => setDeleteTargetId(activeTeam.id)}
            />
          </SpeedDial>
        )}
      </Box>
    </>
  );
}
