import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  createFilterOptions,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import AllInboxRoundedIcon from "@mui/icons-material/AllInboxRounded";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Image from "next/image";
import { championsPokemonList, championsPokemonByIdentifier } from "@/data/champions-pokemon";
import { moveByIdentifier } from "@/data/moves";
import {
  usePokemonMoveOptions,
  usePokemonAbilityOptions,
  useDamageCalcItemOptions,
  SlugAutocomplete,
} from "@/components/client/battle-record/slugAutocomplete";
import { calcHp, calcStatus } from "@/data/utility/training";
import {
  getMoveMechanics,
  resolveAbilityTypeChange,
  VARIABLE_POWER_MOVES,
  type StatKey,
} from "@/lib/damage";
import NumberField from "@/components/client/input/NumberField";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { flexRowCenter } from "@/theme/sx";
import type { SxProps, Theme } from "@mui/material/styles";
import type { PokemonPanelState } from "./useDamageCalcPage";
import { LoadFromBoxDialog } from "./LoadFromBoxDialog";
import { loadPokemonFromBox } from "./loadPokemonFromBox";

type PokemonOption = {
  readonly identifier: string;
  readonly label: string;
};

const pokemonFilterOptions = createFilterOptions<PokemonOption>({
  limit: 50,
  stringify: (option) => `${option.label} ${option.identifier}`,
});

type ScreenState = {
  readonly reflect: boolean;
  readonly lightScreen: boolean;
  readonly auroraVeil: boolean;
};

type PokemonPanelProps = {
  readonly label: string;
  readonly role: "attacker" | "defender";
  readonly value: PokemonPanelState;
  readonly onChange: (
    updater: PokemonPanelState | ((prev: PokemonPanelState) => PokemonPanelState),
  ) => void;
  /** The attacker's currently-selected move identifier — drives progressive disclosure. */
  readonly activeMove: string | null;
  /** Whether the battle is doubles (gates doubles-only conditions). */
  readonly isDoubles: boolean;
  /** Defender only: wall checkboxes */
  readonly screens?: ScreenState;
  readonly onScreensChange?: (updater: ScreenState | ((prev: ScreenState) => ScreenState)) => void;
  /** Optional sx overrides — used to tint the panel border/bg for attacker vs defender. */
  readonly sx?: SxProps<Theme>;
};

/** A general condition toggle in the Conditions section. */
type ConditionDef = {
  readonly key: string;
  readonly labelKey: string;
  /** Only shown in doubles battles. */
  readonly doublesOnly?: boolean;
};

const ATTACKER_CONDITIONS: readonly ConditionDef[] = [
  { key: "burn", labelKey: "damageCalc.burn" },
  { key: "helpingHand", labelKey: "damageCalc.helpingHand", doublesOnly: true },
  { key: "charge", labelKey: "damageCalc.charge" },
  { key: "steelySpirit", labelKey: "damageCalc.steelySpirit" },
  { key: "powerSpot", labelKey: "damageCalc.powerSpot", doublesOnly: true },
  { key: "battery", labelKey: "damageCalc.battery", doublesOnly: true },
  { key: "flowerGift", labelKey: "damageCalc.flowerGift" },
  { key: "electrify", labelKey: "damageCalc.electrify" },
  { key: "tailwind", labelKey: "damageCalc.tailwind" },
  { key: "paralysis", labelKey: "damageCalc.paralysis" },
  { key: "powerTrick", labelKey: "damageCalc.powerTrick" },
];

const DEFENDER_CONDITIONS: readonly ConditionDef[] = [
  { key: "protect", labelKey: "damageCalc.protect" },
  { key: "tarShot", labelKey: "damageCalc.tarShot" },
  { key: "flowerGift", labelKey: "damageCalc.flowerGift" },
  { key: "tailwind", labelKey: "damageCalc.tailwind" },
  { key: "paralysis", labelKey: "damageCalc.paralysis" },
  { key: "powerTrick", labelKey: "damageCalc.powerTrick" },
];

/** Stat metadata: EV field key, status[] index, i18n label key. */
const STAT_META: Record<
  StatKey,
  { evKey: keyof PokemonPanelState; index: number; labelKey: string }
