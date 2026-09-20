"use client";

import { useMemo, useState, useRef } from "react";
import {
  Alert,
  alpha,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Autocomplete,
  Chip,
} from "@mui/material";
import Close from "@mui/icons-material/Close";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { useHotkeys } from "react-hotkeys-hook";
import { match } from "ts-pattern";
import type { Team, TrainedPokemon } from "@/store/team/team";
import type {
  BattleFormat,
  BattleRecord,
  BattleResult,
  Season,
} from "@/store/battle-record/battleRecord";
import { emptyDraft, draftFromRecord, type BattleRecordDraft } from "./formState";
import { emptySelection } from "./selection";
import { YourTeamSelector } from "./YourTeamSelector";
import { OpponentSlots } from "./OpponentSlots";
import { flexRowCenter, sectionLabel } from "@/theme/sx";

interface BattleRecordFormDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly editing: BattleRecord | null;
  readonly teams?: readonly Team[];
  /** アクティブチームのメンバー（新規記録の初期値） */
  readonly teamMembers: readonly TrainedPokemon[];
  readonly teamId: string | null;
  readonly seasons: readonly Season[];
  readonly defaultSeasonId: string | null;
  readonly onSubmit: (draft: BattleRecordDraft, seasonId: string) => Promise<void>;
  readonly submitting: boolean;
}

const RESULT_OPTIONS: readonly BattleResult[] = ["win", "loss", "draw"];

const PREDEFINED_TAGS = [
  { slug: "trick-room", group: "gimmick" },
  { slug: "tailwind", group: "gimmick" },
  { slug: "weather-rain", group: "gimmick" },
  { slug: "weather-sun", group: "gimmick" },
  { slug: "weather-snow", group: "gimmick" },
  { slug: "weather-sand", group: "gimmick" },
  { slug: "redirection", group: "gimmick" },
  { slug: "perish-trap", group: "gimmick" },
  { slug: "speed-control", group: "role" },
  { slug: "follow-me", group: "role" },
  { slug: "fake-out", group: "role" },
  { slug: "intimidate", group: "role" },
  { slug: "cycle", group: "role" },
  { slug: "sleep-control", group: "role" },
  { slug: "mega-focused", group: "role" },
  { slug: "standard", group: "role" },
];

const PREDEFINED_TAG_SLUGS = PREDEFINED_TAGS.map((t) => t.slug);

export function BattleRecordFormDialog({
  open,
  onClose,
  editing,
  teams,
  teamMembers,
  teamId,
  seasons,
  defaultSeasonId,
  onSubmit,
  submitting,
}: BattleRecordFormDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      scroll="paper"
    >
      {open && (
        <BattleRecordFormContent
          key={editing?.id ?? "new"}
          onClose={onClose}
          editing={editing}
          teams={teams}
          teamMembers={teamMembers}
          teamId={teamId}
          seasons={seasons}
          defaultSeasonId={defaultSeasonId}
          onSubmit={onSubmit}
          submitting={submitting}
        />
      )}
    </Dialog>
  );
}

