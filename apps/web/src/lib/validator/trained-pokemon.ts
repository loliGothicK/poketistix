import * as v from "valibot";
import { championsPokemonByIdentifier } from "@/data/champions-pokemon";
import { MAX_EV_TOTAL, MAX_EV_PER_STAT } from "@/store/team/lint";

const statEnum = v.picklist(["hp", "atk", "def", "spa", "spd", "spe"] as const);
const genderEnum = v.picklist(["male", "female", "unknown"] as const);

export const trainedPokemonSaveSchema = v.looseObject({
  boxId: v.string(),
  identifier: v.string(),
  slug: v.optional(v.string()),
  item: v.optional(v.nullable(v.number())),
  ability: v.optional(v.number()),
  gender: v.optional(
    v.object({
      fixed: v.optional(v.boolean()),
      specified: v.optional(genderEnum),
    }),
  ),
  nature: v.optional(
    v.object({
      plus: v.optional(v.nullable(statEnum)),
      minus: v.optional(v.nullable(statEnum)),
    }),
  ),
  moves: v.optional(
    v.tuple([
      v.nullable(v.number()),
      v.nullable(v.number()),
      v.nullable(v.number()),
      v.nullable(v.number()),
    ]),
  ),
  evs: v.optional(
    v.object({
      hp: v.optional(v.number()),
      atk: v.optional(v.number()),
      def: v.optional(v.number()),
      spa: v.optional(v.number()),
      spd: v.optional(v.number()),
      spe: v.optional(v.number()),
    }),
  ),
  description: v.optional(v.pipe(v.string(), v.maxLength(2000))),
});

export const trainedPokemonSchema = v.pipe(
  v.object({
    boxId: v.optional(v.string()),
    identifier: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.pipe(v.string(), v.maxLength(2000))),
    item: v.optional(v.nullable(v.number())),
    ability: v.optional(v.nullable(v.number())),
    gender: v.optional(
      v.object({
        fixed: v.optional(v.boolean()),
        specified: v.optional(genderEnum),
      }),
    ),
    nature: v.optional(
      v.object({
        plus: v.optional(v.nullable(statEnum)),
        minus: v.optional(v.nullable(statEnum)),
      }),
    ),
    moves: v.optional(v.unknown()),
    evs: v.optional(v.unknown()),
  }),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const data = dataset.value;

    const pokemonData = championsPokemonByIdentifier.get(data.identifier);
    if (!pokemonData) {
      addIssue({
        message: `Invalid Pokemon identifier: ${data.identifier}`,
        path: [
          {
            type: "object",
            origin: "value",
            input: data,
            key: "identifier",
            value: data.identifier,
          },
        ],
      });
      return;
    }

    // 1. Ability validation
    if (data.ability === null || data.ability === undefined) {
      addIssue({
        message: `Ability is required`,
        path: [
          { type: "object", origin: "value", input: data, key: "ability", value: data.ability },
        ],
      });
    } else if (typeof data.ability !== "number" || !pokemonData.abilities.includes(data.ability)) {
      addIssue({
        message: `Ability ${data.ability} is not valid for ${data.identifier}`,
        path: [
          { type: "object", origin: "value", input: data, key: "ability", value: data.ability },
        ],
      });
    }

    // 2. Moves validation
    const movesList = Array.isArray(data.moves) ? data.moves : [];
    let hasMove = false;
    for (let i = 0; i < movesList.length; i++) {
      const move = movesList[i];
      if (move !== null && move !== undefined) {
        hasMove = true;
        if (typeof move !== "number" || !pokemonData.moves.includes(move)) {
          addIssue({
            message: `Move ${move} is not valid for ${data.identifier}`,
            path: [
              { type: "object", origin: "value", input: data, key: "moves", value: data.moves },
              { type: "array", origin: "value", input: movesList, key: i, value: move },
            ],
          });
        }
      }
    }

    if (!hasMove) {
      addIssue({
        message: `Pokemon must have at least one move`,
        path: [{ type: "object", origin: "value", input: data, key: "moves", value: data.moves }],
      });
    }

    // 3. EVs validation
    const evKeys = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
    let evTotal = 0;
    const evsObj = (data.evs && typeof data.evs === "object" ? data.evs : {}) as Record<
      string,
      number
    >;
    for (const key of evKeys) {
      const val = typeof evsObj[key] === "number" ? evsObj[key] : 0;
      if (val > MAX_EV_PER_STAT) {
        addIssue({
          message: `${key.toUpperCase()} EV exceeds ${MAX_EV_PER_STAT}`,
          path: [
            { type: "object", origin: "value", input: data, key: "evs", value: data.evs },
            { type: "object", origin: "value", input: evsObj, key, value: evsObj[key] },
          ],
        });
      }
      evTotal += val;
    }

    if (evTotal > MAX_EV_TOTAL) {
      addIssue({
        message: `Total EVs exceed ${MAX_EV_TOTAL}`,
        path: [{ type: "object", origin: "value", input: data, key: "evs", value: data.evs }],
      });
    }
  }),
);
