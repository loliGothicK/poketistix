"use client";

import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import CatchingPokemonRoundedIcon from "@mui/icons-material/CatchingPokemonRounded";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import FlashOnRoundedIcon from "@mui/icons-material/FlashOnRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import DashboardCustomizeRoundedIcon from "@mui/icons-material/DashboardCustomizeRounded";
import PoketistixIcon from "@/components/icons/Poketistix";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import SportsMmaRoundedIcon from "@mui/icons-material/SportsMmaRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import {
  AppBar,
  Badge,
  Box,
  Button,
  CssBaseline,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import { useTheme, useColorScheme } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSyncExternalStore, useState, useEffect } from "react";
import { useAuthSync } from "@/hooks/useAuthSync";
import { TeamMergeDialog } from "@/components/client/TeamMergeDialog";
import { AuthButton } from "@/components/client/AuthButton";
import { Footer } from "@/components/client/Footer";
import { LangProvider, LocalizedLink as Link } from "@/components/client/LocalizedLink";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { supportedLanguageOptions } from "@/i18n/config";
import { theme } from "@/theme/theme";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { flexRowCenter, iconButtonBordered, sectionLabel } from "@/theme/sx";
import MenuIcon from "@mui/icons-material/Menu";
import BugReportRoundedIcon from "@mui/icons-material/BugReportRounded";
import { BugReportProvider, BugReportDialog, useBugReport } from "@/components/client/feedback";
import { APP_VERSION } from "@/config/version";

const SIDE_MENU_WIDTH = 240;

const STORAGE_KEYS = {
  language: "poketistix-language",
} as const;

type SideMenuItem = {
  readonly labelKey: string;
  readonly icon: ReactNode;
  readonly route?: string;
  readonly isPreview?: boolean;
};

type SideMenuGroup = {
  readonly titleKey: string;
  readonly items: readonly SideMenuItem[];
};

const sideMenuGroups: SideMenuGroup[] = [
  {
    titleKey: "navigation.groups.teambuilder",
    items: [
      {
        labelKey: "navigation.items.createTeam",
        icon: <BuildRoundedIcon fontSize="small" />,
        route: "/team-builder",
      },
      {
        labelKey: "navigation.items.myBox",
        icon: <CatchingPokemonRoundedIcon fontSize="small" />,
        route: "/box",
      },
    ],
  },
  {
    titleKey: "navigation.groups.battle",
    items: [
      {
        labelKey: "navigation.items.battleRecord",
        icon: <SportsMmaRoundedIcon fontSize="small" />,
        route: "/battle-record",
      },
      {
        labelKey: "navigation.items.damageCalc",
        icon: <FlashOnRoundedIcon fontSize="small" />,
        route: "/damage-calc",
      },
    ],
  },
  {
    titleKey: "navigation.groups.statistics",
    items: [
      {
        labelKey: "navigation.items.usageTrends",
        icon: <QueryStatsRoundedIcon fontSize="small" />,
      },
      {
        labelKey: "navigation.items.metaTables",
        icon: <TableChartRoundedIcon fontSize="small" />,
      },
      {
        labelKey: "navigation.items.winrateInsights",
        icon: <InsightsRoundedIcon fontSize="small" />,
        route: "/battle-analytics",
      },
      {
        labelKey: "navigation.items.dashboard",
        icon: <DashboardCustomizeRoundedIcon fontSize="small" />,
        route: "/dashboard",
        isPreview: true,
      },
    ],
  },
] as const;