function BattleRecordFormContent({
  onClose,
  editing,
  teams,
  teamMembers,
  teamId,
  seasons,
  defaultSeasonId,
  onSubmit,
  submitting,
}: Omit<BattleRecordFormDialogProps, "open">) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [selectedSeasonIdOverride, setSelectedSeasonIdOverride] = useState<string | null>(null);
  const seasonId = editing ? editing.seasonId : (selectedSeasonIdOverride ?? defaultSeasonId);

  const initialFormat = editing
    ? (seasons.find((s) => s.id === editing.seasonId)?.format ?? "doubles")
    : "doubles";

  const initialTeam = useMemo(() => {
    if (editing && editing.teamId) {
      return teams?.find((tm) => tm.id === editing.teamId) ?? null;
    }
    if (teamId) {
      return teams?.find((tm) => tm.id === teamId) ?? null;
    }
    return teams?.[0] ?? null;
  }, [teams, editing, teamId]);

  const resolvedTeamMembers = useMemo(() => {
    if (initialTeam) {
      return (initialTeam.members ?? []).filter((m): m is TrainedPokemon => m !== null);
    }
    return teamMembers;
  }, [initialTeam, teamMembers]);

  const [draft, setDraft] = useState<BattleRecordDraft>(
    editing
      ? draftFromRecord(editing, initialFormat)
      : emptyDraft({ teamId: initialTeam?.id ?? teamId, myTeam: resolvedTeamMembers }),
  );
  const [resultChosen, setResultChosen] = useState(!!editing);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const isPending = submitting || localSubmitting;

  const format: BattleFormat = useMemo(
    () => seasons.find((s) => s.id === seasonId)?.format ?? "doubles",
    [seasons, seasonId],
  );

  const chooseResult = (result: BattleResult) => {
    if (isPending) return;
    setDraft((prev) => ({ ...prev, result }));
    setResultChosen(true);
  };

  const canSave = resultChosen && seasonId !== null && !isPending;

  const handleSubmit = async () => {
    if (!canSave || !seasonId || submittingRef.current || isPending) return;
    submittingRef.current = true;
    setLocalSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(draft, seasonId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("battleRecord.saveFailed");
      setSubmitError(msg);
    } finally {
      submittingRef.current = false;
      setLocalSubmitting(false);
    }
  };

  useHotkeys("w", () => chooseResult("win"), [isPending]);
  useHotkeys("l", () => chooseResult("loss"), [isPending]);
  useHotkeys("d", () => chooseResult("draw"), [isPending]);
  useHotkeys(
    "ctrl+s, meta+s",
    (e) => {
      e.preventDefault();
      void handleSubmit();
    },
    { enableOnFormTags: true },
    [canSave, seasonId, draft, isPending],
  );

  const resultColor = (result: BattleResult): string =>
    match(result)
      .with("win", () => theme.palette.success.main)
      .with("loss", () => theme.palette.error.main)
      .with("draw", () => theme.palette.text.secondary)
      .exhaustive();

  return (
    <>
      {/* ヘッダー */}
      <Stack direction="row" sx={{ ...flexRowCenter, px: 3, py: 2, gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: "0.06em", flexGrow: 1 }}>
          {editing ? t("battleRecord.form.editTitle") : t("battleRecord.form.newTitle")}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: { xs: "none", sm: "block" } }}
        >
          {t("battleRecord.form.escHint")}
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          aria-label={t("common.close")}
          disabled={isPending}
        >
          <Close />
        </IconButton>
      </Stack>
      <Divider />

      <DialogContent>
        <Stack spacing={3}>
          {/* 勝敗（大きいボタン + W/L/D キー） */}
          <Box>
            <Stack direction="row" spacing={1} sx={{ ...flexRowCenter, mb: 1 }}>
              <Typography variant="overline" sx={{ ...sectionLabel, fontWeight: 700 }}>
                {t("battleRecord.form.result")}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                {["W", "L", "D"].map((k) => (
                  <Box
                    key={k}
                    sx={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      border: "1px solid",
                      borderColor: theme.palette.divider,
                      color: "text.secondary",
                      borderRadius: 0.75,
                      py: 0.75,
                      px: 1.5,
                    }}
                  >
                    {k}
                  </Box>
                ))}
              </Stack>
            </Stack>
            <Stack direction="row" spacing={1.5}>
              {RESULT_OPTIONS.map((result) => {
                const active = resultChosen && draft.result === result;
                const color = resultColor(result);
                return (
                  <Box
                    key={result}
                    onClick={() => chooseResult(result)}
                    role="button"
                    aria-pressed={active}
                    sx={{
                      flex: 1,
                      textAlign: "center",
                      border: "2px solid",
                      borderColor: active ? color : theme.palette.divider,
                      bgcolor: active ? alpha(color, 0.14) : "transparent",
                      color: active ? color : "text.secondary",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      "&:hover": { borderColor: color, bgcolor: alpha(color, 0.08) },
                      borderRadius: 3,
                      py: 1.5,
                    }}
                  >
                    {t(`battleRecord.result.${result}`).toUpperCase()}
                  </Box>
                );
              })}
            </Stack>
          </Box>

          {/* 自チーム選択 */}
          {teams && teams.length > 0 && (
            <FormControl size="small" fullWidth>
              <InputLabel id="record-team-label">{t("battleRecord.form.team")}</InputLabel>
              <Select
                labelId="record-team-label"
                label={t("battleRecord.form.team")}
                value={draft.teamId ?? ""}
                onChange={(e) => {
                  const newTeamId = e.target.value || null;
                  const newTeam = teams.find((tm) => tm.id === newTeamId);
                  const members = (newTeam?.members ?? []).filter(
                    (m): m is TrainedPokemon => m !== null,
                  );
                  setDraft((prev) => ({
                    ...prev,
                    teamId: newTeamId,
                    myTeam: members,
                    selection: emptySelection,
                  }));
                }}
              >
                {teams.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* 自チーム選出 */}
          <YourTeamSelector
            myTeam={draft.myTeam}
            selection={draft.selection}
            onChange={(selection) => setDraft((prev) => ({ ...prev, selection }))}
            format={format}
          />

          <Divider />

          {/* 相手チーム */}
          <OpponentSlots
            opponents={draft.opponents}
            onChange={(opponents) => setDraft((prev) => ({ ...prev, opponents }))}
            format={format}
          />

          <Divider />

          {/* シーズン / レート / 日時 */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel id="record-season-label">{t("battleRecord.form.season")}</InputLabel>
              <Select
                labelId="record-season-label"
                label={t("battleRecord.form.season")}
                value={seasonId ?? ""}
                onChange={(e) => setSelectedSeasonIdOverride(e.target.value || null)}
                disabled={editing !== null}
              >
                {seasons.map((season) => (
                  <MenuItem key={season.id} value={season.id}>
                    {season.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              fullWidth
              type="number"
              label={t("battleRecord.form.rating")}
              placeholder="1650"
              value={draft.rating}
              onChange={(e) => setDraft((prev) => ({ ...prev, rating: e.target.value }))}
              slotProps={{ htmlInput: { step: "any" } }}
            />
          </Stack>

          <TextField
            size="small"
            type="datetime-local"
            label={t("battleRecord.form.playedAt")}
            value={draft.playedAt}
            onChange={(e) => setDraft((prev) => ({ ...prev, playedAt: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ maxWidth: { sm: 260 } }}
          />

          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            label={t("battleRecord.form.notes")}
            placeholder={t("battleRecord.form.notesPlaceholder")}
            value={draft.notes}
            onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
          />

          <Autocomplete
            multiple
            freeSolo
            size="small"
            options={PREDEFINED_TAG_SLUGS}
            value={draft.tags as string[]}
            onChange={(_e, newValue) => {
              setDraft((prev) => ({ ...prev, tags: newValue as string[] }));
            }}
            groupBy={(option) => {
              const preset = PREDEFINED_TAGS.find((p) => p.slug === option);
              return preset ? t(`battleRecord.form.tagGroups.${preset.group}`) : "Custom";
            }}
            getOptionLabel={(option) => {
              const preset = PREDEFINED_TAGS.find((p) => p.slug === option);
              return preset ? t(`taxonomy.${preset.slug}`) : option;
            }}
            renderValue={(
              value: readonly string[],
              getItemProps: (options: { index: number }) => {
                key?: React.Key;
                [k: string]: unknown;
              },
            ) =>
              value.map((option, index) => {
                const preset = PREDEFINED_TAGS.find((p) => p.slug === option);
                const label = preset ? t(`taxonomy.${preset.slug}`) : option;

                const { key, ...tagProps } = getItemProps({ index });
                return (
                  <Chip key={key} variant="outlined" size="small" label={label} {...tagProps} />
                );
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={t("battleRecord.form.tags")}
                placeholder={t("battleRecord.form.tagsPlaceholder")}
              />
            )}
          />
        </Stack>
      </DialogContent>

      {submitError && (
        <Box sx={{ px: 3, pb: 1 }}>
          <Alert severity="error" onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        </Box>
      )}

      <Divider />
      <Stack direction="row" spacing={1} sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={isPending}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSave}
          sx={{ flexGrow: 1, fontWeight: 700 }}
        >
          {isPending ? (
            <>
              <CircularProgress size={18} color="inherit" sx={{ mr: 1 }} />
              {t("common.saving")}
            </>
          ) : resultChosen ? (
            t("common.save")
          ) : (
            t("battleRecord.form.selectResultFirst")
          )}
        </Button>
      </Stack>
    </>
  );
}
