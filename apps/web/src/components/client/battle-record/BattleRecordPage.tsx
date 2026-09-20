"use client";

import { useEffect, useMemo, useState, useRef, useSyncExternalStore } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  Fab,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import InsightsRounded from "@mui/icons-material/InsightsRounded";
import Image from "next/image";
import { LocalizedLink as Link } from "@/components/client/LocalizedLink";
import { useAtom, useAtomValue } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { isAuthenticatedAtom } from "@/store/auth";
import { activeTeamIdAtom, localTeamsAtom } from "@/store/team/team";
import { useSeasons } from "@/hooks/useSeasons";
import { useBattleRecords } from "@/hooks/useBattleRecords";
import { useTeamsData } from "@/hooks/useTeamsData";
import { saveTeamsToServer } from "@services/teams";
import { championsPokemonByIdentifier } from "@/data/champions-pokemon";
import { typeIcon } from "@/lib/image";
import { tally } from "@/store/battle-record/analytics";
import { draftToInput, type BattleRecordDraft } from "./formState";
import {
  type BattleRecord,
  type BattleResult,
  type Season,
  type SeasonInput,
  getLatestSeason,
} from "@/store/battle-record/battleRecord";
import type { Team, TrainedPokemon } from "@/store/team/team";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { flexRowCenter, sectionLabel, emptyStateCenter } from "@/theme/sx";
import { SeasonSelect } from "./SeasonSelect";
import { SeasonFormDialog } from "./SeasonFormDialog";
import { BattleRecordFormDialog } from "./BattleRecordFormDialog";
import { BattleRecordList } from "./BattleRecordList";
import { useHotkeys } from "react-hotkeys-hook";

type ResultFilter = "all" | BattleResult;

