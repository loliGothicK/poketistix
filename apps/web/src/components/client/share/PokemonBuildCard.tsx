"use client";

import { Box, Divider, Grid, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import Image from "next/image";
import { itemById } from "@/data/items";
import { abilityById } from "@/data/abilities";
import { moveById } from "@/data/moves";
import { championsPokemonByIdentifier } from "@/data/champions-pokemon";
import { itemSprite, typeIcon } from "@/lib/image";
import { calcHp, calcStatus } from "@/data/utility/training";
import { natureObjectToString } from "@/data/nature";
import { match } from "ts-pattern";
import type { TrainedPokemon } from "@/store/team/team";
import type { Type } from "@/types/pokemon";
import { MarkdownView } from "@/components/common/MarkdownView";
import { flexRowCenter } from "@/theme/sx";

// ── タイプカラー ──────────────────────────────────────────────────────────────

const TYPE_BG: Record<Type, string> = {
  normal: "#9e9e9e",
  fighting: "#ef6c00",
  flying: "#5c9ce6",
  poison: "#ab47bc",
  ground: "#c8a96e",
  rock: "#bdb76b",
  bug: "#7cb342",
  ghost: "#5e5ce6",
  steel: "#78909c",
  fire: "#f4511e",
  water: "#29b6f6",
  grass: "#43a047",
  electric: "#f9a825",
  psychic: "#ec407a",
  ice: "#26c6da",
  dragon: "#5c6bc0",
  dark: "#5d4037",
  fairy: "#e91e8c",
  stellar: "#7c83d4",
};

// ── ステータス計算 ────────────────────────────────────────────────────────────

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
type StatKey = (typeof STAT_KEYS)[number];

const NATURE_UP = "#ef5350";
const NATURE_DOWN = "#42a5f5";

function calcStat(
  key: StatKey,
  base: number,
  ev: number,
  plus?: StatKey | null,
  minus?: StatKey | null,
) {
  if (key === "hp") return calcHp(base, ev);
  const mult = match(key)
    .when(
      (k) => k === plus,
      () => 1.1,
    )
    .when(
      (k) => k === minus,
      () => 0.9,
    )
    .otherwise(() => 1.0);
  return calcStatus(base, ev, mult);
}

function statColor(key: StatKey, plus?: StatKey | null, minus?: StatKey | null) {
  if (key === "hp") return undefined;
  if (key === plus) return NATURE_UP;
  if (key === minus) return NATURE_DOWN;
  return undefined;
}

// ── Tooltip コンテンツ ────────────────────────────────────────────────────────

const TooltipContent = ({
  title,
  body,
  meta,
}: {
  readonly title: string;
  readonly body?: string;
  readonly meta?: string;
}) => (
  <Box sx={{ p: 0.25, maxWidth: 240 }}>
    <Typography sx={{ fontWeight: 700, fontSize: "0.78rem", mb: body ? 0.5 : 0 }}>
      {title}
    </Typography>
    {meta && (
      <Typography sx={{ fontSize: "0.66rem", color: "text.disabled", mb: body ? 0.25 : 0 }}>
        {meta}
      </Typography>
    )}
    {body && (
      <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", lineHeight: 1.5 }}>
        {body}
      </Typography>
    )}
  </Box>
);

// ── カード共通ラッパー（SurfaceCard の rounded() 二重パディングを回避） ────────
// SurfaceCard は rounded(n) を内部で呼ぶため py/px が自動付与される。
// ここでは Paper を直接使い borderRadius / border / bgcolor だけ設定する。

function CardShell({ children, sx }: { readonly children: React.ReactNode; readonly sx?: object }) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "12px",
        bgcolor: "background.paperRaised",
        overflow: "hidden",
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
}

// ── StatRow ───────────────────────────────────────────────────────────────────

