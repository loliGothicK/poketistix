"use client";

import { useMemo, useState } from "react";
import {
  alpha,
  Avatar,
  Box,
  Button,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import SportsMmaRounded from "@mui/icons-material/SportsMmaRounded";
import { LocalizedLink as Link } from "@/components/client/LocalizedLink";
import { useAtomValue } from "jotai";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { isAuthenticatedAtom } from "@/store/auth";
import { useSeasons } from "@/hooks/useSeasons";
import { useBattleRecords } from "@/hooks/useBattleRecords";
import { useTeamsData } from "@/hooks/useTeamsData";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { EmptyState } from "@/components/common/EmptyState";
import { flexRowCenter } from "@/theme/sx";
import {
  myPokemonStats,
  opponentStats,
  tally,
  teamStats,
  winRatePercent,
} from "@/store/battle-record/analytics";
import { getLatestSeason } from "@/store/battle-record/battleRecord";

function StatCard({
  label,
  value,
  caption,
  accent,
}: {
  readonly label: string;
  readonly value: string;
  readonly caption?: string;
  readonly accent?: string;
}) {
  return (
    <SurfaceCard raised sx={{ p: 2.5, height: "100%" }}>
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 800, color: accent ?? "text.primary", mt: 0.5 }}>
        {value}
      </Typography>
      {caption && (
        <Typography variant="caption" color="text.secondary">
          {caption}
        </Typography>
      )}
    </SurfaceCard>
  );
}