> = {
  hp: { evKey: "evHp", index: 0, labelKey: "damageCalc.hp" },
  atk: { evKey: "evAtk", index: 1, labelKey: "damageCalc.attack" },
  def: { evKey: "evDef", index: 2, labelKey: "damageCalc.defense" },
  spa: { evKey: "evSpa", index: 3, labelKey: "damageCalc.spAttack" },
  spd: { evKey: "evSpd", index: 4, labelKey: "damageCalc.spDefense" },
  spe: { evKey: "evSpe", index: 5, labelKey: "damageCalc.speed" },
};

export function PokemonPanel({
  label,
  role,
  value,
  onChange,
  activeMove,
  isDoubles,
  screens,
  onScreensChange,
  sx,
}: PokemonPanelProps) {
  const { t, i18n } = useTranslation();

  const isAttacker = role === "attacker";
  const [isBoxDialogOpen, setIsBoxDialogOpen] = useState(false);

  // Pokemon options
  const pokemonOptions = useMemo((): readonly PokemonOption[] => {
    return championsPokemonList
      .map((p) => {
        const name = t(`pokemon.${p.identifier}.name`, p.identifier);
        const isFormNameExists = i18n.exists(`pokemon.${p.identifier}.formName`);
        const label = isFormNameExists
          ? `${name} (${t(`pokemon.${p.identifier}.formName`)})`
          : name;
        return { identifier: p.identifier, label };
      })
      .toSorted((a, b) => a.label.localeCompare(b.label));
  }, [t, i18n]);

  const selectedPokemon = useMemo(
    () => pokemonOptions.find((o) => o.identifier === value.identifier) ?? null,
    [pokemonOptions, value.identifier],
  );

  const pokemon = value.identifier ? championsPokemonByIdentifier.get(value.identifier) : undefined;

  // Move mechanics of the active (attacker's) move — drives disclosure for both panels.
  const activeMoveData = activeMove ? moveByIdentifier.get(activeMove) : undefined;
  const mechanics =
    activeMoveData && activeMoveData.category !== "status"
      ? getMoveMechanics(activeMoveData.identifier, activeMoveData.category)
      : null;

  const moveOptions = usePokemonMoveOptions(value.identifier ?? "");
  const abilityOptions = usePokemonAbilityOptions(value.identifier ?? "");
  const itemOptions = useDamageCalcItemOptions();

  // Attacker: only damaging moves (allow variable-power moves whose static power is 0/null).
  const filteredMoveOptions = useMemo(() => {
    if (!isAttacker) return moveOptions;
    return moveOptions.filter((m) => {
      const move = moveByIdentifier.get(m.slug);
      if (!move || move.category === "status") return false;
      if (VARIABLE_POWER_MOVES.has(move.identifier)) return true;
      return move.power !== null && move.power > 0;
    });
  }, [moveOptions, isAttacker]);

  // Which stats to reveal on this panel.
  const statsToShow: StatKey[] = useMemo(() => {
    if (isAttacker) {
      if (!mechanics) return ["atk", "spa"];
      const s: StatKey[] = [];
      // Foul Play uses the target's attack → attacker's own offensive stat is not used.
      if (!mechanics.useTargetAttack) s.push(mechanics.offensiveStat);
      for (const extra of mechanics.attackerExtraStats) if (!s.includes(extra)) s.push(extra);
      return s;
    }
    // Defender
    if (!mechanics) return ["hp", "def", "spd"];
    const s: StatKey[] = ["hp", mechanics.defensiveStat];
    for (const extra of mechanics.defenderExtraStats) if (!s.includes(extra)) s.push(extra);
    return s;
  }, [isAttacker, mechanics]);

  // The stat the panel's single Rank control applies to.
  const rankStat: StatKey | null = useMemo(() => {
    if (isAttacker) {
      if (!mechanics) return "atk";
      if (mechanics.useTargetAttack) return null; // foul play: attacker rank unused
      return mechanics.offensiveStat;
    }
    return mechanics ? mechanics.defensiveStat : "def";
  }, [isAttacker, mechanics]);

  const showAttackerHp = isAttacker && mechanics?.usesAttackerHp === true;
  const showHpPercent = !isAttacker || showAttackerHp;

  // Ability-driven move-type change indicator (attacker panel only).
  const abilityTypeChange = useMemo(() => {
    if (!isAttacker || !activeMoveData || activeMoveData.category === "status") return null;
    return resolveAbilityTypeChange(value.ability, activeMoveData.type);
  }, [isAttacker, activeMoveData, value.ability]);

  const conditionDefs = isAttacker ? ATTACKER_CONDITIONS : DEFENDER_CONDITIONS;
  const visibleConditions = conditionDefs.filter((c) => !c.doublesOnly || isDoubles);

  const setEv = (evKey: keyof PokemonPanelState, v: number) =>
    onChange((prev) => ({ ...prev, [evKey]: v }));

  const setCondition = (key: string, checked: boolean) =>
    onChange((prev) => ({ ...prev, conditions: { ...prev.conditions, [key]: checked } }));

  return (
    <SurfaceCard
      sx={[{ px: { xs: 2, md: 6 }, py: 3 }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    >
      <Stack spacing={2}>
        {/* Header */}
        <Stack
          direction="row"
          sx={{
            ...flexRowCenter,
            justifyContent: "space-between",
          }}
        >
          <Stack direction="row" spacing={1} sx={flexRowCenter}>
            {value.identifier && (
              <Image
                src={`/pokemon/${value.identifier}.png`}
                alt={value.identifier}
                width={40}
                height={40}
                style={{ imageRendering: "pixelated" }}
              />
            )}
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {label}
            </Typography>
          </Stack>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AllInboxRoundedIcon fontSize="small" />}
            onClick={() => setIsBoxDialogOpen(true)}
            sx={{
              borderRadius: 2,
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8125rem",
              py: 0.5,
              px: 1.25,
            }}
          >
            {t("damageCalc.loadFromBox")}
          </Button>
        </Stack>

        {/* Basics */}
        <Autocomplete
          options={pokemonOptions}
          value={selectedPokemon}
          onChange={(_, next) =>
            onChange((prev) => ({
              ...prev,
              identifier: next?.identifier ?? null,
              move: null,
              ability: null,
            }))
          }
          filterOptions={pokemonFilterOptions}
          getOptionLabel={(option) => option.label}
          isOptionEqualToValue={(option, val) => option.identifier === val.identifier}
          size="small"
          renderInput={(params) => (
            <TextField
              {...params}
              label={t("damageCalc.pokemon")}
              placeholder={t("damageCalc.selectPokemon")}
            />
          )}
        />

        {/* Move (attacker only) */}
        {isAttacker && (
          <Stack spacing={1}>
            <SlugAutocomplete
              options={filteredMoveOptions}
              value={value.move}
              onChange={(slug) => onChange((prev) => ({ ...prev, move: slug, moveConditions: {} }))}
              label={t("damageCalc.move")}
              placeholder={t("damageCalc.selectMove")}
            />
            {/* Conditional-power toggles for the selected move */}
            {mechanics && mechanics.conditions.length > 0 && (
              <Stack direction="row" sx={{ flexWrap: "wrap", ml: -0.5 }}>
                {mechanics.conditions.map((cond) => {
                  if (cond.type === "number") {
                    return (
                      <TextField
                        key={cond.key}
                        label={t(cond.labelKey)}
                        type="number"
                        size="small"
                        slotProps={{ htmlInput: { min: cond.min ?? 0, max: cond.max ?? 100 } }}
                        value={(value.moveConditions[cond.key] as number) ?? cond.defaultValue ?? 0}
                        onChange={(e) => {
                          const val = Math.max(
                            cond.min ?? 0,
                            Math.min(cond.max ?? 100, parseInt(e.target.value) || 0),
                          );
                          onChange((prev) => ({
                            ...prev,
                            moveConditions: { ...prev.moveConditions, [cond.key]: val },
                          }));
                        }}
                        sx={{ width: 140, ml: 1, mt: 1 }}
                      />
                    );
                  }
                  return (
                    <FormControlLabel
                      key={cond.key}
                      control={
                        <Checkbox
                          size="small"
                          checked={(value.moveConditions[cond.key] as boolean) ?? false}
                          onChange={(e) =>
                            onChange((prev) => ({
                              ...prev,
                              moveConditions: {
                                ...prev.moveConditions,
                                [cond.key]: e.target.checked,
                              },
                            }))
                          }
                        />
                      }
                      label={t(cond.labelKey)}
                    />
                  );
                })}
              </Stack>
            )}
          </Stack>
        )}

        <Stack spacing={0.5}>
          <SlugAutocomplete
            options={abilityOptions}
            value={value.ability}
            onChange={(slug) => onChange((prev) => ({ ...prev, ability: slug }))}
            label={t("damageCalc.ability")}
          />
          {abilityTypeChange && (
            <Typography variant="caption" color="text.secondary">
              {t("damageCalc.abilityTypeChanged", {
                type: t(`types.${abilityTypeChange.type}.name`, abilityTypeChange.type),
              })}
            </Typography>
          )}
        </Stack>

        <SlugAutocomplete
          options={itemOptions}
          value={value.item}
          onChange={(slug) => onChange((prev) => ({ ...prev, item: slug }))}
          label={t("damageCalc.item")}
        />
        {value.item === "metronome" && isAttacker && (
          <TextField
            label={t("damageCalc.condMetronomeTurns")}
            type="number"
            size="small"
            slotProps={{ htmlInput: { min: 0, max: 5 } }}
            value={(value.itemConditions?.metronome as number) ?? 0}
            onChange={(e) => {
              const val = Math.max(0, Math.min(5, parseInt(e.target.value) || 0));
              onChange((prev) => ({
                ...prev,
                itemConditions: { ...prev.itemConditions, metronome: val },
              }));
            }}
            sx={{ width: 160, mt: 1 }}
          />
        )}

        {/* Status */}
        <Divider textAlign="left">{t("damageCalc.status")}</Divider>

        {/* Foul Play notice on the attacker panel */}
        {isAttacker && mechanics?.useTargetAttack && (
          <Typography variant="caption" color="text.secondary">
            {t("damageCalc.usesTargetAttack")}
          </Typography>
        )}

        <Stack spacing={1}>
          {statsToShow.map((statKey) => {
            const meta = STAT_META[statKey];
            const ev = value[meta.evKey] as number;
            const actual = pokemon
              ? statKey === "hp"
                ? calcHp(pokemon.status[0], ev)
                : calcStatus(pokemon.status[meta.index], ev, value.natures?.[statKey] ?? 1.0)
              : undefined;
            const isExtraStat = isAttacker
              ? mechanics?.attackerExtraStats?.includes(statKey)
              : mechanics?.defenderExtraStats?.includes(statKey);
            const showRank = rankStat === statKey || isExtraStat;
            return (
              <Stack
                key={statKey}
                direction="row"
                sx={{ alignItems: "center", gap: { xs: 0.5, md: 1 }, flexWrap: "nowrap" }}
              >
                <EvField
                  statLabel={t(meta.labelKey)}
                  label={t("damageCalc.ev")}
                  value={ev}
                  statValue={actual}
                  onChange={(v) => setEv(meta.evKey, v)}
                  grow={true}
                  natureValue={statKey !== "hp" ? (value.natures?.[statKey] ?? 1.0) : undefined}
                  onNatureChange={
                    statKey !== "hp"
                      ? (n) =>
                          onChange((prev) => ({
                            ...prev,
                            natures: { ...prev.natures, [statKey]: n },
                          }))
                      : undefined
                  }
                  onStatChange={
                    pokemon
                      ? (targetStat) => {
                          const base = pokemon.status[meta.index];
                          const currentNature =
                            statKey !== "hp" ? (value.natures?.[statKey] ?? 1.0) : 1.0;

                          if (statKey === "hp") {
                            const validEvs = Array.from({ length: 33 }, (_, i) => i).filter(
                              (testEv) => calcHp(base, testEv) === targetStat,
                            );
                            if (validEvs.length > 0) {
                              setEv(meta.evKey, validEvs[0]);
                              return true;
                            }
                            return false;
                          } else {
                            // First, try with the current nature
                            const validWithCurrent = Array.from({ length: 33 }, (_, i) => i).filter(
                              (testEv) => calcStatus(base, testEv, currentNature) === targetStat,
                            );
                            if (validWithCurrent.length > 0) {
                              setEv(meta.evKey, validWithCurrent[0]);
                              return true;
                            }

                            // If not found, try other natures
                            const allNatures = [1.1, 1.0, 0.9];
                            for (const n of allNatures) {
                              if (n === currentNature) continue;
                              const validWithN = Array.from({ length: 33 }, (_, i) => i).filter(
                                (testEv) => calcStatus(base, testEv, n) === targetStat,
                              );
                              if (validWithN.length > 0) {
                                onChange((prev) => ({
                                  ...prev,
                                  [meta.evKey]: validWithN[0],
                                  natures: { ...prev.natures, [statKey]: n },
                                }));
                                return true;
                              }
                            }
                            return false;
                          }
                        }
                      : undefined
                  }
                />
                {showHpPercent && statKey === "hp" && (
                  <NumberField
                    value={value.hpPercent}
                    label={t("damageCalc.hpPercent")}
                    min={1}
                    max={100}
                    step={1}
                    size="small"
                    width={{ xs: 72, md: 140 }}
                    onValueChange={(v) =>
                      onChange((prev) => ({ ...prev, hpPercent: v == null ? 100 : v }))
                    }
                  />
                )}
                {showRank && (
                  <NumberField
                    value={value.boosts?.[statKey] ?? 0}
                    label={t("damageCalc.rank")}
                    min={-6}
                    max={6}
                    step={1}
                    size="small"
                    width={{ xs: 72, md: 96 }}
                    format={{ signDisplay: "exceptZero" }}
                    onValueChange={(v) =>
                      onChange((prev) => ({
                        ...prev,
                        boosts: { ...prev.boosts, [statKey]: v || 0 },
                      }))
                    }
                  />
                )}
              </Stack>
            );
          })}
        </Stack>

        {/* Conditions */}
        <Divider textAlign="left">{t("damageCalc.conditions")}</Divider>

        <Stack direction="row" sx={{ flexWrap: "wrap", ml: -0.5 }}>
          {/* Defender: screens */}
          {!isAttacker && screens && onScreensChange && (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={screens.reflect}
                    onChange={(e) => onScreensChange((s) => ({ ...s, reflect: e.target.checked }))}
                  />
                }
                label={t("damageCalc.reflect")}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={screens.lightScreen}
                    onChange={(e) =>
                      onScreensChange((s) => ({ ...s, lightScreen: e.target.checked }))
                    }
                  />
                }
                label={t("damageCalc.lightScreen")}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={screens.auroraVeil}
                    onChange={(e) =>
                      onScreensChange((s) => ({ ...s, auroraVeil: e.target.checked }))
                    }
                  />
                }
                label={t("damageCalc.auroraVeil")}
              />
            </>
          )}

          {/* Role-specific general conditions */}
          {visibleConditions.map((cond) => (
            <FormControlLabel
              key={cond.key}
              control={
                <Checkbox
                  size="small"
                  checked={value.conditions[cond.key] ?? false}
                  onChange={(e) => setCondition(cond.key, e.target.checked)}
                />
              }
              label={t(cond.labelKey)}
            />
          ))}
        </Stack>
      </Stack>

      <LoadFromBoxDialog
        open={isBoxDialogOpen}
        onClose={() => setIsBoxDialogOpen(false)}
        onSelect={(pokemon) => onChange(loadPokemonFromBox(pokemon, role))}
        role={role}
      />
    </SurfaceCard>
  );
}

