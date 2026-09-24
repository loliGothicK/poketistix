// src/utils/pokepaste.ts
import { Sets, PokemonSet } from "@pkmn/sets";
import type { Team, TrainedPokemon } from "@/store/team/team";
import {
  anyhow,
  bail,
  MitamaError,
  Result,
  ValidateResult,
  withContext,
} from "@/errors/anyhow/error";
import { left, right } from "fp-ts/lib/Either";
import { toValidated } from "@/cats/data/Validated";
import { ChampionsPokemon, championsPokemonByIdentifier } from "@/data/champions-pokemon";
import { pipe } from "fp-ts/lib/function";
import { either } from "fp-ts";
import { getApplicativeValidation } from "fp-ts/lib/Either";
import { getSemigroup } from "fp-ts/lib/ReadonlyArray";
import { sequenceS } from "fp-ts/lib/Apply.js";
import { itemById, itemByIdentifier } from "@/data/items";
import { natureObjectToString, parseNature } from "@/data/nature";
import { separator } from "@/cats/syntax/Validated";
import { moveById, moveByIdentifier } from "@/data/moves";
import { match, P } from "ts-pattern";
import { EV } from "@/types/pokemon";
import { nonNullable } from "next/dist/lib/non-nullable";
import { abilityById, abilityByIdentifier } from "@/data/abilities";
import { outdent } from "outdent";
import { invalidPokepasteFormat } from "@/errors/thiserror/thiserror";
import { pokemonById } from "@/data/pokemon";
import { ulid } from "ulid";

const ap = getApplicativeValidation(getSemigroup<MitamaError>());

export function importSet(block: string): ValidateResult<TrainedPokemon> {
  return convertToAppMember(block);
}

/**
 * Pokepasteのテキストをパースし、アプリケーション内部のTeamデータに変換する
 */
export function importSets(text: string): ValidateResult<{ readonly members: Team["members"] }> {
  const sets = text.trim().split(/\n\s*\n/);

  if (sets.length === 0) {
    return toValidated(bail("no pokemon detected"));
  }

  return sequenceS(ap)({
    members: separator(sets.map(importSet)),
  });
}

const importName = (name: string): string => {
  return match(name.trim().toLowerCase())
    .when(
      (name) => name.endsWith(" f"),
      (name) => name.replace(" f", "-female"),
    )
    .when(
      (name) => championsPokemonByIdentifier.get(`${name}-male`),
      (name) => `${name}-male`,
    )
    .when(
      (name) => name.endsWith(" hisui"),
      (name) => `hisuian-${name.replace(" hisui", "")}`,
    )
    .when(
      (name) => name.endsWith(" alola"),
      (name) => `alolan-${name.replace(" alola", "")}`,
    )
    .when(
      (name) => name.endsWith(" galar"),
      (name) => `galarian-${name.replace(" galar", "")}`,
    )
    .when(
      (name) => name.startsWith("tauros-paldea"),
      (name) => `paldean-tauros-${name.slice(13)}-breed`,
    )
    .with("palafin", () => "palafin-zero")
    .with("aegislash", () => "aegislash-shield")
    .with("maushold", () => "maushold-family-of-four")
    .with("maushold four", () => "maushold-family-of-four")
    .with("morpeko", () => "morpeko-full-belly")
    .with("lycanroc", () => "lycanroc-midday")
    .with("gourgeist", () => "gourgeist-average")
    .with("mr. rime", () => "mr-rime")
    .otherwise((name) => name.split(" ").join("-"));
};

const exportName = (name: string): string => {
  const converted = match(name)
    .when(
      (name) => name.endsWith("-male"),
      (name) => name.slice(0, -5),
    )
    .when(
      (name) => name.endsWith("-female"),
      (name) => name.slice(0, -5),
    )
    .when(
      (name) => name.startsWith("paldean-tauros"),
      (name) => `tauros-paldea-${name.slice(15).replace("-breed", "")}`,
    )
    .when(
      (name) => name.startsWith("hisuian-"),
      () => `${name.replace("hisuian-", "")}-hisui`,
    )
    .when(
      (name) => name.startsWith("alolan-"),
      () => `${name.replace("alolan-", "")}-alola`,
    )
    .when(
      (name) => name.startsWith("galarian-"),
      () => `${name.replace("galarian-", "")}-galar`,
    )
    .with("palafin-zero", () => "palafin")
    .with("aegislash-shield", () => "aegislash")
    .with("maushold-family-of-four", () => "maushold-four")
    .with("morpeko-full-belly", () => "morpeko")
    .with("lycanroc-midday", () => "lycanroc")
    .with("gourgeist-average", () => "gourgeist")
    .otherwise((name) => name);

  return toUpperCamelCase(converted);
};

const lookupPokemon = (set: Partial<PokemonSet>): Result<ChampionsPokemon> => {
  return pipe(
    set.species,
    either.fromNullable(anyhow("name is undefined")),
    either.map(importName),
    either.flatMap((identifier) => {
      return pipe(
        championsPokemonByIdentifier.get(identifier),
        either.fromNullable(anyhow(`${identifier} not found`)),
      );
    }),
  );
};

const lookupItem = (set: Partial<PokemonSet>): Result<number | null> => {
  if (!set.item) {
    return right(null);
  }
  return pipe(
    itemByIdentifier.get(set.item.toLowerCase().split(" ").join("-"))?.id,
    either.fromNullable(anyhow("item lockup failed")),
  );
};

const lookupAbility = (set: Partial<PokemonSet>): Result<number> => {
  if (!set.ability) {
    return left(anyhow("ability is undefined"));
  }
  return pipe(
    abilityByIdentifier.get(set.ability.toLowerCase().split(" ").join("-"))?.id,
    either.fromNullable(anyhow("ability lockup failed")),
  );
};

