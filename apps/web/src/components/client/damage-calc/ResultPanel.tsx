"use client";

import {
  Box,
  Chip,
  LinearProgress,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useState } from "react";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { flexRowCenter } from "@/theme/sx";
import type { DamageCalcResult } from "./useDamageCalcPage";

type EvSet = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };

type CalcSummary = {
  readonly attackerName: string | null;
  readonly defenderName: string | null;
  readonly moveName: string | null;
  readonly attackerEvs: EvSet;
  readonly defenderEvs: EvSet;
  readonly weather: string | null;
  readonly terrain: string | null;
  readonly fairyAura: boolean;
  readonly wonderRoom: boolean;
  readonly isDoubles: boolean;
  readonly isCrit: boolean;
  readonly screens: { reflect: boolean; lightScreen: boolean; auroraVeil: boolean };
  readonly attackerItem: string | null;
  readonly attackerConditions: Readonly<Record<string, boolean>>;
  readonly defenderConditions: Readonly<Record<string, boolean>>;
};

type ResultPanelProps = {
  readonly result: DamageCalcResult;
  readonly isCrit: boolean;
  readonly critDisabled?: boolean;
  readonly onCritChange: (v: boolean) => void;
  readonly summary?: CalcSummary;
};

export function ResultPanel({
  result,
  isCrit,
  critDisabled,
  onCritChange,
  summary,
}: ResultPanelProps) {
  const { t } = useTranslation();
  const { output, analysis, isLoading, isError, missingReason } = result;

  // All hooks before any early return
  const { hitCount, hitCountAlreadyMerged } = result;
  const isMultiHit = hitCount !== undefined && hitCount.max > 1;
  const hitMin = hitCount?.min ?? 1;
  const hitMax = hitCount?.max ?? 1;
  const [userSelectedHits, setUserSelectedHits] = useState<number | null>(null);
  const [prevHitMax, setPrevHitMax] = useState(hitMax);

  if (prevHitMax !== hitMax) {
    setPrevHitMax(hitMax);
    setUserSelectedHits(null);
  }

  const selectedHits = userSelectedHits ?? hitMax;
  const setSelectedHits = setUserSelectedHits;

  const critToggle = (
    <CritToggle
      isCrit={isCrit}
      disabled={critDisabled}
      onChange={onCritChange}
      label={t("damageCalc.isCrit")}
    />
  );

  if (isLoading) {
    return (
      <SurfaceCard sx={{ p: 2 }}>
        <LinearProgress />
      </SurfaceCard>
    );
  }

  if (isError) {
    return (
      <SurfaceCard sx={{ p: 2 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", ...flexRowCenter }}>
          <Typography color="error" variant="body2">
            {t("damageCalc.calcError")}
          </Typography>
          {critToggle}
        </Stack>
      </SurfaceCard>
    );
  }

  if (!output) {
    const hint =
      missingReason === "attacker"
        ? t("damageCalc.hintSelectAttacker")
        : missingReason === "move"
          ? t("damageCalc.hintSelectMove")
          : missingReason === "defender"
            ? t("damageCalc.hintSelectDefender")
            : t("damageCalc.noResult");

    return (
      <SurfaceCard sx={{ p: 2 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", ...flexRowCenter }}>
          <Typography color="text.secondary" variant="body2">
            {hint}
          </Typography>
          {critToggle}
        </Stack>
      </SurfaceCard>
    );
  }

  const hasAnalysis = analysis !== undefined;

  const effectiveHits = hitCountAlreadyMerged ? hitMax : selectedHits;
  const defHp =
    hasAnalysis && analysis.minPercent > 0
      ? Math.round((output.min / analysis.minPercent) * 100)
      : undefined;

  const totalMin = hitCountAlreadyMerged ? output.min : output.min * effectiveHits;
  const totalMax = hitCountAlreadyMerged ? output.max : output.max * effectiveHits;
  const totalMinPercent = defHp ? parseFloat(((totalMin / defHp) * 100).toFixed(1)) : undefined;
  const totalMaxPercent = defHp ? parseFloat(((totalMax / defHp) * 100).toFixed(1)) : undefined;

  const koLabel = hasAnalysis
    ? (() => {
        const safeHp = defHp ?? 1;
        const minKO = totalMax > 0 ? Math.ceil(safeHp / totalMax) : Infinity;
        const maxKO = totalMin > 0 ? Math.ceil(safeHp / totalMin) : Infinity;
        const ohkoRolls = output.rolls.filter((r) => {
          const total = hitCountAlreadyMerged ? r : r * effectiveHits;
          return total >= safeHp;
        }).length;
        return getKOLabel(minKO, maxKO, ohkoRolls / output.rolls.length, t);
      })()
    : null;

  const koColor = (() => {
    if (!hasAnalysis || !koLabel) return "default" as const;
    const safeHp = defHp ?? 1;
    const minKO = totalMax > 0 ? Math.ceil(safeHp / totalMax) : Infinity;
    return minKO === 1
      ? ("error" as const)
      : minKO === 2
        ? ("warning" as const)
        : ("default" as const);
  })();

  const barMin =
    isMultiHit && totalMinPercent !== undefined
      ? totalMinPercent
      : hasAnalysis
        ? analysis.minPercent
        : 0;
  const barMax =
    isMultiHit && totalMaxPercent !== undefined
      ? totalMaxPercent
      : hasAnalysis
        ? analysis.maxPercent
        : 0;

  return (
    <SurfaceCard sx={{ px: 6, py: 3 }}>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", ...flexRowCenter, mb: summary ? 1 : 1.5 }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t("damageCalc.result")}
        </Typography>
        {critToggle}
      </Stack>

      {/* Calc settings summary */}
      {summary && <CalcSummaryRow summary={summary} />}

      <Stack spacing={2} sx={{ mt: 1.5 }}>
        {/* Per-hit damage */}
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "baseline", flexWrap: "wrap", gap: 1 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("damageCalc.damageRange", { min: output.min, max: output.max })}
          </Typography>
          {hasAnalysis && !isMultiHit && (
            <Typography variant="body2" color="text.secondary">
              {t("damageCalc.percentRange", {
                minPercent: analysis.minPercent,
                maxPercent: analysis.maxPercent,
              })}
            </Typography>
          )}
          {isMultiHit && (
            <Typography variant="body2" color="text.secondary">
              {t("damageCalc.perHit")}
            </Typography>
          )}
        </Stack>

        {/* Hit count selector */}
        {isMultiHit && !hitCountAlreadyMerged && (
          <Stack direction="row" spacing={2} sx={{ ...flexRowCenter, flexWrap: "wrap", gap: 1 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: "text.secondary", minWidth: 40 }}
            >
              {t("damageCalc.hitCount")}
            </Typography>
            <ToggleButtonGroup
              value={selectedHits}
              exclusive
              size="small"
              onChange={(_, v) => {
                if (v !== null) setSelectedHits(v as number);
              }}
              sx={{ flexWrap: "wrap", gap: 0.5 }}
            >
              {Array.from({ length: hitMax - hitMin + 1 }, (_, i) => hitMin + i).map((n) => (
                <ToggleButton
                  key={n}
                  value={n}
                  sx={{ px: 1.2, py: 0.3, fontSize: 12, minWidth: 32 }}
                >
                  {n}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>
        )}

        {/* Total damage */}
        {isMultiHit && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "baseline", flexWrap: "wrap", gap: 1 }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {hitCountAlreadyMerged
                ? t("damageCalc.totalDamageMerged", { min: totalMin, max: totalMax, hits: hitMin })
                : t("damageCalc.totalDamageFixed", {
                    min: totalMin,
                    max: totalMax,
                    hits: effectiveHits,
                  })}
            </Typography>
            {hasAnalysis && totalMinPercent !== undefined && totalMaxPercent !== undefined && (
              <Typography variant="body2" color="text.secondary">
                {t("damageCalc.percentRange", {
                  minPercent: totalMinPercent,
                  maxPercent: totalMaxPercent,
                })}
              </Typography>
            )}
          </Stack>
        )}

        {/* KO chip */}
        {hasAnalysis && koLabel && (
          <Box>
            <Chip label={koLabel} color={koColor} size="small" sx={{ fontWeight: 600 }} />
          </Box>
        )}

        {/* HP bar */}
        {hasAnalysis && <HpBar minPercent={barMin} maxPercent={barMax} />}

        {/* Rolls */}
        <Box sx={{ display: { xs: "none", md: "block" } }}>
          <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: "block" }}>
            {isMultiHit ? t("damageCalc.rollsPerHit") : t("damageCalc.rolls")}
          </Typography>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
            {output.rolls.map((roll, i) => (
              <Chip
                key={i}
                label={roll}
                size="small"
                variant={i === 0 || i === output.rolls.length - 1 ? "filled" : "outlined"}
                color={
                  hasAnalysis && i === output.rolls.length - 1 && barMax >= 100
                    ? "error"
                    : "default"
                }
                sx={{ fontSize: 11, height: 22 }}
              />
            ))}
          </Stack>
        </Box>
      </Stack>
    </SurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// Calc settings summary
// ---------------------------------------------------------------------------

// Reuse existing damageCalc.* stat labels (Atk / Def / SpA / SpD / Spe / HP).
const EV_KEY_TO_LABEL_KEY: Record<keyof EvSet, string> = {
  hp: "damageCalc.hp",
  atk: "damageCalc.attack",
  def: "damageCalc.defense",
  spa: "damageCalc.spAttack",
  spd: "damageCalc.spDefense",
  spe: "damageCalc.speed",
};
const EV_ORDER: readonly (keyof EvSet)[] = ["hp", "atk", "def", "spa", "spd", "spe"];

/** Compact "HP252 / Atk4 / ..." string — only non-zero EVs shown. */
function formatEvs(evs: EvSet, t: (key: string) => string): string | null {
  const parts = EV_ORDER.filter((k) => evs[k] > 0).map(
    (k) => `${t(EV_KEY_TO_LABEL_KEY[k])}${evs[k]}`,
  );
  return parts.length > 0 ? parts.join(" / ") : null;
}

function CalcSummaryRow({ summary }: { readonly summary: CalcSummary }) {
  const { t } = useTranslation();

  // --- Primary: Pokémon / move / EVs (highest priority, shown prominently) ---
  const attackerLabel = summary.attackerName
    ? t(`pokemon.${summary.attackerName}.name`, summary.attackerName)
    : null;
  const defenderLabel = summary.defenderName
    ? t(`pokemon.${summary.defenderName}.name`, summary.defenderName)
    : null;
  const moveLabel = summary.moveName ? t(`moves.${summary.moveName}.name`, summary.moveName) : null;
  const attackerEvsLabel = formatEvs(summary.attackerEvs, t);
  const defenderEvsLabel = formatEvs(summary.defenderEvs, t);

  const hasPrimary = attackerLabel || defenderLabel || moveLabel;

  // --- Secondary: everything else (item, field, conditions) as small tags ---
  const tags: string[] = [];
  if (summary.attackerItem && summary.attackerItem !== "none") {
    tags.push(t(`items.${summary.attackerItem}.name`, summary.attackerItem));
  }
  if (summary.weather)
    tags.push(
      t(`damageCalc.weather${summary.weather.charAt(0).toUpperCase()}${summary.weather.slice(1)}`),
    );
  if (summary.terrain) {
    const key = summary.terrain.charAt(0).toUpperCase() + summary.terrain.slice(1);
    tags.push(t(`damageCalc.terrain${key}`));
  }
  if (summary.fairyAura) tags.push(t("damageCalc.fairyAura"));
  if (summary.wonderRoom) tags.push(t("damageCalc.wonderRoom"));
  if (summary.isDoubles) tags.push(t("damageCalc.doubles"));
  if (summary.isCrit) tags.push(t("damageCalc.isCrit"));
  if (summary.screens.reflect) tags.push(t("damageCalc.reflect"));
  if (summary.screens.lightScreen) tags.push(t("damageCalc.lightScreen"));
  if (summary.screens.auroraVeil) tags.push(t("damageCalc.auroraVeil"));

  const condLabels: Record<string, string> = {
    burn: "damageCalc.burn",
    helpingHand: "damageCalc.helpingHand",
    charge: "damageCalc.charge",
    tailwind: "damageCalc.tailwind",
    paralysis: "damageCalc.paralysis",
    powerTrick: "damageCalc.powerTrick",
    protect: "damageCalc.protect",
    tarShot: "damageCalc.tarShot",
  };
  for (const [key, labelKey] of Object.entries(condLabels)) {
    if (summary.attackerConditions[key] || summary.defenderConditions[key]) {
      tags.push(t(labelKey));
    }
  }

  if (!hasPrimary && tags.length === 0) return null;

  return (
    <Stack spacing={0.75} sx={{ mb: 1 }}>
      {/* Primary: Pokémon / move / EVs — emphasized */}
      {hasPrimary && (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ flexWrap: "wrap", alignItems: "baseline", gap: 0.5 }}
        >
          {attackerLabel && (
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {attackerLabel}
              {attackerEvsLabel && (
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ fontWeight: 500, color: "text.secondary", ml: 0.5 }}
                >
                  ({attackerEvsLabel})
                </Typography>
              )}
            </Typography>
          )}
          {moveLabel && (
            <Typography variant="body2" sx={{ fontWeight: 700, color: "primary.main" }}>
              {moveLabel}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            →
          </Typography>
          {defenderLabel && (
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {defenderLabel}
              {defenderEvsLabel && (
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ fontWeight: 500, color: "text.secondary", ml: 0.5 }}
                >
                  ({defenderEvsLabel})
                </Typography>
              )}
            </Typography>
          )}
        </Stack>
      )}

      {/* Secondary: field / item / conditions — de-emphasized tags */}
      {tags.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, opacity: 0.65 }}>
          {tags.map((tag, i) => (
            <Typography
              key={i}
              variant="caption"
              sx={{
                bgcolor: "action.selected",
                fontSize: 10,
                lineHeight: 1.5,
                whiteSpace: "nowrap",
                borderRadius: 1,
                py: 1,
                px: 2,
              }}
            >
              {tag}
            </Typography>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// HP bar
// ---------------------------------------------------------------------------
// At CSS position x%, remaining HP = (100 - x)%.
//
// Sections (example: minDmg=63%, maxDmg=76%):
//
//   x=0        x=24%       x=37%                     x=100%
//   |← color →|← stripe →|←────────── gray ─────────|
//              ↑           ↑
//           (100-76)     (100-63)
//
// Remaining HP  : x = 0           .. (100-maxDmg)  — color by remaining %
// Random range  : x = (100-maxDmg).. (100-minDmg)  — diagonal stripe, no color
// Confirmed dmg : x = (100-minDmg).. 100            — gray
// ---------------------------------------------------------------------------

function hpColor(remainingPct: number, isDark: boolean): string {
  if (remainingPct > 50) return isDark ? "#4caf50" : "#388e3c";
  if (remainingPct > 20) return isDark ? "#ffc107" : "#f9a825";
  return isDark ? "#f44336" : "#c62828";
}

export function HpBar({
  minPercent,
  maxPercent,
}: {
  readonly minPercent: number;
  readonly maxPercent: number;
}) {
  const { mode } = useColorScheme();
  const isDark = mode === "dark";
  const { t } = useTranslation();

  const minDmg = Math.min(100, Math.max(0, minPercent));
  const maxDmg = Math.min(100, Math.max(0, maxPercent));

  // CSS left % positions
  const remainingEnd = 100 - maxDmg; // right edge of remaining HP section
  const stripeEnd = 100 - minDmg; // right edge of random range (stripe) section

  const remainingWidth = remainingEnd;
  const stripeWidth = stripeEnd - remainingEnd; // = maxDmg - minDmg
  const grayWidth = 100 - stripeEnd; // = minDmg

  const remainingColor = hpColor(remainingWidth, isDark);
  const gray = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)";
  const barBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const stripe = isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.25)";

  return (
    <Box>
      <Tooltip title={`${minPercent.toFixed(1)}%〜${maxPercent.toFixed(1)}%`} placement="top" arrow>
        <Box
          sx={{
            position: "relative",
            height: 20,
            bgcolor: barBg,
            overflow: "hidden",
            cursor: "default",
            borderRadius: 2,
          }}
        >
          {/* Random range — colour tint (split at HP thresholds) + diagonal stripe */}
          {stripeWidth > 0 &&
            (() => {
              const thresholds = [50, 80].filter((d) => d > minDmg && d < maxDmg);
              const splits = [minDmg, ...thresholds, maxDmg];
              return splits.slice(0, -1).map((dStart, i) => {
                const dEnd = splits[i + 1];
                const x = 100 - dEnd;
                const w = dEnd - dStart;
                const midHp = 100 - (dStart + dEnd) / 2;
                return (
                  <Box key={i}>
                    <Box
                      sx={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${x}%`,
                        width: `${w}%`,
                        bgcolor: hpColor(midHp, isDark),
                        opacity: 0.35,
                      }}
                    />
                    <Box
                      sx={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${x}%`,
                        width: `${w}%`,
                        background: `repeating-linear-gradient(-45deg, ${stripe}, ${stripe} 3px, transparent 3px, transparent 7px)`,
                      }}
                    />
                  </Box>
                );
              });
            })()}

          {/* Confirmed damage — gray */}
          {grayWidth > 0 && (
            <Box
              sx={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${stripeEnd}%`,
                width: `${grayWidth}%`,
                bgcolor: gray,
              }}
            />
          )}

          {/* Remaining HP — color by remaining % — rendered last so it sits on top */}
          {remainingWidth > 0 && (
            <Box
              sx={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: `${remainingWidth}%`,
                bgcolor: remainingColor,
              }}
            />
          )}

          {/* Max damage marker */}
          {remainingEnd > 0 && remainingEnd < 100 && (
            <Box
              sx={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${remainingEnd}%`,
                width: 2,
                bgcolor: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)",
                transform: "translateX(-1px)",
              }}
            />
          )}

          {/* Min damage marker */}
          {stripeEnd > 0 && stripeEnd < 100 && stripeWidth > 0 && (
            <Box
              sx={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${stripeEnd}%`,
                width: 2,
                bgcolor: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.38)",
                transform: "translateX(-1px)",
              }}
            />
          )}
        </Box>
      </Tooltip>

      <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.5, px: 0.25 }}>
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 10 }}>
          {maxDmg >= 100
            ? t("damageCalc.hpKO")
            : `${t("damageCalc.hpRemaining")}: ${(100 - maxDmg).toFixed(1)}%〜${(100 - minDmg).toFixed(1)}%`}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 10 }}>
          {`${t("damageCalc.hpDamage")}: ${minDmg.toFixed(1)}%〜${maxDmg.toFixed(1)}%`}
        </Typography>
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------

function CritToggle({
  isCrit,
  disabled,
  onChange,
  label,
}: {
  readonly isCrit: boolean;
  readonly disabled?: boolean;
  readonly onChange: (v: boolean) => void;
  readonly label: string;
}) {
  return (
    <ToggleButton
      value="crit"
      selected={isCrit}
      disabled={disabled}
      onChange={() => onChange(!isCrit)}
      size="small"
      color="warning"
      sx={{ px: 1.5, py: 0.25, fontSize: 12, lineHeight: 1.4, textTransform: "none" }}
    >
      {label}
    </ToggleButton>
  );
}

function getKOLabel(minHits: number, maxHits: number, ohkoChance: number, t: TFunction): string {
  if (minHits === Infinity) return t("damageCalc.immune");
  if (minHits === 1 && ohkoChance === 1) return t("damageCalc.ohko");
  if (minHits === 1 && ohkoChance > 0)
    return t("damageCalc.ohkoChance", { chance: Math.round(ohkoChance * 100) });
  if (minHits === maxHits) return t("damageCalc.guaranteedKO", { n: minHits });
  return t("damageCalc.possibleKO", { n: minHits });
}
