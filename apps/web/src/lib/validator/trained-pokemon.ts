import { z } from "zod";
import { championsPokemonByIdentifier } from "@/data/champions-pokemon";
import { MAX_EV_TOTAL, MAX_EV_PER_STAT } from "@/store/team/lint";

export const trainedPokemonSaveSchema = z
  .object({
    boxId: z.string(),
    identifier: z.string(),
    slug: z.string().optional(),
    item: z.number().nullable().optional(),
    ability: z.number().optional(),
    gender: z
      .object({
        fixed: z.boolean().optional(),
        specified: z.enum(["male", "female", "unknown"]).optional(),
      })
      .optional(),
    nature: z
      .object({
        plus: z.enum(["hp", "atk", "def", "spa", "spd", "spe"]).nullable().optional(),
        minus: z.enum(["hp", "atk", "def", "spa", "spd", "spe"]).nullable().optional(),
      })
      .optional(),
    moves: z
      .tuple([
        z.number().nullable(),
        z.number().nullable(),
        z.number().nullable(),
        z.number().nullable(),
      ])
      .optional(),
    evs: z
      .object({
        hp: z.number().optional(),
        atk: z.number().optional(),
        def: z.number().optional(),
        spa: z.number().optional(),
        spd: z.number().optional(),
        spe: z.number().optional(),
      })
      .optional(),
    description: z.string().max(2000).optional(),
  })
  .loose();

export const trainedPokemonSchema = z
  .object({
    boxId: z.string().optional(),
    identifier: z.string(),
    slug: z.string().optional(),
    description: z.string().max(2000).optional(),
    item: z.number().nullable().optional(),
    ability: z.number().nullable().optional(),
    gender: z
      .object({
        fixed: z.boolean().optional(),
        specified: z.enum(["male", "female", "unknown"]).optional(),
      })
      .optional(),
    nature: z
      .object({
        plus: z.enum(["hp", "atk", "def", "spa", "spd", "spe"]).nullable().optional(),
        minus: z.enum(["hp", "atk", "def", "spa", "spd", "spe"]).nullable().optional(),
      })
      .optional(),
    moves: z.any().optional(),
    evs: z.any().optional(),
  })
  .superRefine((data, ctx) => {
    const pokemonData = championsPokemonByIdentifier.get(data.identifier);
    if (!pokemonData) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid Pokemon identifier: ${data.identifier}`,
        path: ["identifier"],
      });
      return;
    }

    // 1. Ability validation
    if (data.ability === null || data.ability === undefined) {
      ctx.addIssue({
        code: "custom",
        message: `Ability is required`,
        path: ["ability"],
      });
    } else if (typeof data.ability !== "number" || !pokemonData.abilities.includes(data.ability)) {
      ctx.addIssue({
        code: "custom",
        message: `Ability ${data.ability} is not valid for ${data.identifier}`,
        path: ["ability"],
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
          ctx.addIssue({
            code: "custom",
            message: `Move ${move} is not valid for ${data.identifier}`,
            path: ["moves", i],
          });
        }
      }
    }

    if (!hasMove) {
      ctx.addIssue({
        code: "custom",
        message: `Pokemon must have at least one move`,
        path: ["moves"],
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
        ctx.addIssue({
          code: "custom",
          message: `${key.toUpperCase()} EV exceeds ${MAX_EV_PER_STAT}`,
          path: ["evs", key],
        });
      }
      evTotal += val;
    }

    if (evTotal > MAX_EV_TOTAL) {
      ctx.addIssue({
        code: "custom",
        message: `Total EVs exceed ${MAX_EV_TOTAL}`,
        path: ["evs"],
      });
    }
  });
