import { defineCollection, defineConfig, type Context } from "@content-collections/core";
import { compileMDX } from "@content-collections/mdx";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import * as v from "valibot";
import { P, match } from "ts-pattern";

type MDXDocument = Parameters<typeof compileMDX>[1];

const transformer =
  ({ withHeadings }: { withHeadings: boolean } = { withHeadings: true }) =>
  async <T extends MDXDocument>(document: T, context: Context) => {
    const mdx = await compileMDX(context, document, {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeSlug],
    });

    const parts = document._meta.path.replace(/\\/g, "/").split("/");
    if (parts[0] !== "en" && parts[0] !== "ja") {
      throw new Error(
        `Invalid content file location: "${document._meta.filePath}". Content files must be placed inside an "en/" or "ja/" directory.`,
      );
    }
    const locale = parts[0];
    const slug = parts.slice(1).join("/");

    return {
      ...document,
      slug,
      locale,
      mdx,
      ...(withHeadings && { headings: extractHeadings(document.content) }),
    };
  };

export type Heading = {
  readonly id: string;
  readonly text: string;
  readonly level: 2 | 3;
};

function extractHeadings(content: string): Heading[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const headings: Heading[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length as 2 | 3;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s\u3040-\u9FFF\uAC00-\uD7AF]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    headings.push({ id, text, level });
  }
  return headings;
}

const posts = defineCollection({
  name: "posts",
  directory: "content/blog",
  include: "**/*.mdx",
  schema: v.object({
    title: v.string(),
    description: v.string(),
    date: v.pipe(
      v.unknown(),
      v.transform((input) => (input instanceof Date ? input : new Date(input as string | number))),
    ),
    tags: v.optional(v.array(v.string()), () => []),
    draft: v.optional(v.boolean(), () => false),
    content: v.string(),
  }),
  transform: transformer({ withHeadings: true }),
});

const docs = defineCollection({
  name: "docs",
  directory: "content/docs",
  include: "**/*.mdx",
  schema: v.object({
    title: v.string(),
    description: v.optional(v.string()),
    order: v.optional(v.number(), () => 0),
    group: v.optional(v.string()),
    content: v.string(),
  }),
  transform: transformer({ withHeadings: true }),
});

const tsumePokemonSchema = v.object({
  species: v.string(),
  hpCurrent: v.optional(v.number()), // Make optional if some puzzles don't strictly require HP to be tracked
  hpMax: v.optional(v.number()),
  stats: v.optional(v.object({ spe: v.optional(v.number()) })),
  moves: v.optional(v.array(v.string())),
  item: v.optional(v.string()),
  ability: v.optional(v.string()),
  nature: v.optional(v.string()),
  status: v.optional(v.string()),
  volatiles: v.optional(v.array(v.string())),
});

const practicalDataSchema = v.object({
  attacker: v.object({
    species: v.string(),
    evs: v.string(),
    item: v.string(),
    nature: v.string(),
    boosts: v.optional(v.string()),
  }),
  defender: v.object({
    species: v.string(),
    evs: v.string(),
    item: v.string(),
    nature: v.string(),
    hpPercent: v.optional(v.number()),
  }),
  ally: v.optional(
    v.object({
      species: v.string(),
      item: v.optional(v.string()),
    }),
  ),
  opponentAlly: v.optional(
    v.object({
      species: v.string(),
      item: v.optional(v.string()),
    }),
  ),
  move: v.string(),
  field: v.optional(
    v.object({
      weather: v.optional(v.string()),
      terrain: v.optional(v.string()),
    }),
  ),
});

const tsumeSideSchema = v.object({
  active: v.array(tsumePokemonSchema),
  bench: v.optional(v.array(tsumePokemonSchema)),
});

const tsumeDataSchema = v.object({
  playerSide: tsumeSideSchema,
  opponentSide: tsumeSideSchema,
  field: v.optional(
    v.object({
      weather: v.optional(v.string()),
      terrain: v.optional(v.string()),
      trickRoom: v.optional(v.boolean()),
    }),
  ),
  rngControl: v.optional(
    v.object({
      mode: v.picklist(["deterministic", "probabilistic"]),
      iterations: v.optional(v.number()),
      crits: v.optional(v.picklist(["none", "always", "vanilla"])),
      accuracy: v.optional(v.picklist(["perfect", "worst_case", "vanilla"])),
      secondaryEffects: v.optional(v.picklist(["none", "always", "vanilla"])),
      damageRoll: v.optional(v.picklist(["max", "min", "expected", "worst_case", "vanilla"])),
      speedTies: v.optional(v.picklist(["player_wins", "opponent_wins", "vanilla"])),
    }),
  ),
  correctMoves: v.array(v.string()),
  opponentResponses: v.optional(v.record(v.string(), v.string())),
});

