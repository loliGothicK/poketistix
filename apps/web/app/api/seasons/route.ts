import { NextResponse } from "next/server";
import { match } from "ts-pattern";

import { createClient } from "@/lib/supabase/server";

import { seasons } from "@/lib/db/schema";
import { seasonInputSchema, type Season } from "@/store/battle-record/battleRecord";
import type { InferSelectModel } from "drizzle-orm";
import { SeasonFactory } from "@/lib/db/factories/seasonFactory";
import { createSeason, listSeasons } from "@/lib/db/repositories/seasonRepository";
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

export async function GET(_request: Request) {
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub;

  const resultTask = listSeasons(userId);
  const result = await resultTask();

  if (isLeft(result)) {
    return NextResponse.json({ error: result.left.toString() }, { status: 500 });
  }

  return NextResponse.json(result.right.map(toDto));
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

  const parsed = v.safeParse(seasonInputSchema, body);
  return match(parsed)
    .with({ success: false }, ({ issues }) => NextResponse.json({ error: issues }, { status: 422 }))
    .with({ success: true }, async ({ output: input }) => {
      const factory = new SeasonFactory()
        .withUserId(userId)
        .withName(input.name)
        .withFormat(input.format)
        .withRuleMark(input.ruleMark ?? null)
        .withStartedAt(input.startedAt ?? null)
        .withEndedAt(input.endedAt ?? null);

      if (input.id) factory.withId(input.id);

      const resultTask = createSeason(factory.build());
      const result = await resultTask();

      if (isLeft(result)) {
        return NextResponse.json({ error: result.left.toString() }, { status: 500 });
      }

      return NextResponse.json(toDto(result.right), { status: 201 });
    })
    .exhaustive();
}
