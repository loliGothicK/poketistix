import { data } from "@poketistix/data/champions/moves.json";
import { moveCategories, moveClassifications, moveRanges, types } from "@/types/pokemon";
import * as v from "valibot";
import { Either, tryCatch } from "fp-ts/lib/Either";

// Valibot doesn't have a zod-validation-error equivalent; we use ValiError directly.
export type MoveParseError = v.ValiError<typeof schema>;

export function parse(value: v.InferInput<typeof schema>): Either<MoveParseError, Move> {
  return tryCatch(
    () => v.parse(schema, value),
    (e) => e as MoveParseError,
  );
}

const schema = v.pipe(
  v.object({
    id: v.number(),
    identifier: v.string(),
    type: v.picklist(types),
    category: v.picklist(moveCategories),
    power: v.nullable(v.number()),
    accuracy: v.nullable(v.number()),
    range: v.picklist(moveRanges),
    pp: v.number(),
    priority: v.nullable(v.number()),

    classifications: v.array(v.picklist(moveClassifications)),
    secondary: v.nullish(
      v.object({
        chance: v.number(),
        status: v.optional(v.picklist(["brn", "par", "psn", "tox", "slp", "frz"] as const)),
        volatileStatus: v.optional(v.picklist(["flinch", "confusion"] as const)),
        boosts: v.optional(
          v.object({
            atk: v.optional(v.number()),
            def: v.optional(v.number()),
            spa: v.optional(v.number()),
            spd: v.optional(v.number()),
            spe: v.optional(v.number()),
            accuracy: v.optional(v.number()),
            evasion: v.optional(v.number()),
          }),
        ),
      }),
    ),
  }),
  v.brand("Move"),
);

type Move = v.InferOutput<typeof schema>;

export const MoveList: readonly Move[] = data.map((move) => {
  // Override spit-up to be a special move (since it's erroneously marked as status with null power in pokeapi)
  const isSpitUp = move.identifier === "spit-up";
  const category = isSpitUp ? "special" : move.category;

  return v.parse(schema, { ...move, type: move.type.toLocaleLowerCase(), category });
});

export const moveById = new Map(MoveList.map((move) => [move.id, move]));
export const moveByIdentifier = new Map(MoveList.map((move) => [move.identifier, move]));
