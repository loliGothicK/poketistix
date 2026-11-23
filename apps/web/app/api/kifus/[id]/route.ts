import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import * as v from "valibot";
import { match } from "ts-pattern";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { kifus } from "@/lib/db/schema";
import { kifuUpdateSchema, parsePbnToKifuDocument, type Kifu } from "@/store/kifu/kifu";
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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub;
  const { id } = await context.params;

  const rows = await withChildSpan(
    "db.kifus.get",
    () =>
      db
        .select()
        .from(kifus)
        .where(and(eq(kifus.id, id), eq(kifus.userId, userId)))
        .limit(1),
    { op: "db.query" },
  );

  if (!rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toDto(rows[0]));
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub;
  const { id } = await context.params;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = v.safeParse(kifuUpdateSchema, body);
  return match(parsed)
    .with({ success: false }, ({ issues }) => NextResponse.json({ error: issues }, { status: 422 }))
    .with({ success: true }, async ({ output: input }) => {
      try {
        const updateSet: Record<string, unknown> = { updatedAt: new Date() };
        if (input.battleRecordId !== undefined) {
          updateSet.battleRecordId = input.battleRecordId;
        }
        if (input.pbn !== undefined) {
          const doc = parsePbnToKifuDocument(input.pbn);
          updateSet.pbn = input.pbn;
          updateSet.data = doc;
          updateSet.turnCount = doc.turns.length;
          if (input.regulation === undefined) {
            updateSet.regulation = doc.regulation ?? null;
          }
        }
        if (input.regulation !== undefined) {
          updateSet.regulation = input.regulation;
        }

        const [updated] = await withChildSpan(
          "db.kifus.update",
          () =>
            db
              .update(kifus)
              .set(updateSet)
              .where(and(eq(kifus.id, id), eq(kifus.userId, userId)))
              .returning(),
          { op: "db.query" },
        );

        if (!updated) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json(toDto(updated));
      } catch (err) {
        Sentry.captureException(err, { extra: { id } });
        return NextResponse.json({ error: "Failed to update kifu" }, { status: 500 });
      }
    })
    .exhaustive();
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub;
  const { id } = await context.params;

  const deleted = await withChildSpan(
    "db.kifus.delete",
    () =>
      db
        .delete(kifus)
        .where(and(eq(kifus.id, id), eq(kifus.userId, userId)))
        .returning({ id: kifus.id }),
    { op: "db.query" },
  );

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