const lookupMoves = (
  set: Partial<PokemonSet>,
  setRaw: string,
): ValidateResult<readonly number[]> => {
  if (!set.moves) {
    return toValidated(
      left(
        invalidPokepasteFormat("No moves detected. At least one move is required.", {
          name: set.species!,
          raw: setRaw,
        }),
      ),
    );
  }
  return pipe(
    set.moves.map((move) =>
      pipe(
        moveByIdentifier.get(move.toLowerCase().split(" ").join("-"))?.id,
        either.fromNullable(anyhow("move lockup failed")),
      ),
    ),
    separator,
  );
};

const validateEv = (ev?: number): Result<EV> =>
  match(ev)
    .with(undefined, () => right(0 as EV))
    .when(
      (ev) => 0 <= ev && ev <= 32,
      (ev) => right(ev as EV),
    )
    .otherwise(() => bail(`${ev} is invalid`));

const isFixedGender = (rate: number): boolean => {
  return match(rate)
    .with(P.union(-1, 0, 8), () => true)
    .otherwise(() => false);
};

const toDefaultGender = (rate: number) => {
  return match(rate)
    .with(-1, () => ({
      fixed: true,
      specified: "unknown" as const,
    }))
    .with(0, () => ({
      fixed: true,
      specified: "male" as const,
    }))
    .with(8, () => ({
      fixed: true,
      specified: "female" as const,
    }))
    .otherwise(() => ({
      fixed: false,
    }));
};

/**
 * @pkmn/sets の PokemonSet を内部の TeamMember 型に変換する純粋関数
 */
function convertToAppMember(block: string): ValidateResult<TrainedPokemon> {
  const set = Sets.importSet(block);
  const pokemon = pipe(
    lookupPokemon(set),
    withContext(outdent`
    input:
    ${block
      .split("\n")
      .map((line) => `  | ${line}`)
      .join("\n")}
  `),
  );
  return pipe(
    pokemon,
    toValidated,
    either.flatMap((pokemon) =>
      sequenceS(ap)({
        boxId: right(ulid()),
        identifier: right(pokemon.identifier),
        slug: pipe(
          pokemon.slug,
          either.fromNullable(anyhow(`${pokemon.identifier} is invalid`)),
          toValidated,
        ),
        gender: match(set.gender)
          .with("M", () =>
            right({
              fixed: isFixedGender(pokemonById.get(pokemon.id)!.gender_rate),
              specified: "male" as const,
            }),
          )
          .with("F", () =>
            right({
              fixed: isFixedGender(pokemonById.get(pokemon.id)!.gender_rate),
              specified: "female" as const,
            }),
          )
          .with("", () => right(toDefaultGender(pokemonById.get(pokemon.id)!.gender_rate)))
          .otherwise(() => toValidated(bail("unknown gender"))),
        item: pipe(set, lookupItem, toValidated),
        ability: pipe(set, lookupAbility, toValidated),
        nature: pipe(
          set.nature,
          either.fromNullable(anyhow("nature is undefined")),
          either.flatMap(parseNature),
          toValidated,
        ),
        moves: pipe(
          lookupMoves(set, block),
          either.map(
            (moves) =>
              [
                moves[0] || null,
                moves[1] || null,
                moves[2] || null,
                moves[3] || null,
              ] as TrainedPokemon["moves"],
          ),
        ),
        evs: sequenceS(ap)({
          hp: toValidated(validateEv(set.evs?.hp)),
          atk: toValidated(validateEv(set.evs?.atk)),
          def: toValidated(validateEv(set.evs?.def)),
          spa: toValidated(validateEv(set.evs?.spa)),
          spd: toValidated(validateEv(set.evs?.spd)),
          spe: toValidated(validateEv(set.evs?.spe)),
        }),
      }),
    ),
  );
}

const toUpperCamelCase = (str: string) => {
  return str
    .split("-")
    .map((str) => str.charAt(0).toUpperCase() + str.slice(1))
    .join(" ");
};

export function exportSet(pokemon: TrainedPokemon) {
  return Sets.exportSet({
    name: exportName(pokemon.identifier),
    item: pokemon.item ? toUpperCamelCase(itemById.get(pokemon.item)!.identifier) : undefined,
    ability: pokemon.ability
      ? toUpperCamelCase(abilityById.get(pokemon.ability)!.identifier)
      : undefined,
    nature: pokemon.nature && natureObjectToString(pokemon.nature),
    moves: pokemon.moves
      .filter(nonNullable)
      .map((id) => toUpperCamelCase(moveById.get(id)!.identifier)),
    evs: {
      hp: pokemon.evs.hp,
      atk: pokemon.evs.atk,
      def: pokemon.evs.def,
      spa: pokemon.evs.spa,
      spd: pokemon.evs.spd,
      spe: pokemon.evs.spe,
    },
  });
}

/**
 * アプリケーションのTeamデータからPokepasteテキストを生成する
 */
export function exportPokepaste(team: Team): string {
  // 内部型から @pkmn/sets の型へ変換し、テキスト化するロジック
  return team.members.filter(nonNullable).map(exportSet).join("\n\n");
}

/**
 * URL または文字列から Pokepaste の ID を抽出する
 */
export function extractPokepasteId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?pokepast\.es\/([a-zA-Z0-9_-]+)(?:\/raw)?(?:\/|\?.*)?$/i,
  );
  if (urlMatch) {
    return urlMatch[1];
  }
  const idMatch = trimmed.match(/^([a-zA-Z0-9_-]+)$/);
  if (idMatch) {
    return idMatch[1];
  }
  return null;
}
