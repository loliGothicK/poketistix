import {
  alpha,
  Autocomplete,
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Slider,
  Stack,
  TextField,
  Typography,
  Tooltip,
  Alert,
  Popover,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Image from "next/image";
import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useActiveTeam } from "@/hooks/useActiveTeam";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { flexRowCenter } from "@/theme/sx";
import { pokemonById, pokemonList } from "@/data/pokemon";
import { championsPokemonList } from "@/data/champions-pokemon";
import { itemList } from "@/data/items";
import { abilityById } from "@/data/abilities";
import { moveById } from "@/data/moves";
import { getStatLens, TrainedPokemon } from "@/store/team/team";
import NumberField from "@/components/client/input/NumberField";
import { calcHp, calcStatus } from "@/data/utility/training";
import { match } from "ts-pattern";
import { EV } from "@/types/pokemon";
import { useBattleData } from "@/hooks/useBattleData";
import { itemSprite, typeIcon } from "@/lib/image";
import { Nature, natureObjectToString, natureStringToObject } from "@/data/nature";
import { Add, Remove, ArrowDropDown, ChangeCircle, Tune, Shield } from "@mui/icons-material";
import { optimizeBulk } from "@/data/utility/optimizeBulk";
import { SurvivalTuningModal } from "@/components/client/team-builder/SurvivalTuningModal";
import {
  makeTeamLintIssuesAtom,
  activeSlotLintIssueAtom,
  MAX_EV_TOTAL,
  MAX_EV_PER_STAT,
} from "@/store/team/lint";
import { useAtom, useAtomValue } from "jotai";
import { activeTeamLintAtom } from "@/store/team/options";
import { useHotkeys } from "react-hotkeys-hook";
import { MoveSelectionDrawer } from "@/components/client/team-builder/MovesDrawer";
import { formatLintIssue } from "@/lib/linter/format";

const DICTIONARY = (() => {
  const mapped = new Map(
    pokemonList.map(({ species_id, identifier }) => [
      identifier,
      {
        species_id,
      },
    ]),
  );
  return new Map(
    championsPokemonList.map((pokemon) => [
      pokemon.identifier,
      {
        ...pokemon,
        ...mapped.get(pokemon.identifier)!,
      },
    ]),
  );
})();

const STAT_LABELS = ["atk", "def", "spa", "spd", "spe"] as const;

const NATURE_MATRIX: Record<
  (typeof STAT_LABELS)[number],
  Record<(typeof STAT_LABELS)[number], Nature | null>
> = {
  atk: { atk: "Serious", def: "Lonely", spa: "Adamant", spd: "Naughty", spe: "Brave" },
  def: { atk: "Bold", def: null, spa: "Impish", spd: "Lax", spe: "Relaxed" },
  spa: { atk: "Modest", def: "Mild", spa: null, spd: "Rash", spe: "Quiet" },
  spd: { atk: "Calm", def: "Gentle", spa: "Careful", spd: null, spe: "Sassy" },
  spe: { atk: "Timid", def: "Hasty", spa: "Jolly", spd: "Naive", spe: null },
};

// アイテムIDからメガシンカ後のデータを引くためのマップ
const megaPokemonByStoneId = new Map(
  championsPokemonList
    .filter((p) => p.mega)
    .flatMap((p) => p.mega!.map(({ stone_id, mega_id }) => [stone_id, mega_id])),
);

