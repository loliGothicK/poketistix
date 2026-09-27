import { NextResponse } from "next/server";
import { match } from "ts-pattern";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { battleRecords, battleRecordOpponents, teams } from "@/lib/db/schema";
import {
  battleRecordUpdateSchema,
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
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map(toOpponentDto),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub;

  const [row, opponents] = await withChildSpan(
    "db.battle-records.get",
    async (span) => {
      span.setAttribute("db.record_id", id);
      const [record] = await db
        .select()
        .from(battleRecords)
        .where(and(eq(battleRecords.id, id), eq(battleRecords.userId, userId)));

      if (!record) return [undefined, []] as const;

      const opponentRows = await db
        .select()
        .from(battleRecordOpponents)
        .where(eq(battleRecordOpponents.battleRecordId, id));

      return [record, opponentRows] as const;
    },
    { op: "db.query" },
  );

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(toDto(row, opponents));
}

export async function PATCH(
  request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id } = await params;
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

  const parsed = v.safeParse(battleRecordUpdateSchema, body);
  return match(parsed)
    .with({ success: false }, ({ issues }) => NextResponse.json({ error: issues }, { status: 422 }))
    .with({ success: true }, async ({ output: input }) => {
      try {
        const result = await withChildSpan(
          "db.battle-records.update",
          async (span) => {
            span.setAttribute("db.record_id", id);
            return db.transaction(async (tx) => {
              let effectiveTeamId = input.teamId;
              if (effectiveTeamId) {
                const [existingTeam] = await tx
                  .select({ id: teams.id })
                  .from(teams)
                  .where(and(eq(teams.id, effectiveTeamId), eq(teams.userId, userId)))
                  .limit(1);
                if (!existingTeam) {
                  effectiveTeamId = null;
                }
              }

              const updated = await tx
                .update(battleRecords)
                .set({
                  ...(input.teamId !== undefined && { teamId: effectiveTeamId ?? null }),
                  ...(input.result !== undefined && { result: input.result }),
                  ...(input.myTeam !== undefined && {
                    myTeam: input.myTeam as unknown as readonly TrainedPokemon[],
                  }),
                  ...(input.mySelection !== undefined && {
                    mySelection: input.mySelection ?? null,
                  }),
                  ...(input.rating !== undefined && { rating: input.rating ?? null }),
                  ...(input.tags !== undefined && { tags: input.tags ? [...input.tags] : [] }),
                  ...(input.notes !== undefined && { notes: input.notes ?? null }),
                  ...(input.playedAt !== undefined &&
                    input.playedAt !== null && { playedAt: new Date(input.playedAt) }),
                })
                .where(and(eq(battleRecords.id, id), eq(battleRecords.userId, userId)))
                .returning();

              if (updated.length === 0) {
                return { notFound: true as const };
              }

              // opponents が指定された場合は全置換
              if (input.opponents !== undefined) {
                await tx
                  .delete(battleRecordOpponents)
                  .where(eq(battleRecordOpponents.battleRecordId, id));

                if (input.opponents.length > 0) {
                  await tx.insert(battleRecordOpponents).values(
                    input.opponents.map((o) => ({
                      battleRecordId: id,
                      slotIndex: o.slotIndex,
                      pokemonSlug: o.pokemonSlug,
                      itemSlug: o.itemSlug ?? null,
                      abilitySlug: o.abilitySlug ?? null,
                      moves: o.moves ?? null,
                      selectionRole: o.selectionRole ?? null,
                      notes: o.notes ?? null,
                    })),
                  );
                }
              }

              const opponents = await tx
                .select()
                .from(battleRecordOpponents)
                .where(eq(battleRecordOpponents.battleRecordId, id));

              return { notFound: false as const, dto: toDto(updated[0], opponents) };
            });
          },
          { op: "db.query" },
        );

        return result.notFound
          ? NextResponse.json({ error: "Not found" }, { status: 404 })
          : NextResponse.json(result.dto);
      } catch (err) {
        console.error(`[PATCH /api/battle-records/${id} error]`, err);
        Sentry.captureException(err, { extra: { id, userId, input } });
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Failed to update battle record" },
          { status: 500 },
        );
      }
    })
    .exhaustive();
}

export async function DELETE(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub;

  await withChildSpan(
    "db.battle-records.delete",
    async (span) => {
      span.setAttribute("db.record_id", id);
      return db
        .delete(battleRecords)
        .where(and(eq(battleRecords.id, id), eq(battleRecords.userId, userId)));
    },
    { op: "db.query" },
  );

  return NextResponse.json({ success: true });
}