export default function BattleAnalyticsPage() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const { seasons, isLoading: seasonsLoading } = useSeasons();

  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const activeSeason = useMemo(() => {
    if (selectedSeasonId && seasons.some((s) => s.id === selectedSeasonId)) {
      return seasons.find((s) => s.id === selectedSeasonId) ?? null;
    }
    return getLatestSeason(seasons);
  }, [seasons, selectedSeasonId]);
  const activeSeasonId = activeSeason?.id ?? null;

  const { teams } = useTeamsData();
  const [analyticsTab, setAnalyticsTab] = useState<"myPokemon" | "teams" | "opponents">(
    "myPokemon",
  );

  const { records, isLoading: recordsLoading } = useBattleRecords({ seasonId: activeSeasonId });

  const overall = useMemo(() => tally(records), [records]);
  const opponents = useMemo(() => opponentStats(records), [records]);
  const teamStatsList = useMemo(() => teamStats(records), [records]);
  const myPokemonList = useMemo(() => myPokemonStats(records), [records]);
  const overallPercent = winRatePercent(overall);

  if (!isAuthenticated) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h6" color="text.secondary">
          {t("auth.loginRequired")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ alignItems: { md: "center" }, mb: 3 }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {t("battleRecord.analytics.title")}
        </Typography>
        <Button
          component={Link}
          href="/battle-record"
          startIcon={<SportsMmaRounded />}
          variant="outlined"
        >
          {t("battleRecord.analytics.backToRecords")}
        </Button>
      </Stack>

      <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 260 }, mb: 3 }}>
        <InputLabel id="analytics-season-label" shrink={seasons.length === 0 ? true : undefined}>
          {t("battleRecord.season.label")}
        </InputLabel>
        <Select
          labelId="analytics-season-label"
          label={t("battleRecord.season.label")}
          value={activeSeason?.id ?? ""}
          onChange={(e) => setSelectedSeasonId(e.target.value || null)}
          displayEmpty
        >
          {seasons.length === 0 && (
            <MenuItem value="" disabled>
              {t("battleRecord.season.none")}
            </MenuItem>
          )}
          {seasons.map((season) => (
            <MenuItem key={season.id} value={season.id}>
              {season.name} · {t(`battleRecord.format.${season.format}`)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {seasonsLoading || recordsLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : records.length === 0 ? (
        <EmptyState message={t("battleRecord.analytics.empty")} />
      ) : (
        <Stack spacing={3}>
          {/* サマリーカード */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatCard
                label={t("battleRecord.analytics.winRate")}
                value={overallPercent === null ? "—" : `${overallPercent}%`}
                accent={theme.palette.primary.main}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatCard label={t("battleRecord.analytics.total")} value={String(overall.total)} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatCard
                label={t("battleRecord.result.win")}
                value={String(overall.wins)}
                accent={theme.palette.success.main}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatCard
                label={t("battleRecord.result.loss")}
                value={String(overall.losses)}
                accent={theme.palette.error.main}
              />
            </Grid>
          </Grid>

          <SurfaceCard sx={{ p: 2.5 }}>
            <Tabs
              value={analyticsTab}
              onChange={(_, val) => setAnalyticsTab(val)}
              sx={{ borderBottom: 1, borderColor: "divider", mb: 2.5 }}
            >
              <Tab label={t("battleRecord.analytics.tabs.myPokemon")} value="myPokemon" />
              <Tab label={t("battleRecord.analytics.tabs.teams")} value="teams" />
              <Tab label={t("battleRecord.analytics.tabs.opponents")} value="opponents" />
            </Tabs>

            {analyticsTab === "myPokemon" && (
              <Stack spacing={1.5}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  {t("battleRecord.analytics.myPokemonTitle")}
                </Typography>
                {myPokemonList.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("battleRecord.analytics.empty")}
                  </Typography>
                ) : (
                  myPokemonList.map((item) => {
                    const selectedWinPct = winRatePercent(item.selectedTally);
                    const pickPct = Math.round(item.selectionRate * 100);
                    return (
                      <Stack
                        key={item.pokemonSlug}
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.5}
                        sx={{
                          alignItems: { sm: "center" },
                          justifyContent: "space-between",
                          p: 1.5,
                          borderRadius: 2,
                          bgcolor: "background.paperRaised",
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1.5}
                          sx={{ alignItems: "center", minWidth: { sm: 200 } }}
                        >
                          <Avatar
                            src={`/pokemon/${item.pokemonSlug}.png`}
                            alt={item.pokemonSlug}
                            sx={{
                              width: 36,
                              height: 36,
                              bgcolor: alpha(theme.palette.primary.main, 0.08),
                            }}
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                              {i18n.exists(`pokemon.${item.pokemonSlug}.name`)
                                ? t(`pokemon.${item.pokemonSlug}.name`)
                                : item.pokemonSlug}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {t("battleRecord.analytics.selectionRate")}: {pickPct}% (
                              {item.selectedCount}/{item.rosterTotal})
                            </Typography>
                          </Box>
                        </Stack>

                        <Box sx={{ flexGrow: 1, minWidth: { xs: "100%", sm: 140 }, px: { sm: 2 } }}>
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.5 }}
                          >
                            <Typography variant="caption" color="text.secondary">
                              {t("battleRecord.analytics.selectedWinRate")}
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                              {selectedWinPct === null ? "—" : `${selectedWinPct}%`}
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={selectedWinPct ?? 0}
                            sx={{ height: 6, borderRadius: 3 }}
                          />
                        </Box>

                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            whiteSpace: "nowrap",
                            minWidth: 64,
                            textAlign: { xs: "left", sm: "right" },
                          }}
                        >
                          {t("battleRecord.analytics.wldShort", {
                            w: item.selectedTally.wins,
                            l: item.selectedTally.losses,
                            d: item.selectedTally.draws,
                          })}
                        </Typography>
                      </Stack>
                    );
                  })
                )}
              </Stack>
            )}

            {analyticsTab === "teams" && (
              <Stack spacing={1.5}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  {t("battleRecord.analytics.teamsTitle")}
                </Typography>
                {teamStatsList.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("battleRecord.analytics.empty")}
                  </Typography>
                ) : (
                  teamStatsList.map((item, idx) => {
                    const teamObj = item.teamId ? teams.find((t) => t.id === item.teamId) : null;
                    const teamName = teamObj?.name ?? t("battleRecord.analytics.unassignedTeam");
                    const percent = winRatePercent(item);

                    return (
                      <Stack
                        key={item.teamId ?? `unassigned-${idx}`}
                        spacing={1.25}
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          bgcolor: "background.paperRaised",
                        }}
                      >
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
                        >
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                              {teamName}
                            </Typography>
                            {item.members.length > 0 && (
                              <Stack
                                direction="row"
                                spacing={0.75}
                                sx={{ mt: 0.5, flexWrap: "wrap" }}
                              >
                                {item.members.map((member, mIdx) => (
                                  <Tooltip
                                    key={`${member.identifier}-${mIdx}`}
                                    title={
                                      i18n.exists(`pokemon.${member.identifier}.name`)
                                        ? t(`pokemon.${member.identifier}.name`)
                                        : member.identifier
                                    }
                                    arrow
                                  >
                                    <Avatar
                                      src={`/pokemon/${member.identifier}.png`}
                                      alt={member.identifier}
                                      sx={{
                                        width: 28,
                                        height: 28,
                                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                                      }}
                                    />
                                  </Tooltip>
                                ))}
                              </Stack>
                            )}
                          </Box>

                          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                            <Box sx={{ minWidth: 80, textAlign: { xs: "left", sm: "right" } }}>
                              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                {percent === null ? "—" : `${percent}%`}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {t("battleRecord.analytics.wldShort", {
                                  w: item.wins,
                                  l: item.losses,
                                  d: item.draws,
                                })}
                              </Typography>
                            </Box>
                          </Stack>
                        </Stack>

                        <LinearProgress
                          variant="determinate"
                          value={percent ?? 0}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Stack>
                    );
                  })
                )}
              </Stack>
            )}

            {analyticsTab === "opponents" && (
              <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  {t("battleRecord.analytics.topOpponents")}
                </Typography>
                {opponents.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("battleRecord.analytics.empty")}
                  </Typography>
                ) : (
                  opponents.slice(0, 12).map((opponent) => {
                    const percent = winRatePercent(opponent);
                    return (
                      <Stack
                        key={opponent.pokemonSlug}
                        direction="row"
                        spacing={1.5}
                        sx={flexRowCenter}
                      >
                        <Avatar
                          src={`/pokemon/${opponent.pokemonSlug}.png`}
                          alt={opponent.pokemonSlug}
                          sx={{
                            width: 32,
                            height: 32,
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                          }}
                        />
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                            {i18n.exists(`pokemon.${opponent.pokemonSlug}.name`)
                              ? t(`pokemon.${opponent.pokemonSlug}.name`)
                              : opponent.pokemonSlug}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={percent ?? 0}
                            sx={{
                              height: 6,
                              mt: 0.25,
                              borderRadius: 3,
                              py: 3,
                              px: 6,
                            }}
                          />
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          {percent === null ? "—" : `${percent}%`}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: "nowrap", minWidth: 64, textAlign: "right" }}
                        >
                          {t("battleRecord.analytics.wldShort", {
                            w: opponent.wins,
                            l: opponent.losses,
                            d: opponent.draws,
                          })}
                        </Typography>
                      </Stack>
                    );
                  })
                )}
              </Stack>
            )}
          </SurfaceCard>
        </Stack>
      )}
    </Box>
  );
}
