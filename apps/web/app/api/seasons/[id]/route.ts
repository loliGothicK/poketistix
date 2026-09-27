import { NextResponse } from "next/server";
import { match } from "ts-pattern";

import { createClient } from "@/lib/supabase/server";

import { seasons } from "@/lib/db/schema";
import { seasonUpdateSchema, type Season } from "@/store/battle-record/battleRecord";
import type { InferSelectModel } from "drizzle-orm";
import { updateSeason, deleteSeason } from "@/lib/db/repositories/seasonRepository";
import type { InsertSeason } from "@/lib/db/factories/seasonFactory";
import { isLeft } from "fp-ts/Either";
import * as v from "valibot";

const toDto = (row: InferSelectModel<typeof seasons>): Season => ({
  id: row.id,
  name: row.name,
  format: row.format,
  ruleMark: row.ruleMark,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

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

  const parsed = v.safeParse(seasonUpdateSchema, body);
  return match(parsed)
    .with({ success: false }, ({ issues }) => NextResponse.json({ error: issues }, { status: 422 }))
    .with({ success: true }, async ({ output: input }) => {
      const resultTask = updateSeason(id, userId, input as Partial<InsertSeason>);
      const result = await resultTask();

      if (isLeft(result)) {
        return NextResponse.json({ error: result.left.toString() }, { status: 500 });
      }

      if (!result.right) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(toDto(result.right));
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

  const resultTask = deleteSeason(id, userId);
  const result = await resultTask();

  if (isLeft(result)) {
    return NextResponse.json({ error: result.left.toString() }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