export function Training({
  member,
  onUpdate,
  activeTab,
  onChangePokemonClick,
}: {
  readonly member: TrainedPokemon;
  readonly onUpdate: (trained: TrainedPokemon) => void;
  readonly activeTab: number;
  readonly onChangePokemonClick?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [prevMember, setPrevMember] = useState(member);
  const [ongoing, setOngoing] = useState<TrainedPokemon>(member);

  if (prevMember !== member) {
    setPrevMember(member);
    if (JSON.stringify(ongoing) !== JSON.stringify(member)) {
      setOngoing(member);
    }
  }
  const [isLintOn] = useAtom(activeTeamLintAtom);
  const { battleData, isError } = useBattleData(member.slug, "Doubles");
  const nature = ongoing?.nature ? natureObjectToString(ongoing.nature) : null;
  const [natureAnchorEl, setNatureAnchorEl] = useState<HTMLButtonElement | null>(null);
  const isNaturePopoverOpen = Boolean(natureAnchorEl);
  const [activeTeam] = useActiveTeam();
  const lintIssuesAtom = useMemo(() => makeTeamLintIssuesAtom(activeTeam), [activeTeam]);
  const lintIssues = useAtomValue(lintIssuesAtom);
  const slotLintIssueAtom = useMemo(() => activeSlotLintIssueAtom(lintIssues), [lintIssues]);
  const issue = useAtomValue(slotLintIssueAtom);
  const items = useMemo(() => {
    return itemList.toSorted((a, b) => a.category.localeCompare(b.category));
  }, []);

  // --- Drawerの状態管理 ---
  const [activeMoveSlot, setActiveMoveSlot] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useHotkeys("esc", () => {
    if (drawerOpen) {
      setDrawerOpen(false);
    }
  });

  // --- 耐久最適化の設定状態 ---
  const [bulkSettingsAnchorEl, setBulkSettingsAnchorEl] = useState<HTMLButtonElement | null>(null);
  const isBulkSettingsOpen = Boolean(bulkSettingsAnchorEl);
  const [physicalRatio, setPhysicalRatio] = useState<number>(0.5);
  const [defMultiplier, setDefMultiplier] = useState<number>(1.0);
  const [spdMultiplier, setSpdMultiplier] = useState<number>(1.0);

  // --- 仮想敵耐え調整モーダル状態 ---
  const [survivalModalOpen, setSurvivalModalOpen] = useState<boolean>(false);

  const handleUpdate = (trained: TrainedPokemon) => {
    setOngoing(trained);
    onUpdate(trained);
  };

  if (!ongoing) {
    return (
      <SurfaceCard borderRadius={4} sx={{ p: 4 }}>
        <Typography variant="h6">{t("teamBuilder.emptySlot")}</Typography>
      </SurfaceCard>
    );
  }

  const pokemon = DICTIONARY.get(ongoing.identifier)!;
  const [useForm, setUseForm] = useState(false);

  const formChangeState = useMemo(() => {
    if (ongoing.item && pokemon.mega?.some(({ stone_id }) => stone_id === ongoing.item)) {
      const megaId = megaPokemonByStoneId.get(ongoing.item)!;
      const megaPokemon = DICTIONARY.get(pokemonById.get(megaId)!.identifier);
      if (megaPokemon) return { type: "mega" as const, data: megaPokemon };
    }
    if (pokemon.form) {
      const formPokemon = DICTIONARY.get(pokemonById.get(pokemon.form)!.identifier);
      if (formPokemon) return { type: "form" as const, data: formPokemon };
    }
    return null;
  }, [ongoing.item, pokemon]);

  const activePokemon = useMemo(() => {
    if (useForm && formChangeState?.data) {
      return formChangeState.data;
    }
    return pokemon;
  }, [useForm, formChangeState, pokemon]);

  const remainingEvs = useMemo(() => {
    return MAX_EV_TOTAL - Object.values(ongoing.evs).reduce((a, b) => a + b, 0 as number);
  }, [ongoing]);

  const handleOptimizeBulk = () => {
    const baseStats = {
      hp: activePokemon.status[0],
      def: activePokemon.status[2],
      spd: activePokemon.status[4],
    };
    const currentBulkEvs =
      (ongoing.evs?.hp ?? 0) + (ongoing.evs?.def ?? 0) + (ongoing.evs?.spd ?? 0);
    const availablePool = currentBulkEvs + remainingEvs;

    const defaultMinus = (() => {
      const currentMinus = ongoing.nature?.minus;
      if (
        currentMinus &&
        currentMinus !== "def" &&
        currentMinus !== "spd" &&
        currentMinus !== "hp"
      ) {
        return currentMinus as "atk" | "spa" | "spe";
      }
      const atkEv = ongoing.evs?.atk ?? 0;
      const spaEv = ongoing.evs?.spa ?? 0;
      if (atkEv > spaEv) return "spa";
      if (spaEv > atkEv) return "atk";
      return activePokemon.status[1] > activePokemon.status[3] ? "spa" : "atk";
    })();

    const result = optimizeBulk(baseStats, ongoing.nature ?? {}, availablePool, {
      physicalRatio,
      defMultiplier,
      spdMultiplier,
      minEvs: {
        hp: ongoing.evs?.hp ?? 0,
        def: ongoing.evs?.def ?? 0,
        spd: ongoing.evs?.spd ?? 0,
      },
      defaultMinus,
    });

    handleUpdate({
      ...ongoing,
      evs: {
        ...ongoing.evs,
        hp: result.evs.hp as EV,
        def: result.evs.def as EV,
        spd: result.evs.spd as EV,
      },
      ...(result.nature ? { nature: result.nature as TrainedPokemon["nature"] } : {}),
    });
  };

  const handleDrawerOpen = (slot: number) => {
    setActiveMoveSlot(slot);
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setActiveMoveSlot(null);
    setDrawerOpen(false);
  };

  const handleSelectMove = (moveId: number | null) => {
    if (activeMoveSlot === null) return;

    const newMoves = [...ongoing.moves] as typeof ongoing.moves;
    newMoves[activeMoveSlot] = moveId;

    handleUpdate({ ...ongoing, moves: newMoves });

    if (moveId !== null && activeMoveSlot < 3) {
      setActiveMoveSlot(activeMoveSlot + 1);
    }
  };

  const handleClearMove = (
    e: ReactMouseEvent<HTMLButtonElement, MouseEvent>,
    slotIndex: number,
  ) => {
    e.stopPropagation();
    const newMoves = [...ongoing.moves] as typeof ongoing.moves;
    newMoves[slotIndex] = null;
    handleUpdate({ ...ongoing, moves: newMoves });
  };

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={{ xs: 2, md: 4 }}
      className={"Training-root"}
      sx={{ minWidth: 0, p: { xs: 0, md: 4 } }}
    >
      {/* 左カラム：ポケモン画像（独立したCard） */}
      <Stack
        spacing={2}
        sx={{ width: { xs: "100%", md: 240 }, flexShrink: 0, alignItems: "center" }}
      >
        {/* Name and Types Block */}
        <Stack
          direction={{ xs: "row", md: "column" }}
          spacing={{ xs: 2, md: 1 }}
          sx={{
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            mb: 1,
            px: { xs: 2, md: 0 },
            pt: { xs: 2, md: 0 },
          }}
        >
          <Stack
            direction="column"
            spacing={0}
            sx={{ alignItems: { xs: "flex-end", md: "center" } }}
          >
            <Typography
              variant="h5"
              sx={{ fontWeight: 700, textAlign: { xs: "right", md: "center" } }}
            >
              {t(`pokemon.${activePokemon.identifier}.name`)}
            </Typography>
            {i18n.exists(`pokemon.${activePokemon.identifier}.formName`) && (
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  textAlign: { xs: "right", md: "center" },
                  fontWeight: 400,
                }}
              >
                {t(`pokemon.${activePokemon.identifier}.formName`)}
              </Typography>
            )}
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: { xs: "flex-start", md: "center" } }}
          >
            {activePokemon.types.map((type) => (
              <Chip
                avatar={<Avatar src={typeIcon(type)} />}
                key={type}
                label={t(`types.${type.toLowerCase()}.name`)}
                size="small"
              />
            ))}
          </Stack>
        </Stack>

        <SurfaceCard
          raised
          sx={{
            p: { xs: 0, md: 4 },
            borderRadius: { xs: 0, md: 4 },
            border: { xs: "none" },
            bgcolor: { xs: "transparent" },
            backgroundImage: { xs: "none" },
            boxShadow: { xs: "none" },
            width: "100%",
            ...flexRowCenter,
            justifyContent: "center",
          }}
        >
          {/* ポケモン画像領域 */}
          <Box
            onClick={onChangePokemonClick}
            sx={{
              width: 144,
              height: 144,
              minWidth: 144,
              borderRadius: 4,
              bgcolor: "background.paper",
              display: "grid",
              placeItems: "center",
              position: "relative",
              boxShadow: 1,
              overflow: "hidden",
              flexShrink: 0,
              cursor: onChangePokemonClick ? "pointer" : "default",
            }}
          >
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 10,
                width: "100%",
                height: "100%",
                bgcolor: "background.paperTint",
                backdropFilter: "blur(2px)",
              }}
            >
              <Image
                src={`/pokemon/${activePokemon.identifier}.png`}
                alt={ongoing.identifier}
                width={120}
                height={120}
                style={{ display: "block" }}
              />
            </Box>
            {ongoing.item &&
              (() => {
                const item = itemList.find((i) => i.id === ongoing.item);
                return item ? (
                  <Box
                    sx={{
                      position: "absolute",
                      bottom: 10,
                      right: 10,
                      width: 50,
                      height: 50,
                      borderRadius: "50%",
                      bgcolor: "background.paperTint",
                      boxShadow: 2,
                      ...flexRowCenter,
                      justifyContent: "center",
                      backdropFilter: "blur(2px)",
                    }}
                  >
                    <Image
                      src={itemSprite(item.identifier)}
                      alt={item.identifier}
                      width={45}
                      height={45}
                    />
                  </Box>
                ) : null;
              })()}
            {formChangeState && (
              <Tooltip
                title={
                  useForm
                    ? formChangeState.type === "mega"
                      ? t("teamBuilder.cancelMegaEvolve")
                      : t("teamBuilder.revertForm")
                    : formChangeState.type === "mega"
                      ? t("teamBuilder.megaEvolve")
                      : t("teamBuilder.changeForm")
                }
                placement="top"
              >
                <Box
                  onClick={(e) => {
                    e.stopPropagation();
                    setUseForm(!useForm);
                  }}
                  sx={{
                    position: "absolute",
                    bottom: 6,
                    left: 6,
                    p: 0.5,
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    cursor: "pointer",
                    ...flexRowCenter,
                    justifyContent: "center",
                    bgcolor: useForm
                      ? alpha(theme.palette.primary.main, 0.1)
                      : "background.paperTint",
                    borderColor: useForm ? theme.palette.primary.main : theme.palette.dividerSoft,
                    transition: "all 0.2s",
                    backdropFilter: "blur(2px)",
                    "&:hover": {
                      bgcolor: useForm
                        ? alpha(theme.palette.primary.main, 0.15)
                        : alpha(theme.palette.primary.main, 0.05),
                      borderColor: theme.palette.primary.light,
                      transform: "scale(1.05)",
                    },
                  }}
                >
                  {formChangeState.type === "mega" ? (
                    <Image
                      src={"/Mega_Evolution_symbol.png"}
                      alt="Mega Evolve"
                      width={28}
                      height={37}
                      style={{
                        filter: useForm ? "none" : "grayscale(80%) opacity(0.6)",
                        transition: "filter 0.2s",
                      }}
                    />
                  ) : (
                    <ChangeCircle
                      sx={{
                        fontSize: 32,
                        color: useForm ? theme.palette.primary.main : theme.palette.text.secondary,
                        transition: "color 0.2s",
                      }}
                    />
                  )}
                </Box>
              </Tooltip>
            )}
          </Box>
        </SurfaceCard>
      </Stack>

      {/* 右カラム：コンテンツ */}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {/* タブ 0: Basics */}
        <Box sx={{ display: activeTab === 0 ? "block" : "none" }}>
          <Stack spacing={3} sx={{ flexGrow: 1 }}>
            <Box>
              <Divider textAlign={"left"}>
                <Typography variant="h6">{t("teamBuilder.sectionBasicSpecs")}</Typography>
              </Divider>
            </Box>
            <Stack spacing={2} sx={{ width: "100%" }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                <Autocomplete
                  value={items.find(({ id }) => id === ongoing.item) || null}
                  options={items}
                  groupBy={(option) => option.category}
                  getOptionLabel={(option) => t(`items.${option.identifier}.name`)}
                  sx={{ flexGrow: 1 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t("teamBuilder.heldItem")}
                      slotProps={{ ...params.slotProps, formHelperText: { component: "div" } }}
                      helperText={
                        issue &&
                        remainingEvs === 0 &&
                        issue.item.length > 0 && (
                          <Box>
                            {issue.item.map((issue) => (
                              <Alert severity={issue.severity} key={issue.source._tag}>
                                {formatLintIssue(issue, t)}
                              </Alert>
                            ))}
                          </Box>
                        )
                      }
                    />
                  )}
                  renderValue={(params) => (
                    <Chip
                      avatar={<Avatar src={itemSprite(params.identifier)} />}
                      label={t(`items.${params.identifier}.name`)}
                    />
                  )}
                  renderOption={({ key, ...props }, value) => (
                    <Stack
                      key={key}
                      component={"li"}
                      direction={"column"}
                      sx={{ alignItems: "flex-start" }}
                      {...props}
                    >
                      <Chip
                        avatar={<Avatar src={itemSprite(value.identifier)} />}
                        label={t(`items.${value.identifier}.name`)}
                      />
                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >{`${t(`items.${value.identifier}.effect`)}`}</Typography>
                    </Stack>
                  )}
                  onChange={(_, value) => {
                    setUseForm(false);
                    handleUpdate({ ...ongoing, item: value?.id || null });
                  }}
                />

                <Autocomplete
                  options={["male", "female"] as const}
                  value={ongoing.gender.fixed ? "male" : (ongoing.gender.specified ?? null)}
                  getOptionLabel={(option) => t(`gender.${option}`)}
                  onChange={(_, newValue) =>
                    handleUpdate({
                      ...ongoing,
                      gender: { fixed: false, specified: newValue || undefined },
                    })
                  }
                  renderInput={(params) => (
                    <TextField {...params} label={t("teamBuilder.gender")} />
                  )}
                  disabled={ongoing.gender.fixed}
                  sx={{ width: { xs: "100%", md: 140 } }}
                />
              </Stack>

              <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                <Autocomplete
                  value={ongoing.ability}
                  options={
                    useForm && formChangeState?.type === "mega"
                      ? activePokemon.abilities
                      : pokemon.abilities
                  }
                  getOptionLabel={(option) =>
                    t(`abilities.${abilityById.get(option)?.identifier}.name`)
                  }
                  sx={{ flexGrow: 1 }}
                  renderInput={(params) => (
                    <TextField {...params} label={t("teamBuilder.ability")} />
                  )}
                  onChange={(_, value) => handleUpdate({ ...ongoing, ability: value! })}
                />

                <Box sx={{ width: { xs: "100%", md: 140 } }}>
                  <TextField
                    label={t("teamBuilder.nature")}
                    value={nature ? t(`natures.${nature.toLowerCase()}.name`) : ""}
                    slotProps={{
                      input: {
                        readOnly: true,
                        endAdornment: (
                          <ArrowDropDown
                            sx={{
                              color: "action.active",
                              mr: -0.5,
                              transform: isNaturePopoverOpen ? "rotate(180deg)" : "none",
                              transition: "transform 0.2s",
                            }}
                          />
                        ),
                      },
                    }}
                    onClick={(e) =>
                      setNatureAnchorEl(e.currentTarget as unknown as HTMLButtonElement)
                    }
                    sx={{
                      width: "100%",
                      cursor: "pointer",
                      "& .MuiInputBase-root": { cursor: "pointer" },
                      "& .MuiOutlinedInput-root": {
                        ...(isNaturePopoverOpen && {
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: "primary.main",
                            borderWidth: 2,
                          },
                        }),
                      },
                      "& .MuiInputLabel-root": {
                        ...(isNaturePopoverOpen && { color: "primary.main" }),
                      },
                    }}
                  />

                  <Popover
                    open={isNaturePopoverOpen}
                    anchorEl={natureAnchorEl}
                    onClose={() => setNatureAnchorEl(null)}
                    anchorOrigin={{
                      vertical: "bottom",
                      horizontal: "left",
                    }}
                    slotProps={{
                      paper: {
                        sx: {
                          p: 1,
                          mt: 0.5,
                          maxWidth: "95vw",
                          overflowX: "auto",
                          bgcolor: "background.paperRaised",
                          border: "1px solid",
                          borderColor: theme.palette.divider,
                          boxShadow: theme.shadows[4],
                        },
                      },
                    }}
                  >
                    <TableContainer component={Paper} elevation={0} sx={{ bgcolor: "transparent" }}>
                      <Table
                        size="small"
                        sx={{
                          "& .MuiTableCell-root": {
                            p: 1,
                            textAlign: "center",
                            minWidth: 80,
                            fontSize: "0.8rem",
                            border: `1px solid ${theme.palette.dividerSoft}`,
                          },
                        }}
                      >
                        <TableHead>
                          <TableRow>
                            <TableCell
                              sx={{
                                fontWeight: "bold",
                                bgcolor: "background.paperTint",
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{ fontSize: "0.65rem", fontWeight: "bold" }}
                              >
                                <Box component="span" color="error.main">
                                  +
                                </Box>{" "}
                                {t("teamBuilder.increase")} /{" "}
                                <Box component="span" color="info.main">
                                  -
                                </Box>{" "}
                                {t("teamBuilder.decrease")}
                              </Typography>
                            </TableCell>
                            {STAT_LABELS.map((col) => (
                              <TableCell
                                key={col}
                                sx={{
                                  fontWeight: "bold",
                                  color: "info.main",
                                  bgcolor: alpha(theme.palette.info.main, 0.05),
                                }}
                              >
                                {t(`teamBuilder.status.${col}.name`)} (-)
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {STAT_LABELS.map((row) => (
                            <TableRow key={row}>
                              <TableCell
                                sx={{
                                  fontWeight: "bold",
                                  color: "error.main",
                                  bgcolor: alpha(theme.palette.error.main, 0.05),
                                }}
                              >
                                {t(`teamBuilder.status.${row}.name`)} (+)
                              </TableCell>
                              {STAT_LABELS.map((col) => {
                                const currentCellNature = NATURE_MATRIX[row][col];
                                const isSelectable = currentCellNature !== null;
                                const isSelected = isSelectable && nature === currentCellNature;

                                return (
                                  <TableCell
                                    key={col}
                                    onClick={() => {
                                      if (!isSelectable) return;
                                      handleUpdate({
                                        ...ongoing,
                                        nature: natureStringToObject(currentCellNature),
                                      });
                                      setNatureAnchorEl(null);
                                    }}
                                    sx={{
                                      cursor: isSelectable ? "pointer" : "default",
                                      fontWeight: isSelected ? 700 : 400,
                                      bgcolor: isSelected
                                        ? alpha(theme.palette.primary.main, 0.15)
                                        : !isSelectable
                                          ? alpha(theme.palette.action.disabledBackground, 0.3)
                                          : "transparent",
                                      color: isSelected
                                        ? theme.palette.primary.main
                                        : !isSelectable
                                          ? "text.disabled"
                                          : "text.primary",
                                      transition: "all 0.1s",
                                      outline: isSelected
                                        ? `2px solid ${theme.palette.primary.main}`
                                        : undefined,
                                      outlineOffset: "-2px",
                                      "&:hover": {
                                        bgcolor: isSelected
                                          ? alpha(theme.palette.primary.main, 0.2)
                                          : isSelectable
                                            ? alpha(theme.palette.primary.main, 0.08)
                                            : alpha(theme.palette.action.disabledBackground, 0.3),
                                      },
                                    }}
                                  >
                                    {isSelectable
                                      ? t(`natures.${currentCellNature.toLowerCase()}.name`)
                                      : "—"}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Popover>
                </Box>
              </Stack>
            </Stack>

            <Divider textAlign={"left"}>
              <Typography variant="h6">{t("teamBuilder.sectionMoves")}</Typography>
            </Divider>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
                gap: 2,
              }}
            >
              {[0, 1, 2, 3].map((index) => {
                const currentMoveId = ongoing.moves[index];
                const moveInfo = currentMoveId ? moveById.get(currentMoveId) : null;
                const isActive = activeMoveSlot === index;

                return (
                  <Box
                    key={index}
                    sx={{
                      p: 1.5,
                      cursor: "pointer",
                      borderRadius: 2,
                      py: 2,
                      px: 4,
                      bgcolor: isActive
                        ? alpha(theme.palette.primary.main, 0.1)
                        : alpha(theme.palette.action.hover, 0.05),
                      "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.15) },
                    }}
                    onClick={() => handleDrawerOpen(index)}
                  >
                    {moveInfo ? (
                      <Stack
                        direction="row"
                        sx={{ ...flexRowCenter, justifyContent: "space-between" }}
                      >
                        <Stack direction="row" spacing={1} sx={flexRowCenter}>
                          <Avatar src={typeIcon(moveInfo.type)} sx={{ width: 20, height: 20 }} />
                          <Typography sx={{ fontWeight: 500 }}>
                            {t(`moves.${moveInfo.identifier}.name`)}
                          </Typography>
                        </Stack>
                        <Tooltip title={t("teamBuilder.forgetMove")}>
                          <IconButton
                            size="small"
                            onClick={(e) => handleClearMove(e, index)}
                            sx={{
                              color: theme.palette.divider,
                              "&:hover": {
                                color: "error.main",
                                bgcolor: alpha(theme.palette.error.main, 0.1),
                              },
                            }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    ) : (
                      <Typography color="text.secondary" sx={{ fontStyle: "italic", py: 0.5 }}>
                        {t("teamBuilder.selectMove", { number: index + 1 })}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Stack>
        </Box>

        {/* タブ 1: EV Spreads */}
        <Box sx={{ display: activeTab === 1 ? "block" : "none" }}>
          <Stack spacing={{ xs: 1.5, md: 1.5 }}>
            <Stack
              direction="row"
              sx={{
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              <Typography variant="h6">{t("teamBuilder.tabEvSpreads")}</Typography>

              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <Tooltip title={t("teamBuilder.survivalTuningTooltip")}>
                  <Button
                    variant="outlined"
                    size="small"
                    color="secondary"
                    startIcon={<Shield sx={{ fontSize: "1rem" }} />}
                    onClick={() => setSurvivalModalOpen(true)}
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      px: 1.5,
                      py: 0.5,
                      borderRadius: 1.5,
                    }}
                  >
                    {t("teamBuilder.survivalTuning")}
                  </Button>
                </Tooltip>

                <Tooltip title={t("teamBuilder.optimizeBulkTooltip")}>
                  <Button
                    variant="outlined"
                    size="small"
                    color="primary"
                    onClick={handleOptimizeBulk}
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      px: 1.5,
                      py: 0.5,
                      borderRadius: 1.5,
                    }}
                  >
                    {t("teamBuilder.optimizeBulk")}
                  </Button>
                </Tooltip>

                <Tooltip title={t("teamBuilder.optimizeBulkSettings")}>
                  <IconButton
                    size="small"
                    onClick={(e) => setBulkSettingsAnchorEl(e.currentTarget)}
                    sx={{
                      color:
                        defMultiplier !== 1.0 || spdMultiplier !== 1.0
                          ? "primary.main"
                          : "text.secondary",
                      "&:hover": { color: "primary.main" },
                    }}
                  >
                    <Badge
                      color="primary"
                      variant="dot"
                      invisible={defMultiplier === 1.0 && spdMultiplier === 1.0}
                    >
                      <Tune fontSize="small" />
                    </Badge>
                  </IconButton>
                </Tooltip>

                <Popover
                  open={isBulkSettingsOpen}
                  anchorEl={bulkSettingsAnchorEl}
                  onClose={() => setBulkSettingsAnchorEl(null)}
                  anchorOrigin={{
                    vertical: "bottom",
                    horizontal: "right",
                  }}
                  transformOrigin={{
                    vertical: "top",
                    horizontal: "right",
                  }}
                  slotProps={{
                    paper: {
                      sx: {
                        p: 2.5,
                        width: 300,
                        borderRadius: 2,
                        boxShadow: theme.shadows[8],
                      },
                    },
                  }}
                >
                  <Stack spacing={2}>
                    <Stack
                      direction="row"
                      sx={{ justifyContent: "space-between", alignItems: "center" }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {t("teamBuilder.optimizeBulkSettings")}
                      </Typography>
                      {(defMultiplier !== 1.0 || spdMultiplier !== 1.0) && (
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => {
                            setDefMultiplier(1.0);
                            setSpdMultiplier(1.0);
                          }}
                          sx={{
                            fontSize: "0.7rem",
                            p: 0,
                            minWidth: "auto",
                            textTransform: "none",
                          }}
                        >
                          {t("teamBuilder.bulkMultiplierReset")}
                        </Button>
                      )}
                    </Stack>

                    <Box>
                      <Stack
                        direction="row"
                        sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {t("teamBuilder.bulkRatio")}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          {t("teamBuilder.bulkPhysicalShort")} {Math.round(physicalRatio * 100)} :{" "}
                          {Math.round((1 - physicalRatio) * 100)}{" "}
                          {t("teamBuilder.bulkSpecialShort")}
                        </Typography>
                      </Stack>

                      <Slider
                        value={physicalRatio}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(_, val) => setPhysicalRatio(val as number)}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                        sx={{ color: "primary.main" }}
                      />

                      <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}
                      >
                        {[
                          { label: "100:0", ratio: 1.0 },
                          { label: "70:30", ratio: 0.7 },
                          { label: "50:50", ratio: 0.5 },
                          { label: "30:70", ratio: 0.3 },
                          { label: "0:100", ratio: 0.0 },
                        ].map((preset) => (
                          <Chip
                            key={preset.label}
                            label={preset.label}
                            size="small"
                            clickable
                            color={physicalRatio === preset.ratio ? "primary" : "default"}
                            variant={physicalRatio === preset.ratio ? "filled" : "outlined"}
                            onClick={() => setPhysicalRatio(preset.ratio)}
                            sx={{ fontSize: "0.75rem" }}
                          />
                        ))}
                      </Stack>
                    </Box>

                    <Divider />

                    <Box>
                      <Stack
                        direction="row"
                        sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.75 }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {t("teamBuilder.bulkDefMultiplier")}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            color: defMultiplier !== 1.0 ? "primary.main" : "text.primary",
                          }}
                        >
                          {defMultiplier}x
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                        {[
                          { label: t("teamBuilder.bulkMultiplierNormal"), value: 1.0 },
                          { label: t("teamBuilder.bulkMultiplier1_5"), value: 1.5 },
                          { label: t("teamBuilder.bulkMultiplier2_0"), value: 2.0 },
                        ].map((preset) => (
                          <Chip
                            key={preset.value}
                            label={preset.label}
                            size="small"
                            clickable
                            color={defMultiplier === preset.value ? "primary" : "default"}
                            variant={defMultiplier === preset.value ? "filled" : "outlined"}
                            onClick={() => setDefMultiplier(preset.value)}
                            sx={{ fontSize: "0.75rem" }}
                          />
                        ))}
                      </Stack>
                    </Box>

                    <Box>
                      <Stack
                        direction="row"
                        sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.75 }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {t("teamBuilder.bulkSpdMultiplier")}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            color: spdMultiplier !== 1.0 ? "primary.main" : "text.primary",
                          }}
                        >
                          {spdMultiplier}x
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                        {[
                          { label: t("teamBuilder.bulkMultiplierNormal"), value: 1.0 },
                          { label: t("teamBuilder.bulkMultiplier1_5"), value: 1.5 },
                          { label: t("teamBuilder.bulkMultiplier2_0"), value: 2.0 },
                        ].map((preset) => (
                          <Chip
                            key={preset.value}
                            label={preset.label}
                            size="small"
                            clickable
                            color={spdMultiplier === preset.value ? "primary" : "default"}
                            variant={spdMultiplier === preset.value ? "filled" : "outlined"}
                            onClick={() => setSpdMultiplier(preset.value)}
                            sx={{ fontSize: "0.75rem" }}
                          />
                        ))}
                      </Stack>
                    </Box>

                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => {
                        handleOptimizeBulk();
                        setBulkSettingsAnchorEl(null);
                      }}
                      sx={{ textTransform: "none", fontWeight: 600 }}
                    >
                      {t("teamBuilder.apply")}
                    </Button>
                  </Stack>
                </Popover>
              </Stack>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              {isLintOn &&
                issue &&
                issue.status.length > 0 &&
                issue.status.map((issue) => {
                  return (
                    <Alert severity={issue.severity} key={issue.source._tag}>
                      {formatLintIssue(issue, t)}
                    </Alert>
                  );
                })}
            </Stack>
            {isLintOn && issue && issue.status.length > 0 && <Divider sx={{ mb: 4 }} />}

            {/* 1. ループの外で全体の合計使用EVを一度だけ計算する */}
            {(() => {
              const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

              const totalUsedEvs = STAT_KEYS.reduce((sum, key) => {
                const val = ongoing.evs?.[key];
                return sum + (typeof val === "number" && !Number.isNaN(val) ? val : 0);
              }, 0);

              const remainingEvsTotal = MAX_EV_TOTAL - totalUsedEvs;

              const handleNatureToggle = (
                stat: "hp" | "atk" | "def" | "spa" | "spd" | "spe",
                type: "plus" | "minus",
              ) => {
                const currentPlus = ongoing.nature?.plus;
                const currentMinus = ongoing.nature?.minus;

                let newPlus = currentPlus;
                let newMinus = currentMinus;

                if (type === "plus") {
                  newPlus = currentPlus === stat ? undefined : stat; // トグル解除対応
                  if (newMinus === stat) newMinus = undefined; // 矛盾解消
                } else {
                  newMinus = currentMinus === stat ? undefined : stat;
                  if (newPlus === stat) newPlus = undefined;
                }

                const newNature = {
                  plus: newPlus,
                  minus: newMinus,
                };

                handleUpdate({
                  ...ongoing,
                  nature: newNature,
                });
              };

              return (
                <>
                  {STAT_KEYS.map((stat) => {
                    const statLens = getStatLens(stat);
                    const statIndex = STAT_KEYS.indexOf(stat);
                    const rawEv = statLens.get(ongoing);
                    const currentEv = typeof rawEv === "number" && !Number.isNaN(rawEv) ? rawEv : 0;

                    const maxAvailable = Math.min(MAX_EV_PER_STAT, remainingEvsTotal + currentEv);

                    const updateEv = (newValue: number) => {
                      const safeValue = Number.isNaN(newValue) ? 0 : newValue;
                      const clampedValue = Math.min(maxAvailable, Math.max(0, safeValue));
                      const updatedPokemon = statLens.set(clampedValue as EV)(ongoing);
                      handleUpdate(updatedPokemon);
                    };

                    const isPlus = ongoing.nature?.plus === stat;
                    const isMinus = ongoing.nature?.minus === stat;
                    const natureMultiplier = isPlus ? 1.1 : isMinus ? 0.9 : 1.0;

                    // 効率的なEV投資ポイントを算出（フォルムチェンジ等で activePokemon.status が変わった場合も即時反映）
                    let efficientMarks: { value: number }[] | false = false;
                    if (stat !== "hp" && isPlus) {
                      const marks: { value: number }[] = [];
                      for (let v = 0; v <= MAX_EV_PER_STAT; v++) {
                        // 補正なし(1.0)の生ステータスを計算
                        const raw = calcStatus(activePokemon.status[statIndex], v, 1.0);
                        if (raw % 10 === 0) {
                          marks.push({ value: v });
                        }
                      }
                      if (marks.length > 0) {
                        efficientMarks = marks;
                      }
                    }

                    return (
                      <Box
                        key={stat}
                        sx={{
                          display: "grid",
                          alignItems: "center",
                          columnGap: { xs: 1, md: 2.5 },
                          rowGap: { xs: 0.5, md: 0.5 },
                          gridTemplateColumns: {
                            xs: "min-content 1fr auto auto",
                            md: "86px 1fr auto 56px",
                          },
                          gridTemplateAreas: {
                            xs: `"label label number value" "slider slider slider slider"`,
                            md: `"label slider number value"`,
                          },
                          border: { xs: "none", md: "1px solid" },
                          borderColor: isPlus
                            ? alpha(theme.palette.error.main, 0.2)
                            : isMinus
                              ? alpha(theme.palette.info.main, 0.2)
                              : theme.palette.dividerSoft,
                          bgcolor: {
                            xs: "transparent",
                            md: "background.paperTint",
                          },
                          transition: "border-color 0.2s, background-color 0.2s",
                          p: { xs: 1, md: 2 },
                          borderRadius: { xs: 0, md: 2 },
                        }}
                      >
                        {/* ステータス名と性格補正トグル */}
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{
                            gridArea: "label",
                            alignItems: "center",
                            minWidth: 0,
                            flexWrap: "nowrap",
                          }}
                        >
                          <Typography
                            sx={{
                              fontWeight: "bold",
                              textTransform: "uppercase",
                              lineHeight: 1,
                            }}
                          >
                            {t(`teamBuilder.status.${stat}.name`)}
                          </Typography>
                          {stat !== "hp" && (
                            <Stack direction="row" spacing={0.25}>
                              {/* プラス補正ボタン */}
                              <Box
                                onClick={() => handleNatureToggle(stat, "plus")}
                                role="button"
                                aria-label={`${stat} +`}
                                aria-pressed={isPlus}
                                sx={{
                                  display: "flex",
                                  cursor: "pointer",
                                  userSelect: "none",
                                  color: isPlus ? "error.main" : "text.secondary",
                                  bgcolor: isPlus
                                    ? alpha(theme.palette.error.main, 0.12)
                                    : "transparent",
                                  transition: "all 0.2s",
                                  "&:hover": {
                                    bgcolor: alpha(theme.palette.error.main, 0.12),
                                  },
                                  borderRadius: 1,
                                  p: { xs: 0.25, md: 0 },
                                }}
                              >
                                <Add
                                  sx={{
                                    fontSize: "1.1rem",
                                    stroke: "currentColor",
                                    strokeWidth: 1,
                                  }}
                                />
                              </Box>

                              {/* マイナス補正ボタン */}
                              <Box
                                onClick={() => handleNatureToggle(stat, "minus")}
                                role="button"
                                aria-label={`${stat} -`}
                                aria-pressed={isMinus}
                                sx={{
                                  display: "flex",
                                  cursor: "pointer",
                                  userSelect: "none",
                                  color: isMinus ? "info.main" : "text.secondary",
                                  bgcolor: isMinus
                                    ? alpha(theme.palette.info.main, 0.12)
                                    : "transparent",
                                  transition: "all 0.2s",
                                  "&:hover": {
                                    bgcolor: alpha(theme.palette.info.main, 0.12),
                                  },
                                  borderRadius: 1,
                                  p: { xs: 0.25, md: 0 },
                                }}
                              >
                                <Remove
                                  sx={{
                                    fontSize: "1.1rem",
                                    stroke: "currentColor",
                                    strokeWidth: 1,
                                  }}
                                />
                              </Box>
                            </Stack>
                          )}
                        </Stack>
                        <Slider
                          value={currentEv}
                          step={1}
                          min={0}
                          max={MAX_EV_PER_STAT}
                          disabled={maxAvailable <= 0 && currentEv === 0}
                          onChange={(_, value) => updateEv(value as number)}
                          marks={efficientMarks || false}
                          sx={{
                            gridArea: "slider",
                            color: "primary.main",
                            "& .MuiSlider-mark": {
                              backgroundColor: "error.main",
                              width: 3,
                              height: 10,
                              borderRadius: 1,
                            },
                            "& .MuiSlider-markActive": {
                              backgroundColor: "error.dark",
                            },
                          }}
                        />

                        <Box
                          sx={{
                            gridArea: "number",
                            width: { xs: 72, md: 96 },
                            display: "flex",
                            alignItems: "center",
                            "& .MuiFormControl-root": { width: "100%" },
                            "& .MuiInputBase-root": { width: "100%" },
                            "& .MuiInputBase-input": {
                              flex: 1,
                              width: "auto",
                              minWidth: 0,
                              textAlign: "center",
                            },
                          }}
                        >
                          <NumberField
                            aria-label={t(`teamBuilder.status.${stat}.name`)}
                            min={0}
                            max={maxAvailable}
                            step={1}
                            value={currentEv}
                            size="small"
                            onValueChange={(val) => {
                              const parsed = Number(val);
                              updateEv(parsed);
                            }}
                          />
                        </Box>

                        <Typography
                          variant={"h5"}
                          sx={{
                            gridArea: "value",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                            color: isPlus ? "error.main" : isMinus ? "info.main" : "inherit",
                          }}
                        >
                          {match(stat)
                            .with("hp", () => calcHp(activePokemon.status[0], currentEv))
                            .with("atk", () =>
                              calcStatus(activePokemon.status[1], currentEv, natureMultiplier),
                            )
                            .with("def", () =>
                              calcStatus(activePokemon.status[2], currentEv, natureMultiplier),
                            )
                            .with("spa", () =>
                              calcStatus(activePokemon.status[3], currentEv, natureMultiplier),
                            )
                            .with("spd", () =>
                              calcStatus(activePokemon.status[4], currentEv, natureMultiplier),
                            )
                            .with("spe", () =>
                              calcStatus(activePokemon.status[5], currentEv, natureMultiplier),
                            )
                            .exhaustive()}
                        </Typography>
                      </Box>
                    );
                  })}

                  <Divider />

                  <Typography>
                    {t("teamBuilder.remainingEvs", { remaining: remainingEvs })}
                  </Typography>
                </>
              );
            })()}
          </Stack>
        </Box>
      </Box>

      {/* --- 技選択 Drawer --- */}
      <MoveSelectionDrawer
        open={drawerOpen}
        activeSlot={activeMoveSlot}
        onClose={handleDrawerClose}
        onChangeSlot={setActiveMoveSlot}
        onSelectMove={handleSelectMove}
        ongoing={ongoing!}
        pokemon={pokemon}
        battleData={battleData}
        isError={isError}
      />

      {/* --- 仮想敵耐え調整 Modal --- */}
      <SurvivalTuningModal
        open={survivalModalOpen}
        onClose={() => setSurvivalModalOpen(false)}
        onApply={(evs) => {
          handleUpdate({
            ...ongoing,
            evs: {
              ...ongoing.evs,
              hp: evs.hp,
              def: evs.def,
              spd: evs.spd,
            },
          });
        }}
        ongoing={ongoing!}
        activePokemon={activePokemon}
        remainingEvs={remainingEvs}
      />
    </Stack>
  );
}
