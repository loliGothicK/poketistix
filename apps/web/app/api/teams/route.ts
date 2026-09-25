import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { teams, teamMembers, boxPokemon, teamRevisions } from "@/lib/db/schema";
import { eq, inArray, sql, asc, and } from "drizzle-orm";
import { withChildSpan } from "@/lib/otel";
import type { Team, TrainedPokemon } from "@/store/team/team";
import { teamsSaveSchema } from "@/lib/validator/team";
import { exportPokepaste } from "@/lib/pokepaste";
import { ulid } from "ulid";
import { buildTeamSnapshot, diffTeamSnapshots, isEmptyTeamDiff } from "@/lib/team-diff";

export async function GET(_request: Request) {
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub;

  const result = await withChildSpan(
    "db.teams.list",
    async (_span) => {
      const userTeams = await db
        .select()
        .from(teams)
        .where(eq(teams.userId, userId))
        .orderBy(asc(teams.createdAt));

      if (userTeams.length === 0) return [];

      const teamIds = userTeams.map((t) => t.id);

      const members = await db
        .select({
          teamId: teamMembers.teamId,
          slotIndex: teamMembers.slotIndex,
          boxId: boxPokemon.id,
          slug: boxPokemon.slug,
          data: boxPokemon.data,
        })
        .from(teamMembers)
        .innerJoin(boxPokemon, eq(teamMembers.boxPokemonId, boxPokemon.id))
        .where(inArray(teamMembers.teamId, teamIds));

      return userTeams.map((team) => {
        const slots = Array<TrainedPokemon | null>(6).fill(null);
        members
          .filter((m) => m.teamId === team.id)
          .forEach((m) => {
            const data = m.data as Omit<TrainedPokemon, "boxId">;
            slots[m.slotIndex] = { boxId: m.boxId, ...data };
          });
        return {
          id: team.id,
          name: team.name,
          description: team.description ?? undefined,
          members: slots,
        } satisfies Team;
      });
    },
    { op: "db.query" },
  );

  return NextResponse.json(result);
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

  // body は配列（後方互換）または { teams, commitMessage } オブジェクト
  let rawTeams: unknown;
  let commitMessage: string | undefined;
  if (Array.isArray(body)) {
    rawTeams = body;
  } else if (body && typeof body === "object" && "teams" in body) {
    rawTeams = body.teams;
    commitMessage =
      typeof body.commitMessage === "string" ? body.commitMessage.slice(0, 200) : undefined;
  } else {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = teamsSaveSchema.safeParse(rawTeams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 422 });
  }

  const incomingTeams = parsed.data;

  await withChildSpan(
    "db.teams.save",
    async (span) => {
      span.setAttribute("db.team_count", incomingTeams.length);
      await db.transaction(async (tx) => {
        // 1. Batch upsert teams
        await tx
          .insert(teams)
          .values(
            incomingTeams.map((team) => ({
              id: team.id,
              userId,
              name: team.name,
              description: team.description ?? null,
            })),
          )
          .onConflictDoUpdate({
            target: teams.id,
            set: {
              name: sql`excluded.name`,
              description: sql`excluded.description`,
            },
          });

        // 2. Collect unique non-null members across all teams
        const allNonNullMembers: {
          readonly member: TrainedPokemon;
          readonly teamId: string;
          readonly slot: number;
        }[] = [];
        const boxMap = new Map<string, typeof boxPokemon.$inferInsert>();

        for (const team of incomingTeams) {
          team.members.forEach((member, slot) => {
            if (member !== null) {
              allNonNullMembers.push({
                member: member as unknown as TrainedPokemon,
                teamId: team.id,
                slot,
              });
              const { boxId, identifier, slug, ...data } = member;
              boxMap.set(boxId, {
                id: boxId,
                userId,
                slug: identifier,
                inBox: false,
                data: { identifier, slug, ...data },
              });
            }
          });
        }

        // 3. Batch upsert all boxPokemon in a single query
        if (boxMap.size > 0) {
          await tx
            .insert(boxPokemon)
            .values(Array.from(boxMap.values()))
            .onConflictDoUpdate({
              target: boxPokemon.id,
              set: {
                slug: sql`excluded.slug`,
                data: sql`excluded.data`,
              },
            });
        }

        // 4. Batch delete existing team members for all incoming teams
        const teamIds = incomingTeams.map((t) => t.id);
        if (teamIds.length > 0) {
          await tx.delete(teamMembers).where(inArray(teamMembers.teamId, teamIds));
        }

        // 5. Batch insert new team members in a single query
        if (allNonNullMembers.length > 0) {
          await tx.insert(teamMembers).values(
            allNonNullMembers.map(({ member, teamId, slot }) => ({
              teamId,
              slotIndex: slot,
              boxPokemonId: member.boxId,
            })),
          );
        }

        // 6. Record snapshot + semantic diff for teams whose content has changed
        if (teamIds.length > 0) {
          const existingRevisions = await tx
            .select({
              teamId: teamRevisions.teamId,
              snapshot: teamRevisions.snapshot,
              createdAt: teamRevisions.createdAt,
            })
            .from(teamRevisions)
            .where(and(eq(teamRevisions.userId, userId), inArray(teamRevisions.teamId, teamIds)))
            .orderBy(asc(teamRevisions.createdAt));

          const latestByTeamId = new Map<string, (typeof existingRevisions)[number]>();
          for (const rev of existingRevisions) {
            latestByTeamId.set(rev.teamId, rev);
          }

          const revisionsToInsert: (typeof teamRevisions.$inferInsert)[] = [];

          for (const team of incomingTeams) {
            let currentPokepaste = team.pokepaste;
            if (typeof currentPokepaste !== "string") {
              try {
                currentPokepaste = exportPokepaste(team as unknown as Team);
              } catch {
                currentPokepaste = "";
              }
            }

            const snapshot = buildTeamSnapshot(
              {
                name: team.name,
                description: team.description,
                members: team.members as unknown as Team["members"],
              },
              currentPokepaste,
            );

            const latest = latestByTeamId.get(team.id)?.snapshot ?? null;
            const diff = diffTeamSnapshots(latest, snapshot, commitMessage);
            if (latest === null || !isEmptyTeamDiff(diff)) {
              revisionsToInsert.push({
                id: ulid(),
                teamId: team.id,
                userId,
                diff,
                snapshot,
              });
            }
          }

          if (revisionsToInsert.length > 0) {
            await tx.insert(teamRevisions).values(revisionsToInsert);
          }
        }
      });
    },
    { op: "db.query" },
  );

  return NextResponse.json({ success: true });
}
