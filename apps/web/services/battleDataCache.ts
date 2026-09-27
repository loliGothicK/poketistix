"use cache";

import { cacheLife, cacheTag } from "next/cache";
import * as v from "valibot";
import { withChildSpan } from "@/lib/otel";

const rowSchema = v.object({
  category: v.picklist([
    "move",
    "held_item",
    "teammate",
    "stat_alignment",
    "stat_points",
    "ability",
  ]),
  rank: v.number(),
  name: v.string(),
  percentage_value: v.nullable(v.number()),
});

const pokemonSchema = v.object({
  name: v.string(),
  battleName: v.string(),
  slug: v.string(),
  summary: v.optional(
    v.object({
      battleSummary: v.optional(
        v.record(
          v.string(),
          v.optional(
            v.object({
              Doubles: v.optional(
                v.object({
                  rows: v.optional(v.array(rowSchema), () => []),
                }),
              ),
              Singles: v.optional(
                v.object({
                  rows: v.optional(v.array(rowSchema), () => []),
                }),
              ),
            }),
          ),
        ),
      ),
    }),
  ),
});

export type PokemonCacheData = v.InferOutput<typeof pokemonSchema>;

// キャッシュ層：ファイルトップの "use cache" により全エクスポートがサーバー専用キャッシュ関数として扱われる
export async function fetchAndParseBattleData(
  format: string,
  slug: string,
  season: string = "Current",
): Promise<PokemonCacheData> {
  cacheLife("hours");
  cacheTag("battle-data-cache");

  const params = new URLSearchParams({
    format,
    season,
  });

  const res = await withChildSpan(
    "battle.fetch-external-data",
    async (span) => {
      span.setAttribute("battle.slug", slug);
      span.setAttribute("battle.format", format);
      const response = await fetch(`https://championsbattledata.com/api/pokemon/${slug}?${params}`);
      span.setAttribute("http.response_status_code", response.status);
      return response;
    },
    { op: "http.client" },
  );

  if (!res.ok) {
    // 意図的にthrowすることで、Next.jsのキャッシュ更新を失敗させ、古いキャッシュを維持させる
    throw new Error(`API returned ${res.status}`);
  }

  const rawJson = await res.json();
  // Valibotでパース（失敗時はValiErrorがthrowされ、これもキャッシュ更新をキャンセルさせる）
  return v.parse(pokemonSchema, rawJson);
}
