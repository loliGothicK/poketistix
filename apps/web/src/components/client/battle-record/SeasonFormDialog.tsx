"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { BattleFormat, Season, SeasonInput } from "@/store/battle-record/battleRecord";

interface SeasonFormDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly editing: Season | null;
  readonly onSubmit: (input: SeasonInput) => Promise<void>;
  readonly submitting: boolean;
}

interface SeasonFormState {
  readonly name: string;
  readonly format: BattleFormat;
  readonly ruleMark: string;
  readonly startedAt: string;
  readonly endedAt: string;
}

const emptyState: SeasonFormState = {
  name: "",
  format: "doubles",
  ruleMark: "",
  startedAt: "",
  endedAt: "",
};

export function SeasonFormDialog({
  open,
  onClose,
  editing,
  onSubmit,
  submitting,
}: SeasonFormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      {open && (
        <SeasonFormContent
          key={editing?.id ?? "new"}
          onClose={onClose}
          editing={editing}
          onSubmit={onSubmit}
          submitting={submitting}
        />
      )}
    </Dialog>
  );
}

function SeasonFormContent({
  onClose,
  editing,
  onSubmit,
  submitting,
}: Omit<SeasonFormDialogProps, "open">) {
  const { t } = useTranslation();
  const [state, setState] = useState<SeasonFormState>(
    editing
      ? {
          name: editing.name,
          format: editing.format,
          ruleMark: editing.ruleMark ?? "",
          startedAt: editing.startedAt ?? "",
          endedAt: editing.endedAt ?? "",
        }
      : emptyState,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const normalizeDate = (val: string): string => {
    const trimmed = val.trim();
    if (!trimmed) return "";
    const match = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(trimmed);
    if (match) {
      const [, y, m, d] = match;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return trimmed;
  };

  const normalizedStartedAt = normalizeDate(state.startedAt);
  const normalizedEndedAt = normalizeDate(state.endedAt);
  const isDateOrderInvalid =
    normalizedStartedAt !== "" &&
    normalizedEndedAt !== "" &&
    normalizedEndedAt < normalizedStartedAt;

  const handleSubmit = async () => {
    if (state.name.trim().length === 0 || isDateOrderInvalid || submitting) return;
    setSubmitError(null);
    try {
      await onSubmit({
        name: state.name.trim(),
        format: state.format,
        ruleMark: state.ruleMark.trim() || null,
        startedAt: normalizedStartedAt || null,
        endedAt: normalizedEndedAt || null,
      });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <DialogTitle>
        {editing ? t("battleRecord.season.editTitle") : t("battleRecord.season.newTitle")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {submitError && (
            <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
              {submitError}
            </Typography>
          )}
          <TextField
            autoFocus
            size="small"
            fullWidth
            required
            label={t("battleRecord.season.name")}
            value={state.name}
            onChange={(e) => {
              setSubmitError(null);
              setState((prev) => ({ ...prev, name: e.target.value }));
            }}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <div>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {t("battleRecord.season.format")}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={state.format}
              onChange={(_, value: BattleFormat | null) =>
                value && setState((prev) => ({ ...prev, format: value }))
              }
            >
              <ToggleButton value="singles">{t("battleRecord.format.singles")}</ToggleButton>
              <ToggleButton value="doubles">{t("battleRecord.format.doubles")}</ToggleButton>
            </ToggleButtonGroup>
          </div>
          <TextField
            size="small"
            fullWidth
            label={t("battleRecord.season.ruleMark")}
            placeholder="regulation-h"
            value={state.ruleMark}
            onChange={(e) => setState((prev) => ({ ...prev, ruleMark: e.target.value }))}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              size="small"
              fullWidth
              type="date"
              label={t("battleRecord.season.startedAt")}
              value={state.startedAt}
              onChange={(e) => {
                setSubmitError(null);
                setState((prev) => ({ ...prev, startedAt: e.target.value }));
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              size="small"
              fullWidth
              type="date"
              label={t("battleRecord.season.endedAt")}
              value={state.endedAt}
              error={isDateOrderInvalid}
              helperText={
                isDateOrderInvalid ? t("battleRecord.season.dateRangeInvalid") : undefined
              }
              onChange={(e) => {
                setSubmitError(null);
                setState((prev) => ({ ...prev, endedAt: e.target.value }));
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || state.name.trim().length === 0 || isDateOrderInvalid}
        >
          {t("common.save")}
        </Button>
      </DialogActions>
    </>
  );
}
