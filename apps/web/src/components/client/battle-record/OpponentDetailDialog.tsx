"use client";

import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Sync from "@mui/icons-material/Sync";
import { useTranslation } from "react-i18next";
import { SelectPokemonDialog } from "@/components/client/team-builder/SelectPokemonDialog";
import type { OpponentDraft } from "./formState";
import {
  MovesAutocomplete,
  SlugAutocomplete,
  useItemOptions,
  usePokemonAbilityOptions,
  usePokemonMoveOptions,
} from "./slugAutocomplete";

interface OpponentDetailDialogProps {
  readonly open: boolean;
  readonly opponent: OpponentDraft | null;
  readonly onClose: () => void;
  readonly onSave: (opponent: OpponentDraft) => void;
}

/** 相手個体1体の詳細（持ち物・特性・技など）をあとから追記するダイアログ */
export function OpponentDetailDialog({
  open,
  opponent,
  onClose,
  onSave,
}: OpponentDetailDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {open && opponent && (
        <OpponentDetailContent
          key={opponent.pokemonSlug}
          opponent={opponent}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Dialog>
  );
}

function OpponentDetailContent({
  opponent,
  onClose,
  onSave,
}: Omit<OpponentDetailDialogProps, "open"> & {
  opponent: NonNullable<OpponentDetailDialogProps["opponent"]>;
}) {
  const { t, i18n } = useTranslation();
  const pokemonSlug = opponent.pokemonSlug;
  const itemOptions = useItemOptions();
  const abilityOptions = usePokemonAbilityOptions(pokemonSlug);
  const moveOptions = usePokemonMoveOptions(pokemonSlug);
  const [draft, setDraft] = useState<OpponentDraft>(opponent);
  const [changeSpeciesOpen, setChangeSpeciesOpen] = useState(false);

  const formName = `pokemon.${draft.pokemonSlug}.formName`;

  return (
    <>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Avatar src={`/pokemon/${draft.pokemonSlug}.png`} alt={draft.pokemonSlug} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
            {t(`pokemon.${draft.pokemonSlug}.name`)}
          </Typography>
          {i18n.exists(formName) && (
            <Typography
              component="span"
              sx={{ ml: 0.5, fontSize: "0.8em", color: "text.secondary" }}
            >
              {t(formName)}
            </Typography>
          )}
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Sync />}
          onClick={() => setChangeSpeciesOpen(true)}
        >
          {t("battleRecord.form.changePokemon")}
        </Button>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <SlugAutocomplete
              options={itemOptions}
              value={draft.itemSlug}
              onChange={(slug) => setDraft({ ...draft, itemSlug: slug })}
              label={t("battleRecord.form.item")}
            />
            <SlugAutocomplete
              options={abilityOptions}
              value={draft.abilitySlug}
              onChange={(slug) => setDraft({ ...draft, abilitySlug: slug })}
              label={t("battleRecord.form.ability")}
            />
          </Stack>

          <MovesAutocomplete
            options={moveOptions}
            value={draft.moves}
            onChange={(moves) => setDraft({ ...draft, moves })}
            label={t("battleRecord.form.moves")}
          />

          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            label={t("battleRecord.form.opponentNotes")}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={() => onSave(draft)}>
          {t("common.save")}
        </Button>
      </DialogActions>

      <SelectPokemonDialog
        title={t("battleRecord.form.changePokemon")}
        open={changeSpeciesOpen}
        onClose={() => setChangeSpeciesOpen(false)}
        translator={t}
        onChange={(identifier) => {
          if (identifier) {
            setDraft((prev) => ({
              ...prev,
              pokemonSlug: identifier,
              abilitySlug: null,
              moves: [],
            }));
          }
          setChangeSpeciesOpen(false);
        }}
      />
    </>
  );
}