function EvField({
  label,
  value,
  statValue,
  statLabel,
  onChange,
  grow,
  natureValue,
  onNatureChange,
  onStatChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly statValue?: number;
  readonly statLabel?: string;
  readonly onChange: (value: number) => void;
  readonly grow?: boolean;
  readonly natureValue?: number;
  readonly onNatureChange?: (value: number) => void;
  readonly onStatChange?: (targetStat: number) => boolean;
}) {
  const { t } = useTranslation();
  const formattedValue = useMemo(() => {
    if (natureValue === 1.1) return `${value}+`;
    if (natureValue === 0.9) return `${value}-`;
    return value.toString();
  }, [value, natureValue]);

  const [userLocalValue, setUserLocalValue] = useState<string | null>(null);
  const [userLocalStat, setUserLocalStat] = useState<string | null>(null);
  const [statError, setStatError] = useState(false);

  const [prevStatValue, setPrevStatValue] = useState(statValue);
  if (prevStatValue !== statValue) {
    setPrevStatValue(statValue);
    setUserLocalStat(null);
    setStatError(false);
  }
  const localStat = userLocalStat ?? statValue?.toString() ?? "0";
  const setLocalStat = setUserLocalStat;

  const [prevFormattedValue, setPrevFormattedValue] = useState(formattedValue);
  if (prevFormattedValue !== formattedValue) {
    setPrevFormattedValue(formattedValue);
    setUserLocalValue(null);
  }

  // A cleaner approach for syncing localValue:
  const [prevValueState, setPrevValueState] = useState({ value, natureValue });
  if (prevValueState.value !== value || prevValueState.natureValue !== natureValue) {
    setPrevValueState({ value, natureValue });
    setUserLocalValue(null);
  }
  const localValue = userLocalValue ?? formattedValue;
  const setLocalValue = setUserLocalValue;

  // EV の増減（+1 / -1）、nature suffix を保持

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: { xs: 0.5, md: 1 },
        flexGrow: grow ? 1 : 0,
        flexWrap: "nowrap",
      }}
    >
      {/* ── 1. Actual Stat (Moved to leftmost) ── */}
      <TextField
        label={statLabel ?? t("damageCalc.actualStat")}
        value={localStat}
        size="small"
        error={statError}
        onBlur={() => {
          setLocalStat(statValue?.toString() ?? "0");
          setStatError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        onChange={(e) => {
          const val = e.target.value;
          setLocalStat(val);
          if (val === "") {
            setStatError(false);
            return;
          }
          const num = parseInt(val, 10);
          if (!isNaN(num) && onStatChange) {
            const success = onStatChange(num);
            setStatError(!success);
          }
        }}
        sx={{
          width: { xs: 52, md: 72 }, // Slightly wider on xs to fit label better
          "& .MuiInputBase-input": {
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            textAlign: "center",
            px: { xs: 0.5, md: 1.5 },
          },
        }}
      />

      {/* ── 2. EV Field + Spinner (Unified for Mobile & Desktop) ── */}
      <TextField
        label={label}
        type="text"
        size="small"
        value={localValue}
        onChange={(e) => {
          const val = e.target.value;
          setLocalValue(val);

          let parsedVal = parseInt(val, 10);
          if (isNaN(parsedVal)) {
            if (val === "" || val === "+" || val === "-") {
              onChange(0);
              if (onNatureChange) {
                if (val === "+") onNatureChange(1.1);
                else if (val === "-") onNatureChange(0.9);
                else onNatureChange(1.0);
              }
            }
            return;
          }

          if (parsedVal >= 0 && parsedVal <= 32) {
            onChange(parsedVal);
          }

          if (onNatureChange) {
            if (val.includes("+")) {
              onNatureChange(1.1);
            } else if (val.includes("-")) {
              onNatureChange(0.9);
            } else {
              onNatureChange(1.0);
            }
          }
        }}
        onBlur={() => setLocalValue(formattedValue)}
        slotProps={{
          htmlInput: { inputMode: "decimal" },
          input: {
            endAdornment: (
              <Stack
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  mr: -1,
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => onChange(Math.min(32, value + 1))}
                  sx={{ p: 0, height: 12 }}
                  disableRipple
                  tabIndex={-1}
                >
                  <ArrowDropUpIcon sx={{ fontSize: 20 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onChange(Math.max(0, value - 1))}
                  sx={{ p: 0, height: 12 }}
                  disableRipple
                  tabIndex={-1}
                >
                  <ArrowDropDownIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Stack>
            ),
          },
        }}
        sx={{
          width: { xs: 68, md: 72 },
          "& .MuiInputBase-input": {
            textAlign: "center",
            px: { xs: 0.5, md: 1.5 },
          },
        }}
      />

      {/* Nature toggle — desktop: standalone buttons / mobile: compact inline */}
      {onNatureChange && (
        <ToggleButtonGroup
          size="small"
          value={natureValue ?? 1.0}
          exclusive
          onChange={(_, newNature) => {
            if (onNatureChange) onNatureChange(newNature || 1.0);
          }}
          sx={{ height: 38 }}
        >
          <ToggleButton
            value={1.1}
            sx={{
              px: { xs: 0.5, md: 1 },
              py: 0,
              minWidth: { xs: 26, md: "auto" },
              color: natureValue === 1.1 ? "error.main" : "inherit",
              "&.Mui-selected": {
                backgroundColor: "error.main",
                color: "error.contrastText",
                "&:hover": { backgroundColor: "error.dark" },
              },
            }}
          >
            <AddIcon sx={{ fontSize: { xs: 16, md: 20 } }} />
          </ToggleButton>
          <ToggleButton
            value={0.9}
            sx={{
              px: { xs: 0.5, md: 1 },
              py: 0,
              minWidth: { xs: 26, md: "auto" },
              color: natureValue === 0.9 ? "info.main" : "inherit",
              "&.Mui-selected": {
                backgroundColor: "info.main",
                color: "info.contrastText",
                "&:hover": { backgroundColor: "info.dark" },
              },
            }}
          >
            <RemoveIcon sx={{ fontSize: { xs: 16, md: 20 } }} />
          </ToggleButton>
        </ToggleButtonGroup>
      )}
    </Box>
  );
}
