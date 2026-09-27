import * as v from "valibot";
import { ValidateResult, anyhow } from "@/errors/anyhow/error";
import { either } from "fp-ts";

const dateString = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"));

const handleValibotError = <T>(
  result: v.SafeParseResult<v.BaseSchema<unknown, T, v.BaseIssue<unknown>>>,
  name: string,
): ValidateResult<T> => {
  if (!result.success) {
    return either.left(
      v.flatten(result.issues).nested
        ? Object.entries(v.flatten(result.issues).nested ?? {}).map(([path, msgs]) =>
            anyhow(`${name} validation error: ${path} - ${(msgs ?? []).join(", ")}`, undefined),
          )
        : (v.flatten(result.issues).root ?? []).map((msg) =>
            anyhow(`${name} validation error: ${msg}`, undefined),
          ),
    );
  }
  return either.right(result.output);
};

// -----------------------------------------------------------------------------
// Season Validation
// -----------------------------------------------------------------------------
export const insertSeasonSchema = v.object({
  id: v.optional(v.string()),
  userId: v.string(),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  format: v.picklist(["singles", "doubles"] as const),
  ruleMark: v.nullish(v.pipe(v.string(), v.trim(), v.minLength(1))),
  startedAt: v.nullish(dateString),
  endedAt: v.nullish(dateString),
  createdAt: v.optional(v.date()),
  updatedAt: v.optional(v.date()),
});

export const validateInsertSeason = (
  data: unknown,
): ValidateResult<v.InferOutput<typeof insertSeasonSchema>> =>
  handleValibotError(v.safeParse(insertSeasonSchema, data), "Season");

// -----------------------------------------------------------------------------
// Team Validation
// -----------------------------------------------------------------------------
export const insertTeamSchema = v.object({
  id: v.optional(v.string()),
  userId: v.string(),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  createdAt: v.optional(v.date()),
  updatedAt: v.optional(v.date()),
});

export const validateInsertTeam = (
  data: unknown,
): ValidateResult<v.InferOutput<typeof insertTeamSchema>> =>
  handleValibotError(v.safeParse(insertTeamSchema, data), "Team");

// -----------------------------------------------------------------------------
// Box Pokemon Validation
// -----------------------------------------------------------------------------
export const insertBoxPokemonSchema = v.object({
  id: v.optional(v.string()),
  userId: v.string(),
  slug: v.pipe(v.string(), v.trim(), v.minLength(1)),
  data: v.record(v.string(), v.unknown()), // Drizzle jsonb field
  inBox: v.optional(v.boolean(), false),
  createdAt: v.optional(v.date()),
  updatedAt: v.optional(v.date()),
});

export const validateInsertBoxPokemon = (
  data: unknown,
): ValidateResult<v.InferOutput<typeof insertBoxPokemonSchema>> =>
  handleValibotError(v.safeParse(insertBoxPokemonSchema, data), "BoxPokemon");

// -----------------------------------------------------------------------------
// Battle Record Validation
// -----------------------------------------------------------------------------
export const insertBattleRecordSchema = v.object({
  id: v.optional(v.string()),
  userId: v.string(),
  seasonId: v.pipe(v.string(), v.minLength(1)),
  teamId: v.nullish(v.pipe(v.string(), v.minLength(1))),
  result: v.picklist(["win", "loss", "draw"] as const),
  myTeam: v.pipe(v.array(v.record(v.string(), v.unknown())), v.maxLength(6)),
  mySelection: v.nullish(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)))),
  rating: v.nullish(v.pipe(v.number(), v.minValue(0), v.maxValue(100000))),
  tags: v.nullish(v.array(v.string())),
  notes: v.nullish(v.string()),
  playedAt: v.nullish(v.date()),
  createdAt: v.optional(v.date()),
  updatedAt: v.optional(v.date()),
});

export const validateInsertBattleRecord = (
  data: unknown,
): ValidateResult<v.InferOutput<typeof insertBattleRecordSchema>> =>
  handleValibotError(v.safeParse(insertBattleRecordSchema, data), "BattleRecord");

// -----------------------------------------------------------------------------
// Dashboard Validation
// -----------------------------------------------------------------------------
export const insertDashboardSchema = v.object({
  id: v.optional(v.string()),
  userId: v.string(),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  isDefault: v.optional(v.boolean()),
  layout: v.array(v.record(v.string(), v.unknown())),
  variables: v.array(v.record(v.string(), v.unknown())),
  createdAt: v.optional(v.date()),
  updatedAt: v.optional(v.date()),
});

export const validateInsertDashboard = (
  data: unknown,
): ValidateResult<v.InferOutput<typeof insertDashboardSchema>> =>
  handleValibotError(v.safeParse(insertDashboardSchema, data), "Dashboard");