const quizzes = defineCollection({
  name: "quizzes",
  directory: "content/quiz",
  include: "**/*.mdx",
  schema: v.pipe(
    v.object({
      format: v.picklist([
        "choices",
        "multi_select",
        "ordering",
        "grouping",
        "one_way",
        "input",
        "tsume_action",
      ]),
      generation: v.optional(v.number()),
      question: v.string(),
      options: v.optional(v.array(v.string())),

      // Answer fields (all optional; validated by refinements below)
      correctAnswerIndex: v.optional(v.number()),
      correctAnswerIndices: v.optional(v.array(v.number())),
      correctAnswer: v.optional(v.string()), // only for 'input' format
      correctOrderIndices: v.optional(v.array(v.number())),
      correctGroups: v.optional(v.record(v.string(), v.array(v.string()))),

      practicalData: v.optional(practicalDataSchema),
      tsumeData: v.optional(tsumeDataSchema),
      reviewed: v.optional(v.boolean(), () => false),
      content: v.string(),
    }),
    // Refinement 1: Answer field must be present and correct for the format
    v.check(
      (data) =>
        match(data.format)
          .with(
            "multi_select",
            () => data.correctAnswerIndices !== undefined && data.correctAnswerIndices.length > 0,
          )
          .with(
            "ordering",
            () => data.correctOrderIndices !== undefined && data.correctOrderIndices.length === 4,
          )
          .with(
            "grouping",
            () => data.correctGroups !== undefined && Object.keys(data.correctGroups).length >= 2,
          )
          .with(
            P.union("choices", "one_way"),
            () => data.correctAnswerIndex !== undefined && data.correctAnswerIndex >= 0,
          )
          .with("input", () => data.correctAnswer !== undefined && data.correctAnswer.length > 0)
          .with("tsume_action", () => true)
          .exhaustive(),
      "Answer field must match format type",
    ),
    // Refinement 2: Options count must satisfy per-format constraints
    v.check((data) => {
      if (data.format === "input" || data.format === "tsume_action") {
        return true; // these formats do not require options
      }

      if (!data.options || data.options.length === 0) {
        return false;
      }

      const count = data.options.length;

      return match({ format: data.format, count })
        .with({ format: "multi_select", count: P.number.between(3, 4) }, () => true)
        .with({ format: "ordering", count: 4 }, () => true)
        .with({ format: "grouping", count: P.number.between(3, 5) }, () => true)
        .with({ format: "one_way", count: P.number.between(2, 6) }, () => true)
        .with({ format: "choices", count: P.number.between(2, 4) }, () => true)
        .otherwise(() => false);
    }, "Options count must match format requirements"),
  ),
  transform: async (document, context) => {
    const transformed = await transformer({ withHeadings: false })(document, context);
    const parts = document._meta.path.replace(/\\/g, "/").split("/");
    const difficulty = parts[1] as "basics" | "advanced" | "expert" | "master";
    const category = parts[2] as "academic" | "damage_calc" | "tsume";
    const id = parts[parts.length - 1].replace(/\.mdx$/, "");

    // Refinement 3: Only certain formats are allowed per difficulty level
    if (difficulty === "basics" || difficulty === "advanced") {
      if (document.format !== "choices") {
        throw new Error(
          `Format ${document.format} not allowed for difficulty ${difficulty}. choices only.`,
        );
      }
    } else if (difficulty === "expert") {
      if (!["choices", "multi_select", "ordering", "tsume_action"].includes(document.format)) {
        throw new Error(`Format ${document.format} not allowed for difficulty ${difficulty}.`);
      }
    } else if (difficulty === "master") {
      if (
        !["choices", "multi_select", "ordering", "grouping", "one_way", "tsume_action"].includes(
          document.format,
        )
      ) {
        throw new Error(`Format ${document.format} not allowed for difficulty ${difficulty}.`);
      }
    } else {
      throw new Error(`Unknown difficulty: ${String(difficulty)}`);
    }

    // Refinement 4: tsume_action format requirements
    if (document.format === "tsume_action") {
      if (category !== "tsume" || document.tsumeData === undefined) {
        throw new Error(
          "tsume_action format requires category to be 'tsume' and tsumeData to be provided",
        );
      }
    }

    return {
      ...transformed,
      id,
      difficulty,
      category,
    };
  },
});

export default defineConfig({
  content: [posts, docs, quizzes],
});
