import { data } from "@poketistix/data/master/pokemon.json";
import * as v from "valibot";

const PokemonSchema = v.object({
  id: v.number(),
  identifier: v.string(),
  species_id: v.number(),
  height: v.number(),
  weight: v.number(),
  gender_rate: v.number(),
  order: v.nullable(v.number()),
  is_default: v.boolean(),
});

type Pokemon = v.InferOutput<typeof PokemonSchema>;

export const pokemonList: readonly Pokemon[] = data.map((memoria) => {
  return v.parse(PokemonSchema, memoria);
});

export const pokemonById: Map<number, Pokemon> = new Map(
  pokemonList.map((pokemon) => [pokemon.id, pokemon]),
);

export const pokemonByIdentifier: Map<string, Pokemon> = new Map(
  pokemonList.map((pokemon) => [pokemon.identifier, pokemon]),
);
