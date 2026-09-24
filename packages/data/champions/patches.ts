import pokemonData from "./pokemon.json" with { type: "json" };
import patchesData from "./patches.json" with { type: "json" };
import { REG_M_A, REG_M_B, REG_M_C, Regulation } from "./regulations";

export interface PokemonPatch {
  slug?: string;
  remove_moves?: number[];
  add_moves?: number[];
}

export interface RegulationPatch {
  pokemon?: Record<string, PokemonPatch>;
}

export type PatchesConfig = Record<string, RegulationPatch>;

const patches = patchesData as PatchesConfig;

export type RawPokemonEntry = (typeof pokemonData)["data"][number];

export interface ResolvedPokemon {
  id: number;
  identifier: string;
  slug: string | null;
  types: string[];
  abilities: number[];
  status: [number, number, number, number, number, number];
  moves: number[];
  species_id: number;
  mega?: Array<{ mega_id: number; stone_id: number }>;
  form?: number;
}

export type RawPokemon = ResolvedPokemon;

/**
 * Resolves any "inherit" field in a pokemon list by copying values from base species.
 */
export function resolvePokemonInheritance(rawList: readonly RawPokemonEntry[]): ResolvedPokemon[] {
  const baseMap = new Map<number, RawPokemonEntry>();
  for (const p of rawList) {
    baseMap.set(p.id, p);
  }

  return rawList.map((entry) => {
    const base = entry.species_id ? baseMap.get(entry.species_id) : undefined;

    const types =
      entry.types === "inherit"
        ? base && base.types !== "inherit"
          ? base.types.slice()
          : []
        : entry.types.slice();

    const abilities =
      entry.abilities === "inherit"
        ? base && base.abilities !== "inherit"
          ? base.abilities.slice()
          : []
        : entry.abilities.slice();

    const status =
      entry.status === "inherit"
        ? base && base.status !== "inherit"
          ? (base.status.slice() as [number, number, number, number, number, number])
          : ([0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number])
        : (entry.status.slice() as [number, number, number, number, number, number]);

    const moves =
      entry.moves === "inherit"
        ? base && base.moves !== "inherit"
          ? base.moves.slice()
          : []
        : entry.moves.slice();

    return {
      ...entry,
      types,
      abilities,
      status,
      moves,
      species_id: entry.species_id ?? entry.id,
    } as ResolvedPokemon;
  });
}

const resolvedBasePokemonData = resolvePokemonInheritance(pokemonData.data);

/**
 * Applies regulation diff patches to the base pokemon data.
 */
export function applyRegulationPatchToPokemonList(
  baseList: readonly ResolvedPokemon[],
  regulation?: Regulation,
): ResolvedPokemon[] {
  if (!regulation || !patches[regulation]?.pokemon) {
    return [...baseList];
  }

  const regPatches = patches[regulation].pokemon!;

  const patchedList = baseList.map((pokemon) => {
    const patch = regPatches[String(pokemon.id)];
    if (!patch) {
      return pokemon;
    }

    let moves = [...pokemon.moves];
    if (patch.remove_moves && patch.remove_moves.length > 0) {
      const toRemove = new Set(patch.remove_moves);
      moves = moves.filter((m) => !toRemove.has(m));
    }
    if (patch.add_moves && patch.add_moves.length > 0) {
      for (const m of patch.add_moves) {
        if (!moves.includes(m)) {
          moves.push(m);
        }
      }
    }

    return {
      ...pokemon,
      moves,
    };
  });

  const byId = new Map<number, ResolvedPokemon>();
  for (const p of patchedList) {
    byId.set(p.id, p);
  }

  return patchedList.map((pokemon) => {
    if (pokemon.identifier.includes("-mega") && pokemon.species_id) {
      if (!regPatches[String(pokemon.id)]) {
        const base = byId.get(pokemon.species_id);
        if (base) {
          return {
            ...pokemon,
            moves: [...base.moves],
          };
        }
      }
    }
    return pokemon;
  });
}

// Cached patched data by regulation
const pokemonDataCache = new Map<string, ResolvedPokemon[]>();

export function getPokemonData(regulation?: Regulation): ResolvedPokemon[] {
  const regKey = regulation ?? "base";
  const cached = pokemonDataCache.get(regKey);
  if (cached) {
    return cached;
  }

  const result = applyRegulationPatchToPokemonList(resolvedBasePokemonData, regulation);
  pokemonDataCache.set(regKey, result);
  return result;
}

/**
 * Gets the allowed move IDs for a specific pokemon under a given regulation.
 */
export function getPokemonMoves(
  pokemonIdOrSlug: number | string,
  regulation?: Regulation,
): readonly number[] {
  const list = getPokemonData(regulation);
  const found = list.find((p) =>
    typeof pokemonIdOrSlug === "number"
      ? p.id === pokemonIdOrSlug
      : p.slug === pokemonIdOrSlug || p.identifier === pokemonIdOrSlug,
  );
  return found ? found.moves : [];
}

/**
 * Checks if a move is allowed for a given pokemon under a given regulation.
 */
export function isMoveAllowedForPokemon(
  pokemonIdOrSlug: number | string,
  moveId: number,
  regulation?: Regulation,
): boolean {
  const moves = getPokemonMoves(pokemonIdOrSlug, regulation);
  return moves.includes(moveId);
}

/**
 * Checks if a pokemon is allowed under a given regulation.
 */
export function isPokemonAllowedInRegulation(
  pokemonId: number,
  regulation: Regulation = "M-C",
): boolean {
  switch (regulation) {
    case "M-A":
      return REG_M_A.includes(pokemonId);
    case "M-B":
      return REG_M_B.includes(pokemonId);
    case "M-C":
    default:
      return REG_M_C.includes(pokemonId);
  }
}