function SideMenuContent({ onNavigate }: { readonly onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { openBugReport } = useBugReport();

  return (
    <List
      sx={{
        px: 2,
        py: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      {sideMenuGroups.map((group, index) => (
        <Box key={group.titleKey} sx={{ listStyle: "none" }}>
          <Typography
            variant="overline"
            sx={{ ...sectionLabel, mb: 1, display: "block", fontSize: 12, lineHeight: 1.2 }}
          >
            {t(group.titleKey)}
          </Typography>
          {group.items.map((item) => {
            const content = item.route ? (
              <ListItemButton
                component={Link}
                href={item.route}
                onClick={onNavigate}
                sx={{
                  borderRadius: 3,
                  minHeight: 44,
                  mb: 0.5,
                  "&:hover": {
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: "primary.main" }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {t(item.labelKey)}
                      {item.isPreview && (
                        <Badge
                          badgeContent={t("common.preview")}
                          color="primary"
                          sx={{
                            "& .MuiBadge-badge": {
                              position: "static",
                              transform: "none",
                              padding: "0 6px",
                              height: 18,
                              fontSize: "0.65rem",
                            },
                          }}
                        />
                      )}
                    </Box>
                  }
                />
              </ListItemButton>
            ) : (
              <ListItemButton
                disabled
                sx={{
                  borderRadius: 3,
                  minHeight: 44,
                  mb: 0.5,
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: "primary.main" }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={t(item.labelKey)} />
              </ListItemButton>
            );

            return <Box key={item.labelKey}>{content}</Box>;
          })}
          {index < sideMenuGroups.length - 1 ? <Divider sx={{ mt: 1.25 }} /> : null}
        </Box>
      ))}
      <Divider sx={{ my: 0.5 }} />
      <ListItemButton
        onClick={() => {
          onNavigate?.();
          openBugReport();
        }}
        sx={{
          borderRadius: 3,
          minHeight: 40,
          color: "text.secondary",
          "&:hover": {
            color: "text.primary",
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
          <BugReportRoundedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {t("feedback.reportBug")}
            </Typography>
          }
        />
      </ListItemButton>
      <Box sx={{ px: 2, pt: 1, pb: 0.5, textAlign: "center" }}>
        <Typography
          component={Link}
          href="/blog"
          variant="caption"
          sx={{
            color: "text.disabled",
            fontSize: 11,
            textDecoration: "none",
            "&:hover": { color: "text.secondary", textDecoration: "underline" },
          }}
        >
          {`v${APP_VERSION}`}
        </Typography>
      </Box>
    </List>
  );
}

function AppControls({
  language,
  onLanguageChange,
}: {
  readonly language: string;
  readonly onLanguageChange: (language: string) => void;
}) {
  const { mode, setMode } = useColorScheme();
  const { t } = useTranslation();
  const { openBugReport } = useBugReport();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted || !mode) return <Box sx={{ width: 190 }} />; // placeholder width to prevent layout shift

  const onToggleMode = () => setMode(mode === "dark" ? "light" : "dark");

  return (
    <Stack direction="row" spacing={{ xs: 0.75, md: 1.25 }} sx={flexRowCenter}>
      <FormControl size="small" sx={{ minWidth: 150, display: { xs: "none", md: "inline-flex" } }}>
        <InputLabel id="language-select-label">{t("preferences.language")}</InputLabel>
        <Select
          labelId="language-select-label"
          label={t("preferences.language")}
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
          sx={{ bgcolor: "background.paper" }}
        >
          {supportedLanguageOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Tooltip title={t("feedback.reportBug")}>
        <IconButton
          color="primary"
          onClick={openBugReport}
          size="small"
          aria-label={t("feedback.reportBug")}
          sx={iconButtonBordered()}
        >
          <BugReportRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={mode === "dark" ? t("preferences.lightMode") : t("preferences.darkMode")}>
        <IconButton
          color="primary"
          onClick={onToggleMode}
          size="small"
          aria-label={mode === "dark" ? t("preferences.lightMode") : t("preferences.darkMode")}
          sx={iconButtonBordered()}
        >
          {mode === "dark" ? (
            <LightModeRoundedIcon fontSize="small" />
          ) : (
            <DarkModeRoundedIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <AuthButton />
    </Stack>
  );
}

function ResponsiveAppBar({
  language,
  onLanguageChange,
  onOpenNav,
}: {
  readonly language: string;
  readonly onLanguageChange: (language: string) => void;
  readonly onOpenNav: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <AppBar
      color="transparent"
      elevation={0}
      position="sticky"
      sx={{
        top: 0,
        borderBottom: "1px solid",
        borderColor: "divider",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.90) 0%, rgba(243,246,251,0.86) 100%)",
        '[data-mui-color-scheme="dark"] &': {
          background: "linear-gradient(135deg, rgba(13,20,39,0.92) 0%, rgba(11,18,32,0.88) 100%)",
        },
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          minHeight: { xs: 60, md: 68 },
          px: { xs: 1.5, sm: 2, md: 3 },
          gap: { xs: 1, md: 2 },
          justifyContent: "space-between",
        }}
      >
        {/* ===== 左: ハンバーガー（モバイル）+ ロゴ ===== */}
        <Box sx={{ flexGrow: 1, ...flexRowCenter, gap: { xs: 1, md: 1.5 } }}>
          <IconButton
            size="medium"
            aria-label={t("navigation.openMenu")}
            onClick={onOpenNav}
            color="primary"
            sx={{
              display: { xs: "inline-flex", md: "none" },
            }}
          >
            <MenuIcon fontSize="small" />
          </IconButton>

          {/* ロゴ + ブランド名 */}
          <Box
            component={Link}
            href="/"
            sx={{
              ...flexRowCenter,
              gap: 1.25,
              textDecoration: "none",
              "&:hover .logo-icon": {
                filter: `drop-shadow(0 2px 6px ${alpha(theme.palette.primary.main, 0.22)})`,
                transform: "scale(1.06)",
              },
              '[data-mui-color-scheme="dark"] &:hover .logo-icon': {
                filter: `drop-shadow(0 0 10px ${alpha(theme.palette.primary.main, 0.28)})`,
              },
              "&:hover .brand-text": { opacity: 1 },
            }}
          >
            {/* アイコン */}
            <Box
              className="logo-icon"
              sx={{
                width: { xs: 34, md: 38 },
                height: { xs: 34, md: 38 },
                transition: "filter 0.25s ease, transform 0.25s ease",
                flexShrink: 0,
              }}
            >
              <PoketistixIcon sx={{ width: 38, height: 38 }} />
            </Box>

            {/* ブランド名 — md以上で表示 */}
            <Box
              className="brand-text"
              sx={{
                display: {
                  xs: "none",
                  md: "flex",
                },
                flexDirection: "column",
                opacity: 0.9,
                transition: "opacity 0.2s ease",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                <Typography
                  component="span"
                  sx={{
                    fontSize: { sm: 13, md: 14 },
                    fontWeight: 800,
                    letterSpacing: "0.16em",
                    lineHeight: 1,
                    backgroundImage: "linear-gradient(90deg, #1565c0 0%, #00897b 100%)",
                    '[data-mui-color-scheme="dark"] &': {
                      backgroundImage: "linear-gradient(90deg, #60a5fa 0%, #7dd8e0 100%)",
                    },
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Pokétistix
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: "text.secondary",
                    opacity: 0.75,
                  }}
                >
                  {`v${APP_VERSION}`}
                </Typography>
              </Box>
              <Typography
                component="span"
                sx={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  color: "text.secondary",
                  lineHeight: 1.4,
                  mt: 0.25,
                }}
              >
                {"ANALYTICS WORKSPACE"}
              </Typography>
            </Box>
          </Box>

          {/* Docs / Blog Links (Desktop) */}
          <Stack direction="row" spacing={0.5} sx={{ display: { xs: "none", md: "flex" }, ml: 2 }}>
            <Button
              component={Link}
              href="/docs"
              color="inherit"
              sx={{
                fontWeight: 600,
                color: "text.secondary",
                "&:hover": { color: "text.primary" },
              }}
            >
              Docs
            </Button>
            <Button
              component={Link}
              href="/blog"
              color="inherit"
              sx={{
                fontWeight: 600,
                color: "text.secondary",
                "&:hover": { color: "text.primary" },
              }}
            >
              Blog
            </Button>
            <Button
              component={Link}
              href="/quiz"
              color="inherit"
              sx={{
                fontWeight: 600,
                color: "text.secondary",
                "&:hover": { color: "text.primary" },
              }}
            >
              Quiz
            </Button>
          </Stack>
        </Box>

        {/* ===== 右: コントロール ===== */}
        <AppControls language={language} onLanguageChange={onLanguageChange} />
      </Toolbar>
    </AppBar>
  );
}

function MobileDrawerContent({
  onClose,
  language,
  onLanguageChange,
}: {
  readonly onClose: () => void;
  readonly language: string;
  readonly onLanguageChange: (language: string) => void;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();

  let currentSection = "poketistix";
  const pathWithoutLang = pathname.replace(/^\/(?:ja|en)(?=\/|$)/, "") || "/";
  if (pathWithoutLang.startsWith("/docs")) currentSection = "docs";
  if (pathWithoutLang.startsWith("/blog")) currentSection = "blog";
  if (pathWithoutLang.startsWith("/quiz")) currentSection = "quiz";

  return (
    <>
      <Box
        sx={{
          ...flexRowCenter,
          justifyContent: "space-between",
          px: 1.5,
          py: 1,
        }}
      >
        <FormControl size="small" variant="standard" sx={{ ml: 1 }}>
          <Select
            value={currentSection}
            onChange={(e) => {
              const value = e.target.value;
              const targetPath =
                value === "docs"
                  ? "/docs"
                  : value === "blog"
                    ? "/blog"
                    : value === "quiz"
                      ? "/quiz"
                      : "/";
              router.push(`/${language}${targetPath === "/" ? "" : targetPath}`);
              onClose();
            }}
            disableUnderline
            sx={{ fontWeight: 800, fontSize: "1.1rem" }}
          >
            <MenuItem value="poketistix" sx={{ fontWeight: 600 }}>
              Pokétistix
            </MenuItem>
            <MenuItem value="docs" sx={{ fontWeight: 600 }}>
              DOCS
            </MenuItem>
            <MenuItem value="blog" sx={{ fontWeight: 600 }}>
              BLOG
            </MenuItem>
            <MenuItem value="quiz" sx={{ fontWeight: 600 }}>
              QUIZ
            </MenuItem>
          </Select>
        </FormControl>
        <IconButton onClick={onClose} aria-label="close navigation">
          <ChevronLeftIcon />
        </IconButton>
      </Box>
      <Divider />
      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        <SideMenuContent onNavigate={onClose} />
      </Box>
      <Divider />
      {/* 言語切り替え */}
      <Box sx={{ px: 2, py: 2 }}>
        <FormControl size="small" fullWidth>
          <InputLabel id="mobile-language-select-label">{t("preferences.language")}</InputLabel>
          <Select
            labelId="mobile-language-select-label"
            label={t("preferences.language")}
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
          >
            {supportedLanguageOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    </>
  );
}

function AuthSyncEffect() {
  const { isMergeOpen, conflicts, setConflicts, onMergeCommit, onMergeCancel } = useAuthSync();
  return (
    <TeamMergeDialog
      open={isMergeOpen}
      conflicts={conflicts}
      setConflicts={setConflicts}
      onCommitAction={onMergeCommit}
      onCancelAction={onMergeCancel}
    />
  );
}

export function AppLayout({
  children,
  lang,
}: Readonly<{
  readonly children: ReactNode;
  readonly lang: string;
}>) {
  const router = useRouter();
  const { i18n } = useTranslation();

  if (typeof window === "undefined" && i18n.resolvedLanguage !== lang) {
    void i18n.changeLanguage(lang);
  }

  const activeLang = lang || i18n.resolvedLanguage || "en";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  useEffect(() => {
    if (lang && i18n.resolvedLanguage !== lang) {
      void i18n.changeLanguage(lang);
    }
  }, [lang, i18n]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.language, activeLang);
    document.cookie = `${STORAGE_KEYS.language}=${activeLang}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = activeLang;
  }, [activeLang]);

  const handleLanguageChange = (nextLanguage: string) => {
    void i18n.changeLanguage(nextLanguage);
    window.localStorage.setItem(STORAGE_KEYS.language, nextLanguage);
    document.cookie = `${STORAGE_KEYS.language}=${nextLanguage}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = nextLanguage;

    const currentPath = window.location.pathname;
    const newPath =
      currentPath.replace(/^\/(?:en|ja)(?=\/|$)/, `/${nextLanguage}`) || `/${nextLanguage}`;
    router.push(newPath);
  };

  return (
    <LangProvider lang={activeLang}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme} defaultMode="system">
          <CssBaseline />
          <BugReportProvider>
            <AuthSyncEffect />
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                minHeight: "100dvh",
                height: "100dvh",
                overflow: "hidden",
                width: "100%",
                bgcolor: "background.default",
              }}
            >
              <ResponsiveAppBar
                language={activeLang}
                onLanguageChange={handleLanguageChange}
                onOpenNav={() => setMobileNavOpen(true)}
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: `${SIDE_MENU_WIDTH}px minmax(0, 1fr)`,
                  },
                  flexGrow: 1,
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                {/* デスクトップ用サイドバー（md以上で表示） */}
                <SurfaceCard
                  borderRadius={0}
                  sx={{
                    display: { xs: "none", md: "flex" },
                    flexDirection: "row",
                    overflow: "hidden",
                  }}
                >
                  <Box sx={{ width: SIDE_MENU_WIDTH }}>
                    <SideMenuContent />
                  </Box>
                </SurfaceCard>

                {/* モバイル用サイドバー（md以上ではDrawerごと非表示） */}
                <Drawer
                  open={mobileNavOpen}
                  onClose={() => setMobileNavOpen(false)}
                  sx={{
                    display: { xs: "block", md: "none" },
                    "& .MuiDrawer-paper": {
                      width: "min(92vw, 320px)",
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                    },
                  }}
                >
                  <MobileDrawerContent
                    onClose={() => setMobileNavOpen(false)}
                    language={activeLang}
                    onLanguageChange={handleLanguageChange}
                  />
                </Drawer>

                <Box
                  component="main"
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100%",
                    minWidth: "100%",
                    margin: "0 auto",
                    overflowY: "auto",
                  }}
                >
                  <Box sx={{ flexGrow: 1 }}>{children}</Box>
                </Box>
              </Box>
            </Box>
            <Footer />
            <BugReportDialog />
          </BugReportProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </LangProvider>
  );
}
