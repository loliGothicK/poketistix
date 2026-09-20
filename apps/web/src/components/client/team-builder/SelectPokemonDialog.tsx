import {
  Avatar,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import Search from "@mui/icons-material/Search";
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

type SelectPokemonDialogProps = Pick<ComponentProps<typeof Dialog>, "open" | "onClose"> & {
  readonly title: string;
  readonly onChange: (identifier: string | null) => void;
  readonly translator: TFunction;
  readonly onSelectFromBox?: (pokemon: TrainedPokemon) => void;
  readonly excludedIdentifiers?: string[];
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
}: SelectPokemonDialogProps) {
  const { t, i18n } = useTranslation();
  const [tokens, setTokens] = useState<QueryToken[]>([]);
  const [tab, setTab] = useState<"master" | "box">("master");
  const [boxSearch, setBoxSearch] = useState("");
  const { box } = useBoxData();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const showBoxTab = isAuthenticated && Boolean(onSelectFromBox);
  const activeTab = showBoxTab ? tab : "master";
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

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
    return result.filter(
      (p) =>
        translator(`pokemon.${p.identifier}.name`).toLowerCase().includes(trimmed) ||
        (i18n.exists(`pokemon.${p.identifier}.formName`)
          ? translator(`pokemon.${p.identifier}.formName`)
          : ""
        )
          .toLowerCase()
          .includes(trimmed) ||
        p.identifier.includes(trimmed),
    );
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
        transition: { onEntered: handleDialogEntered },
      }}
      sx={{
        "& .MuiDialog-container": {
          alignItems: "flex-start",
          pt: 10,
        },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      {showBoxTab && (
        <Tabs value={tab} onChange={(_, v: "master" | "box") => setTab(v)} sx={{ px: 2 }}>
          <Tab value="master" label={translator("teamBuilder.selectPokemon")} />
          <Tab value="box" label={translator("box.title")} />
        </Tabs>
      )}
      <Divider />
      <DialogContent>
        {activeTab === "master" ? (
          <>
            <QueryableAutocomplete
              fields={fields}
              onTokensChange={setTokens}
              label={translator("teamBuilder.query.label")}
              placeholder={translator("teamBuilder.query.placeholder")}
              helperText={translator("teamBuilder.query.helper")}
              textFieldProps={{ inputRef: autocompleteInputRef, onKeyDown: handleKeyDown }}
            />

            <Box
              sx={{
                mt: 2,
                maxHeight: 360,
                overflowY: "auto",
              }}
            >
              {results.matched.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", py: 4, textAlign: "center" }}
                >
                  {translator("teamBuilder.query.noResults")}
                </Typography>
              ) : (
                <Stack divider={<Divider flexItem />}>
                  {results.visible.map((pokemon, index) => (
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
                        gap: 1,
                        px: 1,
                        py: 1,
                        cursor: "pointer",
                        borderRadius: 2,
                        bgcolor: index === highlightedIndex ? "action.selected" : "transparent",
                        outline:
                          index === highlightedIndex
                            ? `2px solid ${theme.palette.primary.main}`
                            : undefined,
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <Chip
                        avatar={<Avatar src={`/pokemon/${pokemon.identifier}.png`} />}
                        label={
                          <>
                            {translator(`pokemon.${pokemon.identifier}.name`)}
                            {i18n.exists(`pokemon.${pokemon.identifier}.formName`) && (
                              <Typography
                                component="span"
                                sx={{
                                  ml: 0.5,
                                  fontSize: "0.8em",
                                  color: "text.secondary",
                                  fontWeight: 400,
                                }}
                              >
                                {translator(`pokemon.${pokemon.identifier}.formName`)}
                              </Typography>
                            )}
                          </>
                        }
                        sx={{
                          height: 48,
                          fontSize: "1.1rem",
                          borderRadius: 24,
                          "& .MuiChip-avatar": {
                            width: 40,
                            height: 40,
                          },
                        }}
                      />
                      <Box sx={{ flexGrow: 1 }} />
                      {pokemon.types.map((type) =>
                        isMobile ? (
                          <Avatar key={type} src={typeIcon(type)} />
                        ) : (
                          <Chip
                            key={type}
                            avatar={<Avatar src={typeIcon(type)} />}
                            label={translator(type)}
                            sx={{
                              height: 40,
                              fontSize: "1rem",
                              "& .MuiChip-avatar": {
                                width: 32,
                                height: 32,
                              },
                            }}
                          />
                        ),
                      )}
                    </Stack>
                  ))}
                </Stack>
              )}

              {results.matched.length > results.visible.length ? (
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", display: "block", py: 1, textAlign: "center" }}
                >
                  {translator("teamBuilder.query.more")}
                </Typography>
              ) : null}
            </Box>
          </>
        ) : (
          <>
            <TextField
              size="small"
              fullWidth
              placeholder={translator("box.searchPlaceholder")}
              value={boxSearch}
              onChange={(e) => setBoxSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              inputRef={boxSearchInputRef}
              sx={{ mb: 2 }}
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
            <Box sx={{ maxHeight: 360, overflowY: "auto" }}>
              {filteredBox.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", py: 4, textAlign: "center" }}
                >
                  {translator("box.empty")}
                </Typography>
              ) : (
                <Stack divider={<Divider flexItem />}>
                  {filteredBox.map((pokemon, index) => (
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
                        gap: 1,
                        px: 1,
                        py: 1,
                        cursor: "pointer",
                        borderRadius: 2,
                        bgcolor: index === highlightedIndex ? "action.selected" : "transparent",
                        outline:
                          index === highlightedIndex
                            ? `2px solid ${theme.palette.primary.main}`
                            : undefined,
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <Chip
                        avatar={<Avatar src={`/pokemon/${pokemon.identifier}.png`} />}
                        label={
                          <>
                            {translator(`pokemon.${pokemon.identifier}.name`)}
                            {i18n.exists(`pokemon.${pokemon.identifier}.formName`) && (
                              <Typography
                                component="span"
                                sx={{
                                  ml: 0.5,
                                  fontSize: "0.8em",
                                  color: "text.secondary",
                                  fontWeight: 400,
                                }}
                              >
                                {translator(`pokemon.${pokemon.identifier}.formName`)}
                              </Typography>
                            )}
                          </>
                        }
                        sx={{
                          height: 48,
                          fontSize: "1.1rem",
                          borderRadius: 24,
                          "& .MuiChip-avatar": { width: 40, height: 40 },
                        }}
                      />
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
