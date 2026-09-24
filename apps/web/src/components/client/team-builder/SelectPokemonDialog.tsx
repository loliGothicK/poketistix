import {
  alpha,
  Avatar,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import Search from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { championsPokemonList, type ChampionsPokemon } from "@/data/champions-pokemon";
import { ComponentProps, useRef, useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { typeIcon } from "@/lib/image";
import {
  matchesQueryTokens,
  QueryableAutocomplete,
  type QueryFieldDefinition,
  type QueryToken,
} from "@/components/common/queryable-autocomplete";
import { useBoxData } from "@/hooks/useBoxData";
import { useAtomValue } from "jotai";
import { isAuthenticatedAtom } from "@/store/auth";
import type { TrainedPokemon } from "@/store/team/team";
import type { TFunction } from "i18next";
import { useTheme } from "@mui/material/styles";
import { itemById } from "@/data/items";
import { moveById } from "@/data/moves";
import { itemSprite } from "@/lib/image";
import Image from "next/image";
import { formatEvsAndNature } from "@/components/client/damage-calc/LoadFromBoxDialog";

type SelectPokemonDialogProps = Pick<ComponentProps<typeof Dialog>, "open" | "onClose"> & {
  readonly title: string;
  readonly onChange: (identifier: string | null) => void;
  readonly translator: TFunction;
  readonly onSelectFromBox?: (pokemon: TrainedPokemon) => void;
  readonly excludedIdentifiers?: string[];
  readonly initialTab?: "master" | "box";
};

/** Cap the rendered result rows so a broad filter can't tank the dialog. */
const MAX_RESULTS = 100;

export function SelectPokemonDialog({
  title,
  open,
  onClose,
  onChange,
  translator,
  onSelectFromBox,
  excludedIdentifiers,
  initialTab,
}: SelectPokemonDialogProps) {
  const { t, i18n } = useTranslation();
  const [tokens, setTokens] = useState<QueryToken[]>([]);
  const [tab, setTab] = useState<"master" | "box">(initialTab ?? "master");
  const [boxSearch, setBoxSearch] = useState("");
  const { box, isLoading } = useBoxData();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const showBoxTab = Boolean(onSelectFromBox);
  const activeTab = showBoxTab ? tab : "master";
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [prevOpen, setPrevOpen] = useState(open);
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);
  if (open !== prevOpen || initialTab !== prevInitialTab) {
    setPrevOpen(open);
    setPrevInitialTab(initialTab);
    if (open) {
      setTab(initialTab ?? "master");
      setBoxSearch("");
    }
  }

  // オートフォーカス用: Dialog が完全に開いた後に input を focus する
  const autocompleteInputRef = useRef<HTMLInputElement>(null);
  const boxSearchInputRef = useRef<HTMLInputElement>(null);

  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleDialogEntered = () => {
    setHighlightedIndex(0);
    if (activeTab === "master") {
      autocompleteInputRef.current?.focus();
    } else {
      boxSearchInputRef.current?.focus();
    }
  };

  const pokemonOptions = useMemo(() => {
    const forms = championsPokemonList
      .filter(({ form }) => form !== undefined)
      .map(({ form }) => form!);

    return championsPokemonList
      .filter(({ id, identifier }) => !identifier.includes("-mega") && !forms.includes(id))
      .filter(({ identifier }) => !excludedIdentifiers?.includes(identifier))
      .toSorted((a, b) =>
        t(`pokemon.${a.identifier}.name`).localeCompare(t(`pokemon.${b.identifier}.name`)),
      );
  }, [t, excludedIdentifiers]);

  // The only queryable field for now is `type`, populated with the types that
  // actually appear in the option set. Labels are localized via the translator.
  const fields: QueryFieldDefinition[] = useMemo(() => {
    const seen = new Set<string>();
    for (const pokemon of pokemonOptions) {
      for (const type of pokemon.types) {
        seen.add(type);
      }
    }

    return [
      {
        key: "type",
        label: translator("teamBuilder.query.type"),
        values: Array.from(seen)
          .sort()
          .map((type) => ({ value: type, label: translator(type) })),
      },
    ];
  }, [pokemonOptions, translator]);

  // Each pokemon is matched by name (identifier + localized name) and by type.
  const results = useMemo(() => {
    const matched = pokemonOptions.filter((pokemon) =>
      matchesQueryTokens(
        {
          text: `${pokemon.identifier} ${translator(`pokemon.${pokemon.identifier}.name`)} ${i18n.exists(`pokemon.${pokemon.identifier}.formName`) ? translator(`pokemon.${pokemon.identifier}.formName`) : ""}`,
          fields: { type: [...pokemon.types] },
        },
        tokens,
      ),
    );

    return { matched, visible: matched.slice(0, MAX_RESULTS) };
  }, [pokemonOptions, tokens, translator, i18n]);

  const filteredBox = useMemo(() => {
    let result = box;
    if (excludedIdentifiers && excludedIdentifiers.length > 0) {
      result = result.filter((p) => !excludedIdentifiers.includes(p.identifier));
    }
    const trimmed = boxSearch.trim().toLowerCase();
    if (!trimmed) return result;
    return result.filter((p) => {
      const name = translator(`pokemon.${p.identifier}.name`).toLowerCase();
      if (name.includes(trimmed) || p.identifier.toLowerCase().includes(trimmed)) return true;

      if (i18n.exists(`pokemon.${p.identifier}.formName`)) {
        const formName = translator(`pokemon.${p.identifier}.formName`).toLowerCase();
        if (formName.includes(trimmed)) return true;
      }

      // Item search
      if (p.item) {
        const item = itemById.get(p.item);
        if (item) {
          const itemName = translator(`items.${item.identifier}.name`).toLowerCase();
          if (itemName.includes(trimmed) || item.identifier.toLowerCase().includes(trimmed))
            return true;
        }
      }

      // Move search
      for (const moveId of p.moves) {
        if (moveId !== null) {
          const m = moveById.get(moveId);
          if (m) {
            const moveName = translator(`moves.${m.identifier}.name`).toLowerCase();
            if (moveName.includes(trimmed) || m.identifier.toLowerCase().includes(trimmed))
              return true;
          }
        }
      }

      return false;
    });
  }, [box, boxSearch, translator, i18n, excludedIdentifiers]);

  const searchResultKey = `${activeTab}:${results.visible.length}:${filteredBox.length}:${tokens.length}:${boxSearch}`;
  const [prevSearchResultKey, setPrevSearchResultKey] = useState(searchResultKey);

  if (prevSearchResultKey !== searchResultKey) {
    setPrevSearchResultKey(searchResultKey);
    setHighlightedIndex(0);
  }

  useEffect(() => {
    const el = itemRefs.current[highlightedIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const handleSelect = (pokemon: ChampionsPokemon) => {
    onChange(pokemon.identifier);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (activeTab === "master") {
      if (results.visible.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, results.visible.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        const item = results.visible[highlightedIndex];
        if (item) {
          e.preventDefault();
          e.stopPropagation();
          handleSelect(item);
        }
      }
    } else {
      if (filteredBox.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, filteredBox.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        const item = filteredBox[highlightedIndex];
        if (item) {
          e.preventDefault();
          e.stopPropagation();
          if (onSelectFromBox) {
            onSelectFromBox(item);
          } else {
            onChange(item.identifier);
          }
        }
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: "16px",
            overflow: "hidden",
          },
        },
        transition: { onEntered: handleDialogEntered },
      }}
      sx={{
        "& .MuiDialog-container": {
          alignItems: "flex-start",
          pt: { xs: 3, sm: 8 },
        },
      }}
    >
      <DialogTitle
        sx={{
          m: 0,
          px: { xs: 2, sm: 2.5 },
          py: 1.75,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <IconButton
          aria-label="close"
          onClick={() => onClose?.({}, "backdropClick")}
          size="small"
          sx={{ color: "text.secondary", "&:hover": { color: "text.primary" } }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {showBoxTab && (
        <Tabs
          value={tab}
          onChange={(_, v: "master" | "box") => setTab(v)}
          sx={{
            px: { xs: 2, sm: 2.5 },
            minHeight: 40,
            "& .MuiTab-root": {
              minHeight: 40,
              py: 0.5,
              textTransform: "none",
              fontWeight: 600,
            },
          }}
        >
          <Tab value="master" label={translator("teamBuilder.selectPokemon")} />
          <Tab value="box" label={translator("box.title")} />
        </Tabs>
      )}

      <Divider />

      <DialogContent sx={{ p: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeTab === "master" ? (
          <>
            <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: 2, pb: 1.5 }}>
              <QueryableAutocomplete
                fields={fields}
                onTokensChange={setTokens}
                label={translator("teamBuilder.query.label")}
                placeholder={translator("teamBuilder.query.placeholder")}
                helperText={translator("teamBuilder.query.helper")}
                textFieldProps={{ inputRef: autocompleteInputRef, onKeyDown: handleKeyDown }}
              />
            </Box>

            <Divider />

            <Box
              sx={{
                maxHeight: 380,
                overflowY: "auto",
                "&::-webkit-scrollbar": {
                  width: "6px",
                },
                "&::-webkit-scrollbar-thumb": {
                  borderRadius: "3px",
                  bgcolor: (t) => alpha(t.palette.text.primary, 0.15),
                },
              }}
            >
              {results.matched.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", py: 5, textAlign: "center" }}
                >
                  {translator("teamBuilder.query.noResults")}
                </Typography>
              ) : (
                <Box component="div">
                  {results.visible.map((pokemon, index) => {
                    const isSelected = index === highlightedIndex;
                    return (
                      <Stack
                        key={pokemon.id}
                        ref={(el) => {
                          itemRefs.current[index] = el;
                        }}
                        direction="row"
                        onClick={() => handleSelect(pokemon)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        sx={{
                          alignItems: "center",
                          gap: 1.5,
                          px: { xs: 2, sm: 2.5 },
                          py: 1.25,
                          cursor: "pointer",
                          bgcolor: isSelected
                            ? alpha(theme.palette.primary.main, 0.1)
                            : "transparent",
                          borderBottom: "1px solid",
                          borderColor: (t) => alpha(t.palette.divider, 0.4),
                          transition: "background-color 0.12s ease",
                          "&:hover": {
                            bgcolor: isSelected
                              ? alpha(theme.palette.primary.main, 0.15)
                              : alpha(theme.palette.text.primary, 0.04),
                          },
                          "&:last-of-type": {
                            borderBottom: "none",
                          },
                        }}
                      >
                        {/* Selection Accent Bar */}
                        <Box
                          sx={{
                            width: 3.5,
                            height: 26,
                            borderRadius: "2px",
                            bgcolor: isSelected ? theme.palette.primary.main : "transparent",
                            flexShrink: 0,
                            transition: "background-color 0.12s ease",
                          }}
                        />

                        <Avatar
                          src={`/pokemon/${pokemon.identifier}.png`}
                          alt={pokemon.identifier}
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: "8px",
                            bgcolor: alpha(theme.palette.text.primary, 0.03),
                            p: 0.25,
                            flexShrink: 0,
                            "& img": { objectFit: "contain" },
                          }}
                        />

                        <Box sx={{ minWidth: 0, flexGrow: 1, mr: 1.5 }}>
                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: isSelected ? 700 : 600,
                              color: isSelected ? theme.palette.primary.main : "text.primary",
                              transition: "color 0.12s ease",
                            }}
                            noWrap
                          >
                            {translator(`pokemon.${pokemon.identifier}.name`)}
                          </Typography>
                          {i18n.exists(`pokemon.${pokemon.identifier}.formName`) && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: "text.secondary",
                                display: "block",
                                fontSize: "0.75rem",
                              }}
                              noWrap
                            >
                              {translator(`pokemon.${pokemon.identifier}.formName`)}
                            </Typography>
                          )}
                        </Box>

                        <Stack
                          direction="row"
                          spacing={0.75}
                          sx={{ alignItems: "center", flexShrink: 0 }}
                        >
                          {pokemon.types.map((type) =>
                            isMobile ? (
                              <Avatar
                                key={type}
                                src={typeIcon(type)}
                                sx={{ width: 24, height: 24 }}
                              />
                            ) : (
                              <Chip
                                key={type}
                                avatar={
                                  <Avatar
                                    src={typeIcon(type)}
                                    sx={{ width: "16px !important", height: "16px !important" }}
                                  />
                                }
                                label={translator(type)}
                                size="small"
                                sx={{
                                  height: 26,
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  borderRadius: "6px",
                                }}
                              />
                            ),
                          )}
                        </Stack>
                      </Stack>
                    );
                  })}
                </Box>
              )}

              {results.matched.length > results.visible.length ? (
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", display: "block", py: 1.5, textAlign: "center" }}
                >
                  {translator("teamBuilder.query.more")}
                </Typography>
              ) : null}
            </Box>
          </>
        ) : (
          <>
            <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: 2, pb: 1.5 }}>
              <TextField
                size="small"
                fullWidth
                placeholder={translator("box.searchPlaceholder")}
                value={boxSearch}
                onChange={(e) => setBoxSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                inputRef={boxSearchInputRef}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>

            <Divider />

            <Box
              sx={{
                maxHeight: 460,
                overflowY: "auto",
                "&::-webkit-scrollbar": {
                  width: "6px",
                },
                "&::-webkit-scrollbar-thumb": {
                  borderRadius: "3px",
                  bgcolor: (t) => alpha(t.palette.text.primary, 0.15),
                },
              }}
            >
              {!isAuthenticated ? (
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", py: 5, textAlign: "center" }}
                >
                  {translator("damageCalc.loginRequiredForBox")}
                </Typography>
              ) : isLoading ? (
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", py: 5, textAlign: "center" }}
                >
                  {translator("common.loading")}
                </Typography>
              ) : box.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", py: 5, textAlign: "center" }}
                >
                  {translator("box.empty")}
                </Typography>
              ) : filteredBox.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", py: 5, textAlign: "center" }}
                >
                  {translator("box.noResults")}
                </Typography>
              ) : (
                <Box component="div">
                  {filteredBox.map((pokemon, index) => {
                    const isSelected = index === highlightedIndex;
                    const item = pokemon.item ? itemById.get(pokemon.item) : null;
                    const isFormNameExists = i18n.exists(`pokemon.${pokemon.identifier}.formName`);

                    return (
                      <Stack
                        key={pokemon.boxId}
                        ref={(el) => {
                          itemRefs.current[index] = el;
                        }}
                        direction="row"
                        onClick={() => {
                          if (onSelectFromBox) {
                            onSelectFromBox(pokemon);
                          } else {
                            onChange(pokemon.identifier);
                          }
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        sx={{
                          alignItems: "center",
                          gap: 1.5,
                          px: { xs: 2, sm: 2.5 },
                          py: 1.5,
                          cursor: "pointer",
                          bgcolor: isSelected
                            ? alpha(theme.palette.primary.main, 0.1)
                            : "transparent",
                          borderBottom: "1px solid",
                          borderColor: (t) => alpha(t.palette.divider, 0.4),
                          transition: "background-color 0.12s ease",
                          "&:hover": {
                            bgcolor: isSelected
                              ? alpha(theme.palette.primary.main, 0.15)
                              : alpha(theme.palette.text.primary, 0.04),
                          },
                          "&:last-of-type": {
                            borderBottom: "none",
                          },
                        }}
                      >
                        {/* Selection Accent Bar */}
                        <Box
                          sx={{
                            width: 3.5,
                            height: 38,
                            borderRadius: "2px",
                            bgcolor: isSelected ? theme.palette.primary.main : "transparent",
                            flexShrink: 0,
                            transition: "background-color 0.12s ease",
                          }}
                        />

                        {/* Pokemon avatar with item icon */}
                        <Box sx={{ position: "relative", flexShrink: 0 }}>
                          <Avatar
                            src={`/pokemon/${pokemon.identifier}.png`}
                            alt={pokemon.identifier}
                            sx={{
                              width: 48,
                              height: 48,
                              borderRadius: "10px",
                              bgcolor: alpha(theme.palette.text.primary, 0.04),
                              p: 0.25,
                              "& img": { objectFit: "contain", imageRendering: "pixelated" },
                            }}
                          />
                          {item && (
                            <Box
                              sx={{
                                position: "absolute",
                                bottom: -2,
                                right: -2,
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                bgcolor: "background.paper",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: 1,
                              }}
                            >
                              <Image
                                src={itemSprite(item.identifier)}
                                alt={item.identifier}
                                width={16}
                                height={16}
                              />
                            </Box>
                          )}
                        </Box>

                        {/* Info Column */}
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 700,
                                color: isSelected ? theme.palette.primary.main : "text.primary",
                              }}
                              noWrap
                            >
                              {translator(`pokemon.${pokemon.identifier}.name`)}
                              {isFormNameExists &&
                                ` (${translator(`pokemon.${pokemon.identifier}.formName`)})`}
                            </Typography>
                            {item && (
                              <Typography
                                variant="caption"
                                sx={{ color: "text.secondary", fontWeight: 500 }}
                                noWrap
                              >
                                @ {translator(`items.${item.identifier}.name`)}
                              </Typography>
                            )}
                          </Stack>

                          {/* Stats and Nature */}
                          <Typography
                            variant="caption"
                            sx={{
                              color: "primary.main",
                              fontWeight: 600,
                              display: "block",
                              mt: 0.25,
                              fontSize: "0.75rem",
                            }}
                            noWrap
                          >
                            {formatEvsAndNature(pokemon, translator)}
                          </Typography>

                          {/* Moves */}
                          <Stack
                            direction="row"
                            spacing={0.5}
                            sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}
                          >
                            {pokemon.moves
                              .filter((m): m is number => m !== null)
                              .map((moveId) => {
                                const move = moveById.get(moveId);
                                if (!move) return null;
                                return (
                                  <Chip
                                    key={moveId}
                                    label={translator(`moves.${move.identifier}.name`)}
                                    size="small"
                                    sx={{
                                      height: 20,
                                      fontSize: "0.7rem",
                                      fontWeight: 500,
                                      bgcolor: alpha(theme.palette.text.primary, 0.05),
                                    }}
                                  />
                                );
                              })}
                          </Stack>
                        </Box>
                      </Stack>
                    );
                  })}
                </Box>
              )}
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
