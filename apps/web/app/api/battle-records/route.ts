import { NextResponse } from "next/server";
import { match } from "ts-pattern";
import { and, eq, inArray, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { battleRecords, battleRecordOpponents } from "@/lib/db/schema";
import { createBattleRecord } from "@/lib/db/repositories/battleRecordRepository";
import { isLeft } from "fp-ts/Either";
import { genUlid } from "@/lib/db/ulid-type";
import {
  battleRecordInputSchema,
  type BattleRecord,
  type BattleRecordOpponent,
} from "@/store/battle-record/battleRecord";
import { withChildSpan } from "@/lib/otel";
import * as Sentry from "@sentry/nextjs";
import type { InferSelectModel } from "drizzle-orm";
import type { TrainedPokemon } from "@/store/team/team";
import * as v from "valibot";

type RecordRow = InferSelectModel<typeof battleRecords>;
type OpponentRow = InferSelectModel<typeof battleRecordOpponents>;

const toOpponentDto = (row: OpponentRow): BattleRecordOpponent => ({
  slotIndex: row.slotIndex,
  pokemonSlug: row.pokemonSlug,
  itemSlug: row.itemSlug,
  abilitySlug: row.abilitySlug,
  moves: row.moves,
  selectionRole: row.selectionRole,
  notes: row.notes,
});

const toDto = (row: RecordRow, opponents: readonly OpponentRow[]): BattleRecord => ({
  id: row.id,
  seasonId: row.seasonId,
  teamId: row.teamId,
  result: row.result,
  myTeam: row.myTeam,
  mySelection: row.mySelection,
  rating: row.rating,
  tags: row.tags ?? [],
  notes: row.notes,
  playedAt: row.playedAt.toISOString(),
  opponents: opponents
    .filter((o) => o.battleRecordId === row.id)
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map(toOpponentDto),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub;

  const params = new URL(request.url).searchParams;
  const seasonId = params.get("seasonId");
  const teamId = params.get("teamId");

  const where = and(
    eq(battleRecords.userId, userId),
    seasonId ? eq(battleRecords.seasonId, seasonId) : undefined,
    teamId ? eq(battleRecords.teamId, teamId) : undefined,
  );

  const records = await withChildSpan(
    "db.battle-records.list",
    async (span) => {
      if (seasonId) span.setAttribute("db.season_id", seasonId);
      if (teamId) span.setAttribute("db.team_id", teamId);
      return db.select().from(battleRecords).where(where).orderBy(desc(battleRecords.playedAt));
    },
    { op: "db.query" },
  );

  if (records.length === 0) {
    return NextResponse.json([]);
  }

  const opponents = await db
    .select()
    .from(battleRecordOpponents)
    .where(
      inArray(
        battleRecordOpponents.battleRecordId,
        records.map((r) => r.id),
      ),
    );

  return NextResponse.json(records.map((r) => toDto(r, opponents)));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = v.safeParse(battleRecordInputSchema, body);
  return match(parsed)
    .with({ success: false }, ({ issues }) => NextResponse.json({ error: issues }, { status: 422 }))
    .with({ success: true }, async ({ output: input }) => {
      const id = input.id ?? genUlid();

      const dtoEither = await withChildSpan(
        "db.battle-records.create",
        async (_span) => {
          return createBattleRecord({
            id,
            userId,
            seasonId: input.seasonId,
            teamId: input.teamId ?? null,
            result: input.result,
            myTeam: input.myTeam as unknown as readonly TrainedPokemon[],
            mySelection: input.mySelection ?? null,
            rating: input.rating ?? null,
            tags: input.tags ? [...input.tags] : [],
            notes: input.notes ?? null,
            ...(input.playedAt ? { playedAt: new Date(input.playedAt) } : {}),
            opponents: input.opponents.map((o) => ({
              slotIndex: o.slotIndex,
              pokemonSlug: o.pokemonSlug,
              itemSlug: o.itemSlug ?? null,
              abilitySlug: o.abilitySlug ?? null,
              moves: o.moves ?? null,
              selectionRole: o.selectionRole ?? null,
              notes: o.notes ?? null,
            })),
          })();
        },
        { op: "db.query" },
      );

      if (isLeft(dtoEither)) {
        console.error("[POST /api/battle-records error]", dtoEither.left);
        Sentry.captureException(dtoEither.left, {
          extra: {
            userId,
            seasonId: input.seasonId,
            teamId: input.teamId,
          },
        });
        return NextResponse.json({ error: dtoEither.left.message }, { status: 500 });
      }

      const dto = toDto(dtoEither.right.record, dtoEither.right.opponents);

      return NextResponse.json(dto, { status: 201 });
    })
    .exhaustive();
}
