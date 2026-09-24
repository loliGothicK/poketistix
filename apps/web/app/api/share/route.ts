import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { sharedTeams } from "@/lib/db/schema";
import { genUlid } from "@/lib/db/ulid-type";
import { z } from "zod";
import { match } from "ts-pattern";
import { withChildSpan } from "@/lib/otel";
import type { SharedTeamSnapshot } from "@/lib/db/schema";
import { trainedPokemonSchema } from "@/lib/validator/trained-pokemon";

// members の中身は実行時に TrainedPokemon 形式であることをクライアントが保証するが、
// Zod 側では passthrough() で受け付け、DB 挿入時に型キャストする。
const snapshotSchema = z
  .object({
    teamName: z.string().min(1).max(100),
    description: z.string().max(2000).optional(),
    members: z.array(trainedPokemonSchema.nullable()).length(6),
    showStats: z.boolean(),
  })
  .superRefine((snapshot, ctx) => {
    const items = new Set<number>();
    for (let i = 0; i < snapshot.members.length; i++) {
      const member = snapshot.members[i];
      if (member && member.item !== null && member.item !== undefined) {
        if (items.has(member.item)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate item found: ${member.item}. Each Pokemon must have a unique item.`,
            path: ["members", i, "item"],
          });
        }
        items.add(member.item);
      }
    }
  })
  .readonly();

export async function POST(request: Request) {
  // 認証は任意（ゲストシェアも許可）
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const createdBy = claims?.claims.sub ?? null;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = snapshotSchema.safeParse(body);
  return match(parsed)
    .with({ success: false }, ({ error }) =>
      NextResponse.json({ error: error.issues }, { status: 422 }),
    )
    .with({ success: true }, async ({ data: snapshot }) => {
      const id = genUlid();
      await withChildSpan(
        "db.share.create",
        async (_span) =>
          db.insert(sharedTeams).values({
            id,
            createdBy,
            snapshot: snapshot as unknown as SharedTeamSnapshot,
          }),
        { op: "db.query" },
      );
      return NextResponse.json({ id }, { status: 201 });
    })
    .exhaustive();
}