// デスクトップ用：元の詳細なパーティ表示
function PartyPanel({ team }: { readonly team: Team | null }) {
  const { t, i18n } = useTranslation();

  const members = (team?.members ?? []).filter((m): m is TrainedPokemon => m !== null);

  return (
    <Box>
      <Typography variant="overline" sx={{ ...sectionLabel, letterSpacing: "0.12em" }}>
        {t("battleRecord.party")}
      </Typography>
      {members.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t("battleRecord.noParty")}
        </Typography>
      ) : (
        <Stack spacing={0.75} sx={{ mt: 1 }}>
          {members.map((member) => {
            const types = championsPokemonByIdentifier.get(member.identifier)?.types ?? [];
            const formName = `pokemon.${member.identifier}.formName`;
            return (
              <Stack
                key={member.boxId}
                direction="row"
                spacing={1}
                sx={{
                  ...flexRowCenter,
                  bgcolor: "background.paperRaised",
                  borderRadius: 2,
                  py: 2,
                  px: 4,
                }}
              >
                <Image
                  src={`/pokemon/${member.identifier}.png`}
                  alt={member.identifier}
                  width={36}
                  height={36}
                />
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                    {t(`pokemon.${member.identifier}.name`)}
                    {i18n.exists(formName) && (
                      <Typography
                        component="span"
                        sx={{ ml: 0.5, fontSize: "0.75em", color: "text.secondary" }}
                      >
                        {t(formName)}
                      </Typography>
                    )}
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                    {types.map((type) => (
                      <Chip
                        key={type}
                        size="small"
                        avatar={
                          <Box
                            component="img"
                            src={typeIcon(type)}
                            alt={type}
                            sx={{ width: 14, height: 14 }}
                          />
                        }
                        label={t(`types.${type}.name`)}
                        sx={{ height: 18, fontSize: "0.6rem", "& .MuiChip-label": { px: 0.5 } }}
                      />
                    ))}
                  </Stack>
                </Box>
              </Stack>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}

// モバイル用：アイコンのみの横並びパーティ表示
function CompactPartyPanel({ team }: { readonly team: Team | null }) {
  const { t, i18n } = useTranslation();
  const members = (team?.members ?? []).filter((m): m is TrainedPokemon => m !== null);

  if (members.length === 0) return null;

  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
      {members.map((member) => {
        const formName = `pokemon.${member.identifier}.formName`;
        const displayName = `${t(`pokemon.${member.identifier}.name`)} ${
          i18n.exists(formName) ? `(${t(formName)})` : ""
        }`;

        return (
          <Tooltip key={member.boxId} title={displayName} arrow>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                bgcolor: "background.paper",
                boxShadow: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image
                src={`/pokemon/${member.identifier}.png`}
                alt={member.identifier}
                width={28}
                height={28}
              />
            </Box>
          </Tooltip>
        );
      })}
    </Stack>
  );
}

function Counter({
  label,
  value,
  color,
}: {
  readonly label: string;
  readonly value: number;
  readonly color: string;
}) {
  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography variant="caption" sx={{ fontWeight: 800, color }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1 }}>
        {value}
      </Typography>
    </Box>
  );
}

function StatsBar({ records }: { readonly records: readonly BattleRecord[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const stats = useMemo(() => tally(records), [records]);
  const winPct = stats.total === 0 ? 0 : Math.round((stats.wins / stats.total) * 100);
  const decided = stats.wins + stats.losses;

  const { latestRating, ratingDelta } = useMemo(() => {
    const ratedRecords = records.filter((r) => r.rating !== null);
    const latest = ratedRecords[0]?.rating ?? null;
    const prev = ratedRecords[1]?.rating ?? null;
    const delta = latest !== null && prev !== null ? Math.round((latest - prev) * 100) / 100 : null;
    return { latestRating: latest, ratingDelta: delta };
  }, [records]);

  return (
    <SurfaceCard sx={{ p: 2 }}>
      <Stack
        direction="row"
        spacing={{ xs: 2, md: 3 }}
        sx={{ ...flexRowCenter, flexWrap: "wrap", justifyContent: "space-between", rowGap: 1.5 }}
      >
        <Box>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ fontWeight: 700, display: "block", lineHeight: 1 }}
          >
            {t("battleRecord.currentRating")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
            <Typography variant="h4" sx={{ fontWeight: 900, color: "text.primary" }}>
              {latestRating !== null ? latestRating : "—"}
            </Typography>
            {ratingDelta !== null && (
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 800,
                  color:
                    ratingDelta > 0
                      ? theme.palette.success.main
                      : ratingDelta < 0
                        ? theme.palette.error.main
                        : "text.secondary",
                }}
              >
                {ratingDelta > 0 ? `+${ratingDelta}` : ratingDelta}
              </Typography>
            )}
          </Stack>
        </Box>
        <Box>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ fontWeight: 700, display: "block", lineHeight: 1 }}
          >
            {t("battleRecord.analytics.winRate")}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 900, color: theme.palette.primary.main }}>
            {stats.total === 0 ? "—" : `${winPct}%`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Counter label="W" value={stats.wins} color={theme.palette.success.main} />
          <Counter label="L" value={stats.losses} color={theme.palette.error.main} />
          <Counter label="D" value={stats.draws} color={theme.palette.text.secondary} />
        </Stack>
        <Box sx={{ flexGrow: 1, minWidth: { xs: "100%", sm: 160 }, mt: { xs: 1, sm: 0 } }}>
          <Box
            sx={{
              display: "flex",
              height: 8,
              overflow: "hidden",
              bgcolor: theme.palette.divider,
              borderRadius: 4,
              py: 4,
              px: 8,
            }}
          >
            {decided > 0 && (
              <>
                <Box
                  sx={{
                    width: `${(stats.wins / decided) * 100}%`,
                    bgcolor: theme.palette.success.main,
                  }}
                />
                <Box
                  sx={{
                    width: `${(stats.losses / decided) * 100}%`,
                    bgcolor: theme.palette.error.main,
                  }}
                />
              </>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            {t("battleRecord.games", { count: stats.total })}
          </Typography>
        </Box>
      </Stack>
    </SurfaceCard>
  );
}

export default function BattleRecordPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const { teams: rawTeams, isLoading: teamsLoading } = useTeamsData();
  const {
    seasons,
    isLoading: seasonsLoading,
    createSeason,
    updateSeason,
    removeSeason,
    isMutating: seasonMutating,
  } = useSeasons();

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const safeTeams = useMemo(() => (mounted ? rawTeams : []), [mounted, rawTeams]);

  const [activeTeamId, setActiveTeamId] = useAtom(activeTeamIdAtom);
  const [localTeams, setLocalTeams] = useAtom(localTeamsAtom);
  const queryClient = useQueryClient();
  const [isSubmittingRecord, setIsSubmittingRecord] = useState(false);
  const isSubmittingRecordRef = useRef(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [snackbar, setSnackbar] = useState<{
    readonly open: boolean;
    readonly message: string;
    readonly severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  useEffect(() => {
    if (
      mounted &&
      safeTeams.length > 0 &&
      (!activeTeamId || !safeTeams.some((t) => t.id === activeTeamId))
    ) {
      setActiveTeamId(safeTeams[0].id);
    }
  }, [mounted, activeTeamId, safeTeams, setActiveTeamId]);

  const activeTeam = useMemo(() => {
    if (activeTeamId && safeTeams.some((tm) => tm.id === activeTeamId)) {
      return safeTeams.find((tm) => tm.id === activeTeamId) ?? null;
    }
    return safeTeams[0] ?? null;
  }, [safeTeams, activeTeamId]);

  const teamNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const tm of safeTeams) {
      map.set(tm.id, tm.name);
    }
    return map;
  }, [safeTeams]);

  const activeSeason = useMemo(() => {
    if (selectedSeasonId && seasons.some((s) => s.id === selectedSeasonId)) {
      return seasons.find((s) => s.id === selectedSeasonId) ?? null;
    }
    return getLatestSeason(seasons);
  }, [seasons, selectedSeasonId]);
  const activeSeasonId = activeSeason?.id ?? null;

  // そのシーズンのバトルレコードはチームで絞り込まず全件取得・表示する
  const {
    records,
    isLoading: recordsLoading,
    createRecord,
    updateRecord,
    removeRecord,
    isMutating,
  } = useBattleRecords({ seasonId: activeSeasonId });

  const counts = useMemo(() => tally(records), [records]);
  const filteredRecords = useMemo(
    () => (filter === "all" ? records : records.filter((r) => r.result === filter)),
    [records, filter],
  );

  const teamMembers = useMemo(
    () => (activeTeam?.members ?? []).filter((m): m is TrainedPokemon => m !== null),
    [activeTeam],
  );

  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [seasonEditing, setSeasonEditing] = useState<Season | null>(null);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [recordEditing, setRecordEditing] = useState<BattleRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [seasonPendingDelete, setSeasonPendingDelete] = useState<Season | null>(null);

  useHotkeys("n", () => {
    setRecordDialogOpen(true);
  });

  if (!isAuthenticated) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h6" color="text.secondary">
          {t("auth.loginRequired")}
        </Typography>
      </Box>
    );
  }

  const handleSeasonSubmit = async (input: SeasonInput) => {
    try {
      if (seasonEditing) {
        await updateSeason(seasonEditing.id, input);
      } else {
        const created = await createSeason(input);
        setSelectedSeasonId(created.id);
      }
      setSeasonDialogOpen(false);
      setSeasonEditing(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSnackbar({
        open: true,
        message: msg,
        severity: "error",
      });
    }
  };

  const handleRecordSubmit = async (draft: BattleRecordDraft, seasonId: string) => {
    if (isSubmittingRecordRef.current) return;
    isSubmittingRecordRef.current = true;
    setIsSubmittingRecord(true);
    try {
      const input = draftToInput(draft, seasonId);

      // ローカル限定チームの場合は、DBの外部キー制約および競合を防ぐため直列で先に同期
      if (draft.teamId && localTeams.some((lt) => lt.id === draft.teamId)) {
        const selectedTeam = safeTeams.find((tm) => tm.id === draft.teamId);
        if (selectedTeam) {
          try {
            await saveTeamsToServer([selectedTeam]);
            setLocalTeams((prev) => prev.filter((t) => t.id !== selectedTeam.id));
            void queryClient.invalidateQueries({ queryKey: ["teams"] });
          } catch (teamErr) {
            // チーム同期失敗 → バトルレコード保存も中断してエラーを伝搬させる
            // 握りつぶすと DB の外部キー制約違反で 500 になり、サイレント失敗になる
            throw teamErr instanceof Error ? teamErr : new Error(t("battleRecord.teamSyncFailed"));
          }
        }
      }

      if (recordEditing) {
        const { seasonId: _seasonId, ...update } = input;
        await updateRecord(recordEditing.id, update);
      } else {
        await createRecord(input);
      }

      // 現在と異なるシーズンに記録した場合は、表示中のシーズンを自動切り替え
      if (seasonId !== activeSeasonId) {
        setSelectedSeasonId(seasonId);
      }

      setRecordDialogOpen(false);
      setRecordEditing(null);
      setSnackbar({
        open: true,
        message: t("battleRecord.saveSuccess"),
        severity: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSnackbar({
        open: true,
        message: msg || t("battleRecord.saveFailed"),
        severity: "error",
      });
      // ダイアログ側でエラーを表示し、下書き入力を保持させるため再throw
      throw err;
    } finally {
      isSubmittingRecordRef.current = false;
      setIsSubmittingRecord(false);
    }
  };

  const filterTabs: readonly { readonly value: ResultFilter; readonly label: string }[] = [
    { value: "all", label: `${t("battleRecord.filter.all")} ${counts.total}` },
    { value: "win", label: `${t("battleRecord.result.win")} ${counts.wins}` },
    { value: "loss", label: `${t("battleRecord.result.loss")} ${counts.losses}` },
    { value: "draw", label: `${t("battleRecord.result.draw")} ${counts.draws}` },
  ];

  const showEmptyState =
    !teamsLoading && !seasonsLoading && (safeTeams.length === 0 || seasons.length === 0);

  return (
    <Box sx={{ position: "relative", pb: { xs: 10, md: 0 } }}>
      {/* モバイル専用：Sticky固定ヘッダー (md以上で非表示) */}
      <Box
        sx={{
          display: { xs: "block", md: "none" },
          position: "sticky",
          top: 0,
          zIndex: 10,
          bgcolor: "background.default",
          pt: 2,
          pb: 1,
          px: 2,
          borderBottom: "1px solid",
          borderColor: theme.palette.divider,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <Select
              value={activeTeam?.id ?? ""}
              onChange={(e) => setActiveTeamId(e.target.value || null)}
              displayEmpty
            >
              {safeTeams.length === 0 && (
                <MenuItem value="" disabled>
                  {t("battleRecord.noTeams")}
                </MenuItem>
              )}
              {safeTeams.map((tm) => (
                <MenuItem key={tm.id} value={tm.id}>
                  {tm.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <SeasonSelect
            seasons={seasons}
            value={activeSeasonId}
            onChange={setSelectedSeasonId}
            onNew={() => {
              setSeasonEditing(null);
              setSeasonDialogOpen(true);
            }}
            onEdit={(season) => {
              setSeasonEditing(season);
              setSeasonDialogOpen(true);
            }}
            onDelete={(season) => setSeasonPendingDelete(season)}
            sx={{ flex: 1 }}
          />
        </Stack>
        <CompactPartyPanel team={activeTeam} />
      </Box>

      {/* 全体レイアウト (デスクトップ時は2カラム) */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "240px minmax(0, 1fr)" },
          gap: { xs: 2, md: 3 },
          px: { xs: 1, sm: 2, md: 3 },
          py: { xs: 2, md: 3 },
          alignItems: "start",
        }}
      >
        {/* 左カラム：デスクトップ専用サイドバー (md未満で非表示) */}
        <SurfaceCard
          sx={{
            display: { xs: "none", md: "block" },
            p: 2,
            position: "sticky",
            top: 16,
          }}
        >
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel id="team-select-label" shrink={safeTeams.length === 0 ? true : undefined}>
              {t("battleRecord.team")}
            </InputLabel>
            <Select
              labelId="team-select-label"
              label={t("battleRecord.team")}
              value={activeTeam?.id ?? ""}
              onChange={(e) => setActiveTeamId(e.target.value || null)}
              displayEmpty
            >
              {safeTeams.length === 0 && (
                <MenuItem value="" disabled>
                  {t("battleRecord.noTeams")}
                </MenuItem>
              )}
              {safeTeams.map((tm) => (
                <MenuItem key={tm.id} value={tm.id}>
                  {tm.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <PartyPanel team={activeTeam} />
        </SurfaceCard>

        {/* 右カラム：メインコンテンツ */}
        <Box>
          {/* デスクトップ専用：操作バー (md未満で非表示) */}
          <Stack
            direction="row"
            spacing={2}
            sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", mb: 2 }}
          >
            <SeasonSelect
              seasons={seasons}
              value={activeSeasonId}
              onChange={setSelectedSeasonId}
              onNew={() => {
                setSeasonEditing(null);
                setSeasonDialogOpen(true);
              }}
              onEdit={(season) => {
                setSeasonEditing(season);
                setSeasonDialogOpen(true);
              }}
              onDelete={(season) => setSeasonPendingDelete(season)}
              label={t("battleRecord.season.label")}
              sx={{ minWidth: 220 }}
            />
            <Box sx={{ flexGrow: 1 }} />
            <Button
              component={Link}
              href="/battle-analytics"
              startIcon={<InsightsRounded />}
              variant="outlined"
            >
              {t("battleRecord.viewAnalytics")}
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              disabled={!activeSeasonId}
              onClick={() => {
                setRecordEditing(null);
                setRecordDialogOpen(true);
              }}
            >
              {t("battleRecord.recordBattle")}
            </Button>
          </Stack>

          {showEmptyState ? (
            <Box sx={emptyStateCenter}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {safeTeams.length === 0
                  ? t("battleRecord.needTeam")
                  : t("battleRecord.season.emptyPrompt")}
              </Typography>
              {safeTeams.length === 0 ? (
                <Button component={Link} href="/team-builder" variant="contained">
                  {t("navigation.items.createTeam")}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => {
                    setSeasonEditing(null);
                    setSeasonDialogOpen(true);
                  }}
                >
                  {t("battleRecord.season.new")}
                </Button>
              )}
            </Box>
          ) : (
            <>
              <Box sx={{ mb: 2 }}>
                <StatsBar records={records} />
              </Box>

              <Tabs
                value={filter}
                onChange={(_, value: ResultFilter) => setFilter(value)}
                sx={{ mb: 2, minHeight: 36 }}
                variant="scrollable"
                scrollButtons="auto"
              >
                {filterTabs.map((tab) => (
                  <Tab
                    key={tab.value}
                    value={tab.value}
                    label={tab.label}
                    sx={{ minHeight: 36, py: 0 }}
                  />
                ))}
              </Tabs>

              {recordsLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <BattleRecordList
                  records={filteredRecords}
                  formatLabel={activeSeason?.name}
                  teamNameMap={teamNameMap}
                  onEdit={(record) => {
                    setRecordEditing(record);
                    setRecordDialogOpen(true);
                  }}
                  onDelete={(id) => setPendingDelete(id)}
                />
              )}
            </>
          )}
        </Box>
      </Box>

      {/* モバイル専用：記録追加用 Floating Action Button (FAB) (md以上で非表示) */}
      <Fab
        color="primary"
        aria-label="add"
        disabled={!activeSeasonId}
        onClick={() => {
          setRecordEditing(null);
          setRecordDialogOpen(true);
        }}
        sx={{
          display: { xs: "flex", md: "none" },
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 1000,
        }}
      >
        <Add />
      </Fab>

      {/* ダイアログ群 */}
      <SeasonFormDialog
        open={seasonDialogOpen}
        onClose={() => setSeasonDialogOpen(false)}
        editing={seasonEditing}
        onSubmit={handleSeasonSubmit}
        submitting={seasonMutating}
      />
      <BattleRecordFormDialog
        open={recordDialogOpen}
        onClose={() => setRecordDialogOpen(false)}
        editing={recordEditing}
        teams={safeTeams}
        teamMembers={teamMembers}
        teamId={activeTeam?.id ?? null}
        seasons={seasons}
        defaultSeasonId={activeSeasonId}
        onSubmit={handleRecordSubmit}
        submitting={isMutating || isSubmittingRecord}
      />

      <Dialog open={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <DialogTitle>{t("battleRecord.deleteTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("battleRecord.deleteConfirm")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>{t("common.cancel")}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              if (pendingDelete) await removeRecord(pendingDelete);
              setPendingDelete(null);
            }}
          >
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={seasonPendingDelete !== null} onClose={() => setSeasonPendingDelete(null)}>
        <DialogTitle>{t("battleRecord.season.deleteTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("battleRecord.season.deleteConfirm", { name: seasonPendingDelete?.name ?? "" })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeasonPendingDelete(null)}>{t("common.cancel")}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              if (seasonPendingDelete) await removeSeason(seasonPendingDelete.id);
              setSeasonPendingDelete(null);
            }}
          >
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
