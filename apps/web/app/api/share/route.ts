import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { sharedTeams } from "@/lib/db/schema";
import { genUlid } from "@/lib/db/ulid-type";
import * as v from "valibot";
import { match } from "ts-pattern";
import { withChildSpan } from "@/lib/otel";
import type { SharedTeamSnapshot } from "@/lib/db/schema";
import { trainedPokemonSchema } from "@/lib/validator/trained-pokemon";

// members の中身は実行時に TrainedPokemon 形式であることをクライアントが保証するが、
// Valibot 側では looseObject で受け付け、DB 挿入時に型キャストする。
const snapshotSchema = v.pipe(
  v.object({
    teamName: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
    description: v.optional(v.pipe(v.string(), v.maxLength(2000))),
    members: v.pipe(v.array(v.nullable(trainedPokemonSchema)), v.length(6)),
    showStats: v.boolean(),
  }),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const snapshot = dataset.value;
    const items = new Set<number>();
    for (let i = 0; i < snapshot.members.length; i++) {
      const member = snapshot.members[i];
      if (member && member.item !== null && member.item !== undefined) {
        if (items.has(member.item as number)) {
          addIssue({
            message: `Duplicate item found: ${member.item}. Each Pokemon must have a unique item.`,
            path: [
              {
                type: "object",
                origin: "value",
                input: snapshot,
                key: "members",
                value: snapshot.members,
              },
              {
                type: "array",
                origin: "value",
                input: snapshot.members,
                key: i,
                value: member,
              },
              {
                type: "object",
                origin: "value",
                input: member,
                key: "item",
                value: member.item,
              },
            ],
          });
        }
        items.add(member.item as number);
      }
    }
  }),
);

export async function POST(request: Request) {
  // 認証は任意（ゲストシェアも許可）
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const createdBy = claims?.claims.sub ?? null;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = v.safeParse(snapshotSchema, body);
  return match(parsed)
    .with({ success: false }, ({ issues }) => NextResponse.json({ error: issues }, { status: 422 }))
    .with({ success: true }, async ({ output: snapshot }) => {
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