function StatRow({
  label,
  ev,
  actual,
  color,
}: {
  readonly label: string;
  readonly ev: number;
  readonly actual: number;
  readonly color?: string;
}) {
  return (
    <Box sx={{ ...flexRowCenter, gap: 1 }}>
      <Typography
        sx={{
          width: 28,
          fontSize: "0.62rem",
          fontWeight: 700,
          color: color ?? "text.secondary",
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          flex: 1,
          height: 5,
          borderRadius: "2px",
          bgcolor: "divider",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${Math.min((actual / 252) * 100, 100)}%`,
            bgcolor: color ?? "primary.main",
            opacity: 0.85,
          }}
        />
      </Box>
      <Typography
        sx={{
          width: 26,
          fontSize: "0.62rem",
          fontWeight: 700,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          color: color ?? "text.primary",
          flexShrink: 0,
        }}
      >
        {actual}
      </Typography>
      <Typography
        sx={{
          width: 24,
          fontSize: "0.58rem",
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          color: "text.disabled",
          flexShrink: 0,
        }}
      >
        {ev > 0 ? `+${ev}` : ""}
      </Typography>
    </Box>
  );
}

// ── MoveChip（フルカード用 2×2 グリッド内） ───────────────────────────────────

function MoveChip({ moveId }: { readonly moveId: number | null }) {
  const { t } = useTranslation();
  const move = moveId != null ? moveById.get(moveId) : null;

  if (!move) {
    return (
      <Box
        sx={{
          height: 30,
          display: "flex",
          alignItems: "center",
          px: 1,
          borderRadius: "5px",
          border: "1px dashed",
          borderColor: "divider",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.7rem",
            color: "text.disabled",
            fontStyle: "italic",
          }}
        >
          —
        </Typography>
      </Box>
    );
  }

  const tc = TYPE_BG[move.type as Type] ?? "#9e9e9e";
  const powerStr = move.power != null ? String(move.power) : "—";
  const accuracyStr = move.accuracy != null ? `${move.accuracy}%` : "—";
  const metaStr = `${t(`types.${move.type}.name`)} · ${move.category} · Power ${powerStr} · Acc ${accuracyStr}`;

  return (
    <Tooltip
      title={
        <TooltipContent
          title={t(`moves.${move.identifier}.name`)}
          meta={metaStr}
          body={t(`moves.${move.identifier}.effect`)}
        />
      }
      arrow
      placement="top"
      enterDelay={300}
    >
      <Box
        sx={{
          height: 30,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          borderRadius: "5px",
          background: `linear-gradient(105deg, ${tc}28 0%, ${tc}0e 100%)`,
          border: "1px solid",
          borderColor: `${tc}55`,
          cursor: "default",
          overflow: "hidden",
          width: "100%",
        }}
      >
        <Box
          component="img"
          src={typeIcon(move.type)}
          alt=""
          sx={{ width: 13, height: 13, flexShrink: 0 }}
        />
        <Typography
          sx={{
            fontSize: "0.7rem",
            fontWeight: 600,
            lineHeight: 1,
            color: "text.primary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {t(`moves.${move.identifier}.name`)}
        </Typography>
      </Box>
    </Tooltip>
  );
}

// ── MoveTag（コンパクト行用インライン） ───────────────────────────────────────

function MoveTag({ moveId }: { readonly moveId: number | null }) {
  const { t } = useTranslation();
  const move = moveId != null ? moveById.get(moveId) : null;

  if (!move) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 0.75,
          py: "2px",
          height: 18,
          borderRadius: "4px",
          border: "1px dashed",
          borderColor: "divider",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.6rem",
            color: "text.disabled",
            fontStyle: "italic",
          }}
        >
          —
        </Typography>
      </Box>
    );
  }

  const tc = TYPE_BG[move.type as Type] ?? "#9e9e9e";
  const powerStr = move.power != null ? String(move.power) : "—";
  const accuracyStr = move.accuracy != null ? `${move.accuracy}%` : "—";
  const metaStr = `${t(`types.${move.type}.name`)} · ${move.category} · Power ${powerStr} · Acc ${accuracyStr}`;

  return (
    <Tooltip
      title={
        <TooltipContent
          title={t(`moves.${move.identifier}.name`)}
          meta={metaStr}
          body={t(`moves.${move.identifier}.effect`)}
        />
      }
      arrow
      placement="top"
      enterDelay={300}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.4,
          px: 0.75,
          py: "2px",
          height: 18,
          borderRadius: "4px",
          background: `linear-gradient(105deg, ${tc}28 0%, ${tc}0e 100%)`,
          border: "1px solid",
          borderColor: `${tc}50`,
          cursor: "default",
          width: "100%",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <Box
          component="img"
          src={typeIcon(move.type)}
          alt=""
          sx={{ width: 10, height: 10, flexShrink: 0 }}
        />
        <Typography
          sx={{
            fontSize: "0.6rem",
            fontWeight: 600,
            lineHeight: 1.3,
            color: "text.primary",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            minWidth: 0,
          }}
        >
          {t(`moves.${move.identifier}.name`)}
        </Typography>
      </Box>
    </Tooltip>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface PokemonBuildCardProps {
  readonly pokemon: TrainedPokemon;
  readonly showStats: boolean;
  /** "full" = フルカード（タブレット・デスクトップ）。"compact" = コンパクト行（モバイル）。 */
  readonly variant?: "full" | "compact";
}

// ── Compact row variant (mobile) ──────────────────────────────────────────────

function PokemonCompactRow({ pokemon, showStats }: Omit<PokemonBuildCardProps, "variant">) {
  const { t, i18n } = useTranslation();

  const pokemonName = t(`pokemon.${pokemon.identifier}.name`);
  const formNameKey = `pokemon.${pokemon.identifier}.formName` as const;
  const formName = i18n.exists(formNameKey) ? t(formNameKey) : "";
  const data = championsPokemonByIdentifier.get(pokemon.identifier);
  const item = pokemon.item != null ? itemById.get(pokemon.item) : null;
  const ability = abilityById.get(pokemon.ability);
  const nature = natureObjectToString(pokemon.nature);
  const { plus, minus } = pokemon.nature;
  const baseStat = data?.status ?? [45, 45, 45, 45, 45, 45];
  const types = data?.types ?? [];
  const c1 = TYPE_BG[types[0] as Type] ?? "#1565c0";
  const c2 = TYPE_BG[(types[1] ?? types[0]) as Type] ?? c1;

  const statLabels: Record<StatKey, string> = {
    hp: t("teamBuilder.status.hp.name"),
    atk: t("teamBuilder.status.atk.name"),
    def: t("teamBuilder.status.def.name"),
    spa: t("teamBuilder.status.spa.name"),
    spd: t("teamBuilder.status.spd.name"),
    spe: t("teamBuilder.status.spe.name"),
  };

  return (
    <CardShell>
      <Box sx={{ display: "flex", alignItems: "stretch" }}>
        {/* スプライト */}
        <Box
          sx={{
            width: 72,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(145deg, ${c1}30 0%, ${c2}18 100%)`,
            borderRight: "1px solid",
            borderColor: "divider",
            py: "10px",
          }}
        >
          <Box sx={{ width: 56, height: 56, position: "relative" }}>
            <Image
              src={`/pokemon/${pokemon.identifier}.png`}
              alt={formName ? `${pokemonName} (${formName})` : pokemonName}
              fill
              style={{ objectFit: "contain" }}
              sizes="56px"
            />
          </Box>
        </Box>

        {/* メイン情報（min-width:0 でオーバーフロー防止） */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            px: "12px",
            py: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {/* 名前 + タイプアイコン */}
          <Box sx={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: "0.85rem",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 1,
                minWidth: 0,
              }}
            >
              {pokemonName}
              {formName && (
                <Typography
                  component="span"
                  sx={{ ml: "4px", fontSize: "0.72em", color: "text.secondary", fontWeight: 500 }}
                >
                  {formName}
                </Typography>
              )}
            </Typography>
            <Stack direction="row" spacing="3px" sx={{ flexShrink: 0 }}>
              {types.map((type) => (
                <Box
                  key={type}
                  component="img"
                  src={typeIcon(type)}
                  alt={t(`types.${type}.name`)}
                  sx={{ height: 13, width: "auto" }}
                />
              ))}
            </Stack>
          </Box>

          {/* 特性 / 性格 / 持ち物 */}
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {ability && (
              <Tooltip
                title={
                  <TooltipContent
                    title={t(`abilities.${ability.identifier}.name`)}
                    body={t(`abilities.${ability.identifier}.effect`)}
                  />
                }
                arrow
                placement="top"
                enterDelay={300}
              >
                <Typography
                  sx={{
                    fontSize: "0.67rem",
                    color: "text.secondary",
                    cursor: "default",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t(`abilities.${ability.identifier}.name`)}
                </Typography>
              </Tooltip>
            )}
            {nature && (
              <Typography
                sx={{ fontSize: "0.67rem", color: "text.disabled", whiteSpace: "nowrap" }}
              >
                {t(`natures.${nature.toLowerCase()}.name`)}
              </Typography>
            )}
            {item && (
              <Tooltip
                title={
                  <TooltipContent
                    title={t(`items.${item.identifier}.name`)}
                    body={t(`items.${item.identifier}.effect`)}
                  />
                }
                arrow
                placement="top"
                enterDelay={300}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: "3px", cursor: "default" }}>
                  <Box
                    component="img"
                    src={itemSprite(item.identifier)}
                    alt=""
                    sx={{ width: 13, height: 13 }}
                  />
                  <Typography
                    sx={{ fontSize: "0.67rem", color: "text.secondary", whiteSpace: "nowrap" }}
                  >
                    {t(`items.${item.identifier}.name`)}
                  </Typography>
                </Box>
              </Tooltip>
            )}
          </Box>

          {/* 技 */}
          <Grid container spacing="4px">
            {pokemon.moves.map((moveId, i) => (
              <Grid component="div" size={6} key={i}>
                <MoveTag moveId={moveId} />
              </Grid>
            ))}
          </Grid>

          {/* ステータス（showStats のみ） */}
          {showStats && (
            <Box sx={{ mt: "6px" }}>
              <Divider sx={{ mb: "6px" }} />
              <Stack spacing="2px">
                {STAT_KEYS.map((key, i) => {
                  const base = baseStat[i] ?? 45;
                  const ev = pokemon.evs[key];
                  const actual = calcStat(key, base, ev, plus ?? undefined, minus ?? undefined);
                  const color = statColor(key, plus ?? undefined, minus ?? undefined);
                  return (
                    <StatRow
                      key={key}
                      label={statLabels[key]}
                      ev={ev}
                      actual={actual}
                      color={color}
                    />
                  );
                })}
              </Stack>
            </Box>
          )}
        </Box>
      </Box>
    </CardShell>
  );
}

