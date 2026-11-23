import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import * as v from "valibot";
import { match } from "ts-pattern";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { kifus } from "@/lib/db/schema";
import { genUlid } from "@/lib/db/ulid-type";
import { kifuInputSchema, parsePbnToKifuDocument, type Kifu } from "@/store/kifu/kifu";
import { withChildSpan } from "@/lib/otel";
import * as Sentry from "@sentry/nextjs";

type KifuRow = InferSelectModel<typeof kifus>;

const toDto = (row: KifuRow): Kifu => ({
  id: row.id,
  battleRecordId: row.battleRecordId,
  pbn: row.pbn,
  data: row.data,
  regulation: row.regulation,
  turnCount: row.turnCount,
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
  const battleRecordId = params.get("battleRecordId");

  const where = and(
    eq(kifus.userId, userId),
    battleRecordId ? eq(kifus.battleRecordId, battleRecordId) : undefined,
  );

  const rows = await withChildSpan(
    "db.kifus.list",
    async (span) => {
      if (battleRecordId) span.setAttribute("db.battle_record_id", battleRecordId);
      return db.select().from(kifus).where(where).orderBy(desc(kifus.createdAt));
    },
    { op: "db.query" },
  );

  return NextResponse.json(rows.map(toDto));
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

  const parsed = v.safeParse(kifuInputSchema, body);
  return match(parsed)
    .with({ success: false }, ({ issues }) => NextResponse.json({ error: issues }, { status: 422 }))
    .with({ success: true }, async ({ output: input }) => {
      const doc = parsePbnToKifuDocument(input.pbn);
      const regulation = input.regulation ?? doc.regulation ?? null;
      const turnCount = doc.turns.length;
      const battleRecordId = input.battleRecordId ?? null;

      try {
        const saved = await withChildSpan(
          "db.kifus.upsert",
          async (span) => {
            if (battleRecordId) span.setAttribute("db.battle_record_id", battleRecordId);
            span.setAttribute("kifu.turn_count", turnCount);

            // 同一 battleRecordId の棋譜が既に存在する場合は上書き更新する
            if (battleRecordId) {
              const existing = await db
                .select()
                .from(kifus)
                .where(and(eq(kifus.userId, userId), eq(kifus.battleRecordId, battleRecordId)))
                .limit(1);
              if (existing[0]) {
                const [updated] = await db
                  .update(kifus)
                  .set({
                    pbn: input.pbn,
                    data: doc,
                    regulation,
                    turnCount,
                    updatedAt: new Date(),
                  })
                  .where(and(eq(kifus.id, existing[0].id), eq(kifus.userId, userId)))
                  .returning();
                return updated!;
              }
            }

            const id = input.id ?? genUlid();
            const [inserted] = await db
              .insert(kifus)
              .values({
                id,
                userId,
                battleRecordId,
                pbn: input.pbn,
                data: doc,
                regulation,
                turnCount,
              })
              .returning();
            return inserted!;
          },
          { op: "db.query" },
        );

        return NextResponse.json(toDto(saved), { status: 201 });
      } catch (err) {
        Sentry.captureException(err, {
          extra: { battleRecordId, turnCount },
        });
        return NextResponse.json({ error: "Failed to save kifu" }, { status: 500 });
      }
    })
    .exhaustive();
}
