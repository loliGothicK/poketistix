import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { teams, teamRevisions } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { withChildSpan } from "@/lib/otel";

export async function GET(
  _request: Request,
  props: { readonly params: Promise<{ readonly id: string }> },
) {
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub;
  const { id: teamId } = await props.params;

  const result = await withChildSpan(
    "db.teams.revisions.list",
    async (_span) => {
      // チームが本人のものか確認
      const [team] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.id, teamId), eq(teams.userId, userId)));

      if (!team) {
        return null;
      }

      return db
        .select({
          id: teamRevisions.id,
          teamId: teamRevisions.teamId,
          diff: teamRevisions.diff,
          snapshot: teamRevisions.snapshot,
          createdAt: teamRevisions.createdAt,
        })
        .from(teamRevisions)
        .where(eq(teamRevisions.teamId, teamId))
        .orderBy(asc(teamRevisions.createdAt));
    },
    { op: "db.query" },
  );

  if (result === null) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