// ── Full card variant (tablet / desktop) ──────────────────────────────────────

function PokemonFullCard({ pokemon, showStats }: Omit<PokemonBuildCardProps, "variant">) {
  const { t, i18n } = useTranslation();

  const pokemonName = t(`pokemon.${pokemon.identifier}.name`);
  const formNameKey = `pokemon.${pokemon.identifier}.formName` as const;
  const formName = i18n.exists(formNameKey) ? t(formNameKey) : "";
  const data = championsPokemonByIdentifier.get(pokemon.identifier);
  const item = pokemon.item != null ? itemById.get(pokemon.item) : null;
  const ability = abilityById.get(pokemon.ability);
  const nature = natureObjectToString(pokemon.nature);
  const { plus, minus } = pokemon.nature;
  const baseStat = data?.status ?? [45, 45, 45, 45, 45, 45];
  const types = data?.types ?? [];
  const c1 = TYPE_BG[types[0] as Type] ?? "#1565c0";
  const c2 = TYPE_BG[(types[1] ?? types[0]) as Type] ?? c1;

  const natureBoostLabel = (() => {
    if (!plus && !minus) return undefined;
    const statName = (k: string) => t(`teamBuilder.status.${k}.name`);
    const parts: string[] = [];
    if (plus) parts.push(`↑${statName(plus)}`);
    if (minus) parts.push(`↓${statName(minus)}`);
    return parts.join(" / ");
  })();

  const abilityDescription = ability ? t(`abilities.${ability.identifier}.effect`) : undefined;
  const itemDescription = item ? t(`items.${item.identifier}.effect`) : undefined;

  const statLabels: Record<StatKey, string> = {
    hp: t("teamBuilder.status.hp.name"),
    atk: t("teamBuilder.status.atk.name"),
    def: t("teamBuilder.status.def.name"),
    spa: t("teamBuilder.status.spa.name"),
    spd: t("teamBuilder.status.spd.name"),
    spe: t("teamBuilder.status.spe.name"),
  };

  return (
    <CardShell sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── ヘッダー: 名前 + タイプ ──────────────────────────────────────────── */}
      <Box
        sx={{
          px: "14px",
          py: "10px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          borderBottom: "1px solid",
          borderColor: "divider",
          background: `linear-gradient(90deg, ${c1}20 0%, transparent 100%)`,
          minWidth: 0,
        }}
      >
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: "0.9rem",
            lineHeight: 1.2,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {pokemonName}
          {formName && (
            <Typography
              component="span"
              sx={{ ml: "4px", fontSize: "0.72em", color: "text.secondary", fontWeight: 500 }}
            >
              {formName}
            </Typography>
          )}
        </Typography>

        {types.length > 0 && (
          <Stack direction="row" spacing="4px" sx={{ flexShrink: 0 }}>
            {types.map((type) => (
              <Box
                key={type}
                component="img"
                src={typeIcon(type)}
                alt={t(`types.${type}.name`)}
                sx={{ height: 16, width: "auto" }}
              />
            ))}
          </Stack>
        )}
      </Box>

      {/* ── スプライト + 持ち物バッジ ───────────────────────────────────────── */}
      <Box
        sx={{
          position: "relative",
          background: `linear-gradient(145deg, ${c1}35 0%, ${c2}18 60%, transparent 100%)`,
          py: "16px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            width: 104,
            height: 104,
            position: "relative",
            filter: "drop-shadow(0 6px 16px rgba(0, 0, 0, 0.4))",
          }}
        >
          <Image
            src={`/pokemon/${pokemon.identifier}.png`}
            alt={formName ? `${pokemonName} (${formName})` : pokemonName}
            fill
            style={{ objectFit: "contain" }}
            sizes="104px"
          />
        </Box>

        {item && (
          <Tooltip
            title={
              <TooltipContent title={t(`items.${item.identifier}.name`)} body={itemDescription} />
            }
            arrow
            placement="left"
            enterDelay={300}
          >
            <Box
              sx={{
                position: "absolute",
                bottom: "8px",
                right: "12px",
                width: 30,
                height: 30,
                borderRadius: "8px",
                bgcolor: "background.paperTint",
                border: "1px solid",
                borderColor: "divider",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(4px)",
                cursor: "default",
              }}
            >
              <Box
                component="img"
                src={itemSprite(item.identifier)}
                alt=""
                sx={{ width: 20, height: 20 }}
              />
            </Box>
          </Tooltip>
        )}
      </Box>

      {/* ── ボディ ───────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          px: "14px",
          pt: "12px",
          pb: "16px",
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          minWidth: 0,
        }}
      >
        {/* 持ち物テキスト行 */}
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.7rem", color: "text.disabled", flexShrink: 0 }}>
            @
          </Typography>
          {item ? (
            <Tooltip
              title={
                <TooltipContent title={t(`items.${item.identifier}.name`)} body={itemDescription} />
              }
              arrow
              placement="top"
              enterDelay={300}
            >
              <Typography
                sx={{
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  color: "text.secondary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  cursor: "default",
                  minWidth: 0,
                }}
              >
                {t(`items.${item.identifier}.name`)}
              </Typography>
            </Tooltip>
          ) : (
            <Typography
              sx={{
                fontSize: "0.8rem",
                color: "text.disabled",
                fontStyle: "italic",
              }}
            >
              {t("box.noItem")}
            </Typography>
          )}
        </Box>

        {/* 特性 + 性格 */}
        <Box sx={{ display: "flex", gap: "20px", minWidth: 0, flexWrap: "wrap" }}>
          {ability && (
            <Tooltip
              title={
                <TooltipContent
                  title={t(`abilities.${ability.identifier}.name`)}
                  body={abilityDescription}
                />
              }
              arrow
              placement="top"
              enterDelay={300}
            >
              <Box sx={{ cursor: "default", minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: "0.6rem",
                    color: "text.disabled",
                    mb: "2px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {t("share.abilityLabel")}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "text.primary",
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t(`abilities.${ability.identifier}.name`)}
                </Typography>
              </Box>
            </Tooltip>
          )}

          {nature && (
            <Tooltip
              title={
                natureBoostLabel ? (
                  <TooltipContent
                    title={t(`natures.${nature.toLowerCase()}.name`)}
                    body={natureBoostLabel}
                  />
                ) : undefined
              }
              arrow
              placement="top"
              enterDelay={300}
              disableHoverListener={!natureBoostLabel}
            >
              <Box sx={{ cursor: natureBoostLabel ? "default" : "auto", flexShrink: 0 }}>
                <Typography
                  sx={{
                    fontSize: "0.6rem",
                    color: "text.disabled",
                    mb: "2px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {t("share.natureLabel")}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "text.primary",
                    lineHeight: 1.2,
                  }}
                >
                  {t(`natures.${nature.toLowerCase()}.name`)}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>

        {/* 技 2×2 */}
        <Grid container spacing="6px">
          {pokemon.moves.map((moveId, i) => (
            <Grid component="div" size={6} key={i}>
              <MoveChip moveId={moveId} />
            </Grid>
          ))}
        </Grid>

        {/* ステータス */}
        {showStats && (
          <>
            <Divider />
            <Stack spacing="3px">
              {STAT_KEYS.map((key, i) => {
                const base = baseStat[i] ?? 45;
                const ev = pokemon.evs[key];
                const actual = calcStat(key, base, ev, plus ?? undefined, minus ?? undefined);
                const color = statColor(key, plus ?? undefined, minus ?? undefined);
                return (
                  <StatRow
                    key={key}
                    label={statLabels[key]}
                    ev={ev}
                    actual={actual}
                    color={color}
                  />
                );
              })}
            </Stack>
          </>
        )}

        {/* 調整意図・メモ */}
        {pokemon.description && (
          <>
            <Divider />
            <Box sx={{ bgcolor: "background.paperTint", p: 1, borderRadius: 1 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, display: "block", color: "text.secondary" }}
              >
                {t("teamBuilder.pokemonNotes.title")}
              </Typography>
              <MarkdownView
                content={pokemon.description}
                sx={{ fontSize: "0.78rem", lineHeight: 1.5, color: "text.primary", mt: 0.25 }}
              />
            </Box>
          </>
        )}
      </Box>
    </CardShell>
  );
}

// ── メインエクスポート ─────────────────────────────────────────────────────────

export function PokemonBuildCard({ pokemon, showStats, variant = "full" }: PokemonBuildCardProps) {
  if (variant === "compact") {
    return <PokemonCompactRow pokemon={pokemon} showStats={showStats} />;
  }
  return <PokemonFullCard pokemon={pokemon} showStats={showStats} />;
}
