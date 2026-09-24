import { useEffect, useMemo, useRef, useState } from "react";
import {
  alpha,
  Avatar,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "react-i18next";
import { useTheme, useColorScheme } from "@mui/material/styles";
import { moveById, moveByIdentifier } from "@/data/moves";
import { typeIcon } from "@/lib/image";
import { TrainedPokemon } from "@/store/team/team";
import { types, moveCategories } from "@/types/pokemon";
import { flexRowCenter, truncateText } from "@/theme/sx";
import {
  QueryableAutocomplete,
  matchesQueryTokens,
  type QueryFieldDefinition,
  type QueryToken,
} from "@/components/common/queryable-autocomplete";
import type { ChampionsPokemon } from "@/data/champions-pokemon";
import type { FetchResponse } from "@services/battleData";
import type { Result } from "neverthrow";

// moveById の値型
type Move = NonNullable<ReturnType<typeof moveById.get>>;

// 使用率情報を付加した技エントリ
type MoveEntry = Move & {
  readonly rank: number | null;
  readonly percentage: number | null;
};

interface MoveSelectionDrawerProps {
  readonly open: boolean;
  readonly activeSlot: number | null;
  readonly onClose: () => void;
  readonly onChangeSlot: (slot: number) => void;
  readonly onSelectMove: (moveId: number | null) => void;
  readonly ongoing: TrainedPokemon;
  readonly pokemon: ChampionsPokemon;
  readonly battleData: Result<FetchResponse, Error> | undefined;
  readonly isError: boolean;
}

export function MoveSelectionDrawer({
  open,
  activeSlot,
  onClose,
  onChangeSlot,
  onSelectMove,
  ongoing,
  pokemon,
  battleData,
  isError,
}: MoveSelectionDrawerProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { mode } = useColorScheme();

  // クエリトークン（QueryableAutocomplete が管理する）
  const [tokens, setTokens] = useState<QueryToken[]>([]);

  // フィールド定義
  const fields: readonly QueryFieldDefinition[] = useMemo(
    () =>
      [
        {
          key: "type",
          label: t("teamBuilder.movesDrawer.type"),
          values: types.map((type) => ({
            value: type,
            label: t(`types.${type}.name`),
          })),
        },
        {
          key: "category",
          label: t("teamBuilder.movesDrawer.category"),
          values: moveCategories.map((cat) => ({
            value: cat,
            label: t(`moveCategory.${cat}`),
          })),
        },
      ] as const,
    [t],
  );

  // スロットや対象ポケモン、開閉状態が切り替わった時にクエリをリセットする (derived state pattern)
  const [prevActiveSlot, setPrevActiveSlot] = useState(activeSlot);
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevPokemonId, setPrevPokemonId] = useState(pokemon.id);
  const [searchKey, setSearchKey] = useState(0);

  if (prevActiveSlot !== activeSlot || prevOpen !== open || prevPokemonId !== pokemon.id) {
    setPrevActiveSlot(activeSlot);
    setPrevOpen(open);
    setPrevPokemonId(pokemon.id);
    if (open) {
      setTokens([]);
      setSearchKey((k) => k + 1);
    }
  }

  // Drawer が開いたとき / スロットが切り替わったときに検索入力にフォーカス
  const autocompleteInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      autocompleteInputRef.current?.focus();
    }, 250);
    return () => clearTimeout(id);
  }, [open, activeSlot, searchKey]);

  // Drawerに表示する技リストのフィルタリング
  const availableMoves = useMemo((): readonly MoveEntry[] => {
    if (activeSlot === null) return [];

    const available: readonly MoveEntry[] = pokemon.moves
      .map((moveId: number) => ({
        ...moveById.get(moveId)!,
        rank: null,
        percentage: null,
      }))
      .filter((move: MoveEntry) => {
        if (ongoing.moves.some((m, index) => m === move.id && index !== activeSlot)) return false;
        if (tokens.length === 0) return true;

        const isJapanese = i18n.language?.startsWith("ja") ?? false;
        const name = t(`moves.${move.identifier}.name`);
        const text = isJapanese ? name : `${move.identifier} ${name}`;

        return matchesQueryTokens(
          {
            text,
            fields: {
              type: [move.type],
              category: [move.category],
            },
          },
          tokens,
          { isJapanese },
        );
      });

    if (!isError && !!battleData && battleData.isOk()) {
      const isJapanese = i18n.language?.startsWith("ja") ?? false;
      const popularMoves: MoveEntry[] = battleData.value.moves
        .filter((info) => {
          if (!moveByIdentifier.has(info.name)) {
            console.error("MISSING MOVE IN BATTLE DATA:", info.name);
            return false;
          }
          return true;
        })
        .map((info) => ({
          ...moveByIdentifier.get(info.name)!,
          rank: info.rank,
          percentage: info.percentage,
        }))
        .filter((move) => {
          const name = t(`moves.${move.identifier}.name`);
          const text = isJapanese ? name : `${move.identifier} ${name}`;

          return matchesQueryTokens(
            {
              text,
              fields: {
                type: [move.type],
                category: [move.category],
              },
            },
            tokens,
            { isJapanese },
          );
        });

      return popularMoves.concat(
        available.filter((move) => !popularMoves.map(({ id }) => id).includes(move.id)),
      );
    }

    return available;
  }, [activeSlot, pokemon.moves, ongoing.moves, tokens, t, i18n, battleData, isError]);

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      variant="temporary"
      sx={{
        "& .MuiDrawer-paper": {
          width: { xs: "88vw", sm: 420, md: 560, lg: 900 },
          maxWidth: "100%",
          boxSizing: "border-box",
        },
      }}
    >
      {activeSlot !== null && (
        <Stack direction={"column"} sx={{ height: "100%", width: "100%" }}>
          {/* Drawer ヘッダー */}
          <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.dividerSoft}` }}>
            <Stack
              direction="row"
              sx={{ ...flexRowCenter, mb: 2, justifyContent: "space-between" }}
            >
              <Typography variant="h6">{t("teamBuilder.movesDrawer.selectMove")}</Typography>
              <IconButton onClick={onClose} size="small">
                <CloseIcon />
              </IconButton>
            </Stack>

            {/* シームレスなスロット切り替えUI */}
            <ButtonGroup fullWidth size="small" sx={{ mb: 2 }}>
              {[0, 1, 2, 3].map((idx) => (
                <Button
                  key={idx}
                  variant={activeSlot === idx ? "contained" : "outlined"}
                  onClick={() => {
                    setTokens([]);
                    setSearchKey((k) => k + 1);
                    onChangeSlot(idx);
                  }}
                >
                  {ongoing.moves[idx]
                    ? t(`moves.${moveById.get(ongoing.moves[idx]!)?.identifier}.name`)
                    : t("teamBuilder.movesDrawer.moveLabel", { index: idx + 1 })}
                </Button>
              ))}
            </ButtonGroup>

            <QueryableAutocomplete
              key={searchKey}
              fields={fields}
              onTokensChange={setTokens}
              placeholder={t("teamBuilder.query.label")}
              helperText={t("teamBuilder.query.helper")}
              textFieldProps={{ inputRef: autocompleteInputRef, size: "small" }}
            />
          </Box>

          {/* 技リスト */}
          <List sx={{ flexGrow: 1, overflow: "auto", p: 0 }}>
            {/* 「技を消す」オプション */}
            {ongoing.moves[activeSlot] && (
              <ListItemButton
                onClick={() => {
                  setTokens([]);
                  setSearchKey((k) => k + 1);
                  onSelectMove(null);
                }}
                sx={{
                  borderBottom: `2px solid ${theme.palette.divider}`,
                  bgcolor: alpha(theme.palette.error.main, 0.05),
                  "&:hover": { bgcolor: alpha(theme.palette.error.main, 0.1) },
                }}
              >
                <Typography color="error" sx={{ fontWeight: 600 }}>
                  {t("teamBuilder.forgetMove")}
                </Typography>
              </ListItemButton>
            )}
            {availableMoves
              .filter((move) => !ongoing.moves.includes(move.id))
              .map((move) => {
                const isSelected = ongoing.moves[activeSlot] === move.id;

                return (
                  <ListItemButton
                    key={move.identifier}
                    selected={isSelected}
                    onClick={() => {
                      setTokens([]);
                      setSearchKey((k) => k + 1);
                      onSelectMove(move.id);
                    }}
                    sx={{
                      borderBottom: `1px solid ${theme.palette.dividerSoft}`,
                      p: 0,
                      flexDirection: "column",
                      alignItems: "stretch",
                      "&.Mui-selected": { bgcolor: alpha(theme.palette.primary.main, 0.08) },
                    }}
                  >
                    {/* ── lg: 1行レイアウト ── */}
                    <Box
                      sx={{
                        display: { xs: "none", lg: "flex" },
                        alignItems: "center",
                        px: 2,
                        py: 1.5,
                        gap: 1.5,
                        minWidth: 0,
                      }}
                    >
                      {/* 採用率% */}
                      {move.percentage && (
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, color: "primary.main", width: 48, flexShrink: 0 }}
                        >
                          {move.percentage}%
                        </Typography>
                      )}
                      {/* 技名 */}
                      <Typography
                        sx={{
                          ...truncateText,
                          fontWeight: 800,
                          fontSize: "1.1rem",
                          flexGrow: 1,
                          minWidth: 0,
                        }}
                      >
                        {t(`moves.${move.identifier}.name`)}
                      </Typography>
                      {/* 優先度 */}
                      {move.priority !== null && move.priority !== 0 && (
                        <Chip
                          size="small"
                          label={t("teamBuilder.movesDrawer.priority", {
                            val: move.priority > 0 ? `+${move.priority}` : move.priority,
                          })}
                          color={move.priority > 0 ? "error" : "info"}
                          sx={{
                            fontWeight: 900,
                            fontSize: "0.8rem",
                            height: 18,
                            boxShadow: theme.shadows[1],
                            flexShrink: 0,
                            borderRadius: 1,
                            py: 1,
                            px: 2,
                          }}
                        />
                      )}
                      {/* 分類 */}
                      <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                        {move.classifications?.map((clazz: string) => (
                          <Chip
                            key={clazz}
                            size="small"
                            label={t(`moveClassification.${clazz}`)}
                            sx={{ fontSize: "0.75rem", height: 18 }}
                          />
                        ))}
                      </Box>
                      {/* タイプ / カテゴリ / PWR / ACC / RANGE */}
                      <Box
                        sx={{ width: 90, display: "flex", justifyContent: "center", flexShrink: 0 }}
                      >
                        <Chip
                          avatar={<Avatar src={typeIcon(move.type)} />}
                          label={t(`types.${move.type}.name`)}
                          size="small"
                          sx={{ fontWeight: 600 }}
                        />
                      </Box>
                      <Box
                        sx={{ width: 40, display: "flex", justifyContent: "center", flexShrink: 0 }}
                      >
                        <Avatar
                          src={`/move-category/${move.category}.png`}
                          sx={{
                            width: 24,
                            height: 24,
                            bgcolor: "transparent",
                            filter: mode !== "dark" ? "invert(1)" : "none",
                            opacity: mode !== "dark" ? 0.7 : 1,
                          }}
                          variant="square"
                        />
                      </Box>
                      <Box sx={{ width: 48, textAlign: "center", flexShrink: 0 }}>
                        <Typography
                          variant="overline"
                          sx={{
                            display: "block",
                            fontSize: "0.55rem",
                            lineHeight: 1,
                            color: "text.disabled",
                          }}
                        >
                          {t("teamBuilder.movesDrawer.pwr")}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: "1rem",
                            fontWeight: 800,
                            color: move.power && move.power > 0 ? "text.primary" : "text.disabled",
                          }}
                        >
                          {move.power && move.power > 0 ? move.power : "—"}
                        </Typography>
                      </Box>
                      <Box sx={{ width: 48, textAlign: "center", flexShrink: 0 }}>
                        <Typography
                          variant="overline"
                          sx={{
                            display: "block",
                            fontSize: "0.55rem",
                            lineHeight: 1,
                            color: "text.disabled",
                          }}
                        >
                          {t("teamBuilder.movesDrawer.acc")}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: "1rem",
                            fontWeight: 800,
                            color: move.accuracy ? "text.primary" : "text.disabled",
                          }}
                        >
                          {move.accuracy ?? "—"}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 80,
                          pl: 1,
                          textAlign: "center",
                          borderLeft: `1px solid ${theme.palette.dividerSoft}`,
                          flexShrink: 0,
                        }}
                      >
                        <Typography
                          variant="overline"
                          sx={{
                            display: "block",
                            fontSize: "0.55rem",
                            lineHeight: 1,
                            color: "text.disabled",
                          }}
                        >
                          {t("teamBuilder.movesDrawer.range")}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 600,
                            color: "text.primary",
                            display: "block",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t(`range.${move.range}.name`)}
                        </Typography>
                      </Box>
                    </Box>

                    {/* ── xs/sm/md: 2行レイアウト ── */}
                    <Box
                      sx={{
                        display: { xs: "flex", lg: "none" },
                        flexDirection: "column",
                        width: "100%",
                      }}
                    >
                      {/* 行1: 採用率% + 技名 */}
                      <Stack
                        direction="row"
                        sx={{ ...flexRowCenter, px: 2, pt: 2, pb: 0.5, gap: 1.5, minWidth: 0 }}
                      >
                        {move.percentage && (
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              color: "primary.main",
                              width: 48,
                              flexShrink: 0,
                            }}
                          >
                            {move.percentage}%
                          </Typography>
                        )}
                        <Typography
                          sx={{ fontWeight: 800, fontSize: "1.1rem", flexGrow: 1, minWidth: 0 }}
                        >
                          {t(`moves.${move.identifier}.name`)}
                        </Typography>
                      </Stack>
                      {/* 行2: 優先度 + 分類 + タイプ/カテゴリ/PWR/ACC/RANGE */}
                      <Stack
                        direction="row"
                        sx={{ ...flexRowCenter, px: 2, pb: 2, pt: 0.5, gap: 1, flexWrap: "wrap" }}
                      >
                        {move.priority !== null && move.priority !== 0 && (
                          <Chip
                            size="small"
                            label={t("teamBuilder.movesDrawer.priority", {
                              val: move.priority > 0 ? `+${move.priority}` : move.priority,
                            })}
                            color={move.priority > 0 ? "error" : "info"}
                            sx={{
                              fontWeight: 900,
                              fontSize: "0.8rem",
                              height: 18,
                              boxShadow: theme.shadows[1],
                              borderRadius: 1,
                              py: 1,
                              px: 2,
                            }}
                          />
                        )}
                        {move.classifications?.map((clazz: string) => (
                          <Chip
                            key={clazz}
                            size="small"
                            label={t(`moveClassification.${clazz}`)}
                            sx={{ fontSize: "0.75rem", height: 18 }}
                          />
                        ))}
                        <Box sx={{ flexGrow: 1 }} />
                        <Stack direction="row" sx={{ ...flexRowCenter, gap: 0.5, flexShrink: 0 }}>
                          <Chip
                            avatar={<Avatar src={typeIcon(move.type)} />}
                            label={t(`types.${move.type}.name`)}
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                          <Avatar
                            src={`/move-category/${move.category}.png`}
                            sx={{
                              width: 24,
                              height: 24,
                              bgcolor: "transparent",
                              filter: mode !== "dark" ? "invert(1)" : "none",
                              opacity: mode !== "dark" ? 0.7 : 1,
                            }}
                            variant="square"
                          />
                          <Box sx={{ textAlign: "center", minWidth: 32 }}>
                            <Typography
                              variant="overline"
                              sx={{
                                display: "block",
                                fontSize: "0.55rem",
                                lineHeight: 1,
                                color: "text.disabled",
                              }}
                            >
                              {t("teamBuilder.movesDrawer.pwr")}
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "0.9rem",
                                fontWeight: 800,
                                color:
                                  move.power && move.power > 0 ? "text.primary" : "text.disabled",
                              }}
                            >
                              {move.power && move.power > 0 ? move.power : "—"}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: "center", minWidth: 32 }}>
                            <Typography
                              variant="overline"
                              sx={{
                                display: "block",
                                fontSize: "0.55rem",
                                lineHeight: 1,
                                color: "text.disabled",
                              }}
                            >
                              {t("teamBuilder.movesDrawer.acc")}
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "0.9rem",
                                fontWeight: 800,
                                color: move.accuracy ? "text.primary" : "text.disabled",
                              }}
                            >
                              {move.accuracy ?? "—"}
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              textAlign: "center",
                              minWidth: 56,
                              pl: 1,
                              borderLeft: `1px solid ${theme.palette.dividerSoft}`,
                            }}
                          >
                            <Typography
                              variant="overline"
                              sx={{
                                display: "block",
                                fontSize: "0.55rem",
                                lineHeight: 1,
                                color: "text.disabled",
                              }}
                            >
                              {t("teamBuilder.movesDrawer.range")}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 600,
                                color: "text.primary",
                                display: "block",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {t(`range.${move.range}.name`)}
                            </Typography>
                          </Box>
                        </Stack>
                      </Stack>
                    </Box>

                    {/* 説明文 (全ブレークポイント共通) */}
                    <Box sx={{ px: 2, pb: 2 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                        {t(`moves.${move.identifier}.effect`)}
                      </Typography>
                    </Box>
                  </ListItemButton>
                );
              })}
          </List>
        </Stack>
      )}
    </Drawer>
  );
}
