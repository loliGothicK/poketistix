"use client";

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
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import AllInboxRoundedIcon from "@mui/icons-material/AllInboxRounded";
import { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import Image from "next/image";
import { useAtomValue } from "jotai";
import { isAuthenticatedAtom } from "@/store/auth";
import { useBoxData } from "@/hooks/useBoxData";
import { itemById } from "@/data/items";
import { moveById } from "@/data/moves";
import { natureObjectToString } from "@/data/nature";
import { itemSprite } from "@/lib/image";
import type { TrainedPokemon } from "@/store/team/team";
import type { TFunction } from "i18next";

type LoadFromBoxDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelect: (pokemon: TrainedPokemon) => void;
  readonly role: "attacker" | "defender";
};

const STAT_LABELS: Record<string, string> = {
  hp: "H",
  atk: "A",
  def: "B",
  spa: "C",
  spd: "D",
  spe: "S",
};

export function formatEvsAndNature(pokemon: TrainedPokemon, t: TFunction): string {
  const parts: string[] = [];
  const natureStr = natureObjectToString(pokemon.nature);
  const natureName = natureStr ? t(`natures.${natureStr.toLowerCase()}.name`) : "";

  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const val = pokemon.evs[key as keyof typeof pokemon.evs] ?? 0;
    if (val > 0) {
      let suffix = "";
      if (pokemon.nature.plus === key) suffix = "+";
      if (pokemon.nature.minus === key) suffix = "-";
      parts.push(`${label}${val}${suffix}`);
    }
  }

  const evSummary = parts.length > 0 ? parts.join(" ") : "0";
  return natureName ? `${natureName} (${evSummary})` : evSummary;
}

export function LoadFromBoxDialog({ open, onClose, onSelect }: LoadFromBoxDialogProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const { box, isLoading } = useBoxData();
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredBox = useMemo(() => {
    if (!box || box.length === 0) return [];
    const q = search.trim().toLowerCase();
    if (!q) return box;

    return box.filter((p) => {
      const name = t(`pokemon.${p.identifier}.name`).toLowerCase();
      if (name.includes(q) || p.identifier.toLowerCase().includes(q)) return true;

      // Item search
      if (p.item) {
        const item = itemById.get(p.item);
        if (item) {
          const itemName = t(`items.${item.identifier}.name`).toLowerCase();
          if (itemName.includes(q) || item.identifier.toLowerCase().includes(q)) return true;
        }
      }

      // Move search
      for (const moveId of p.moves) {
        if (moveId !== null) {
          const m = moveById.get(moveId);
          if (m) {
            const moveName = t(`moves.${m.identifier}.name`).toLowerCase();
            if (moveName.includes(q) || m.identifier.toLowerCase().includes(q)) return true;
          }
        }
      }

      return false;
    });
  }, [box, search, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredBox.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev < filteredBox.length - 1 ? prev + 1 : 0;
        itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : filteredBox.length - 1;
        itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredBox[highlightedIndex];
      if (selected) {
        onSelect(selected);
        onClose();
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
        transition: {
          onEntered: () => {
            setHighlightedIndex(0);
            searchInputRef.current?.focus();
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1.5,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <AllInboxRoundedIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("damageCalc.loadFromBox")}
          </Typography>
        </Stack>
        <IconButton onClick={onClose} size="small" aria-label={t("common.close")}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {!isAuthenticated ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {t("damageCalc.loginRequiredForBox")}
            </Typography>
          </Box>
        ) : isLoading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {t("common.loading")}
            </Typography>
          </Box>
        ) : box.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {t("damageCalc.boxEmpty")}
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ px: 2.5, py: 1.5 }}>
              <TextField
                size="small"
                fullWidth
                placeholder={t("box.searchPlaceholder")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                inputRef={searchInputRef}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
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
                  bgcolor: (theme) => alpha(theme.palette.text.primary, 0.15),
                },
              }}
            >
              {filteredBox.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", py: 5, textAlign: "center" }}
                >
                  {t("box.noResults")}
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
                          onSelect(pokemon);
                          onClose();
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        sx={{
                          alignItems: "center",
                          gap: 1.5,
                          px: 2.5,
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
                              {t(`pokemon.${pokemon.identifier}.name`)}
                              {isFormNameExists &&
                                ` (${t(`pokemon.${pokemon.identifier}.formName`)})`}
                            </Typography>
                            {item && (
                              <Typography
                                variant="caption"
                                sx={{ color: "text.secondary", fontWeight: 500 }}
                                noWrap
                              >
                                @ {t(`items.${item.identifier}.name`)}
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
                            {formatEvsAndNature(pokemon, t)}
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
                                    label={t(`moves.${move.identifier}.name`)}
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
