import { NextResponse } from "next/server";
import { match } from "ts-pattern";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { dashboards, type DashboardVariable } from "@/lib/db/schema";
import { dashboardUpdateSchema, type Dashboard } from "@/store/dashboard/dashboard";
import { withChildSpan } from "@/lib/otel";
import type { InferSelectModel } from "drizzle-orm";
import * as v from "valibot";

type DashboardRow = InferSelectModel<typeof dashboards>;

const toDto = (row: DashboardRow): Dashboard => ({
  id: row.id,
  name: row.name,
  isDefault: row.isDefault,
  layout: row.layout,
  variables: (row.variables ?? []) as readonly DashboardVariable[],
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

  const [row] = await withChildSpan(
    "db.dashboards.get",
    async (span) => {
      span.setAttribute("db.dashboard_id", id);
      return db
        .select()
        .from(dashboards)
        .where(and(eq(dashboards.id, id), eq(dashboards.userId, userId)));
    },
    { op: "db.query" },
  );

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(toDto(row));
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

  const parsed = v.safeParse(dashboardUpdateSchema, body);
  return match(parsed)
    .with({ success: false }, ({ issues }) => NextResponse.json({ error: issues }, { status: 422 }))
    .with({ success: true }, async ({ output: input }) => {
      const result = await withChildSpan(
        "db.dashboards.update",
        async (span) => {
          span.setAttribute("db.dashboard_id", id);
          return db.transaction(async (tx) => {
            if (input.isDefault === true) {
              await tx
                .update(dashboards)
                .set({ isDefault: false })
                .where(and(eq(dashboards.userId, userId), eq(dashboards.isDefault, true)));
            }

            const updated = await tx
              .update(dashboards)
              .set({
                ...(input.name !== undefined && { name: input.name }),
                ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
                ...(input.layout !== undefined && { layout: input.layout }),
                ...(input.variables !== undefined && { variables: input.variables }),
              })
              .where(and(eq(dashboards.id, id), eq(dashboards.userId, userId)))
              .returning();

            if (updated.length === 0) {
              return { notFound: true as const };
            }

            return { notFound: false as const, dto: toDto(updated[0]) };
          });
        },
        { op: "db.query" },
      );

      return result.notFound
        ? NextResponse.json({ error: "Not found" }, { status: 404 })
        : NextResponse.json(result.dto);
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
    "db.dashboards.delete",
    async (span) => {
      span.setAttribute("db.dashboard_id", id);
      return db.delete(dashboards).where(and(eq(dashboards.id, id), eq(dashboards.userId, userId)));
    },
    { op: "db.query" },
  );

  return NextResponse.json({ success: true });
}
