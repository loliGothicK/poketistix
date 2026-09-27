import { NextResponse } from "next/server";
import { match } from "ts-pattern";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { dashboards } from "@/lib/db/schema";
import { genUlid } from "@/lib/db/ulid-type";
import { dashboardInputSchema, type Dashboard } from "@/store/dashboard/dashboard";
import { withChildSpan } from "@/lib/otel";
import type { InferSelectModel } from "drizzle-orm";
import * as v from "valibot";

type DashboardRow = InferSelectModel<typeof dashboards>;

const toDto = (row: DashboardRow): Dashboard => ({
  id: row.id,
  name: row.name,
  isDefault: row.isDefault,
  layout: row.layout,
  variables: (row.variables ??
    []) as readonly import("@/store/dashboard/dashboard").DashboardVariable[],
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

  const rows = await withChildSpan(
    "db.dashboards.list",
    async (_span) =>
      db
        .select()
        .from(dashboards)
        .where(eq(dashboards.userId, userId))
        .orderBy(dashboards.createdAt),
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

  const parsed = v.safeParse(dashboardInputSchema, body);
  return match(parsed)
    .with({ success: false }, ({ issues }) => NextResponse.json({ error: issues }, { status: 422 }))
    .with({ success: true }, async ({ output: input }) => {
      const id = input.id ?? genUlid();
      const isDefault = input.isDefault ?? false;

      const dto = await withChildSpan(
        "db.dashboards.create",
        async (_span) => {
          return db.transaction(async (tx) => {
            if (isDefault) {
              await tx
                .update(dashboards)
                .set({ isDefault: false })
                .where(and(eq(dashboards.userId, userId), eq(dashboards.isDefault, true)));
            }

            const [row] = await tx
              .insert(dashboards)
              .values({
                id,
                userId,
                name: input.name,
                isDefault,
                layout: input.layout ?? [],
                variables: input.variables ?? [],
              })
              .returning();

            return toDto(row);
          });
        },
        { op: "db.query" },
      );

      return NextResponse.json(dto, { status: 201 });
    })
    .exhaustive();
}
