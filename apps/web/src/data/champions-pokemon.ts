import { getPokemonData, Regulation } from "@poketistix/data";
import { data as typesData } from "@poketistix/data/master/pokemon_types.json";
import { data as typeData } from "@poketistix/data/master/types.json";
import * as v from "valibot";
import { Type } from "@/types/pokemon";

const ChampionsPokemonSchema = v.object({
  id: v.number(),
  identifier: v.string(),
  slug: v.nullable(v.string()),
  abilities: v.array(v.number()),
  status: v.tuple([v.number(), v.number(), v.number(), v.number(), v.number(), v.number()]),
  moves: v.array(v.number()),
  species_id: v.optional(v.number()),
  mega: v.optional(
    v.array(
      v.object({
        mega_id: v.number(),
        stone_id: v.number(),
      }),
    ),
  ),
  form: v.optional(v.number()),
});

export type ChampionsPokemon = v.InferOutput<typeof ChampionsPokemonSchema> & {
  readonly types: readonly Type[];
};

export const championsPokemonList: readonly ChampionsPokemon[] = getPokemonData()
  .map((entry) => v.parse(ChampionsPokemonSchema, entry))
  .map((entry) => ({
    ...entry,
    types: typesData
      .filter(({ pokemon_id }) => pokemon_id === entry.id)
      .map(({ type_id }) => {
        return typeData.find(({ id }) => id === type_id)!.identifier as Type;
      }),
  }));

export const championsPokemonById = new Map(
  championsPokemonList.map((pokemon) => [pokemon.id, pokemon]),
);

export const championsPokemonByIdentifier = new Map(
  championsPokemonList.map((pokemon) => [pokemon.identifier, pokemon]),
);

const regulationListCache = new Map<string, readonly ChampionsPokemon[]>();

export function getChampionsPokemonList(regulation?: Regulation): readonly ChampionsPokemon[] {
  if (!regulation) {
    return championsPokemonList;
  }
  const cached = regulationListCache.get(regulation);
  if (cached) {
    return cached;
  }

  const rawList = getPokemonData(regulation);
  const result: readonly ChampionsPokemon[] = rawList
    .map((entry) => v.parse(ChampionsPokemonSchema, entry))
    .map((entry) => ({
      ...entry,
      types: typesData
        .filter(({ pokemon_id }) => pokemon_id === entry.id)
        .map(({ type_id }) => {
          return typeData.find(({ id }) => id === type_id)!.identifier as Type;
        }),
    }));

  regulationListCache.set(regulation, result);
  return result;
}

export function getChampionsPokemonById(regulation?: Regulation): Map<number, ChampionsPokemon> {
  const list = getChampionsPokemonList(regulation);
  return new Map(list.map((pokemon) => [pokemon.id, pokemon]));
}

export function getChampionsPokemonByIdentifier(
  regulation?: Regulation,
): Map<string, ChampionsPokemon> {
  const list = getChampionsPokemonList(regulation);
  return new Map(list.map((pokemon) => [pokemon.identifier, pokemon]));
}
