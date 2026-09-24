import { z } from "zod";
import { pokemonByIdentifier } from "@/data/pokemon";
import { trainedPokemonSchema, trainedPokemonSaveSchema } from "./trained-pokemon";

export const teamSaveSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(30000).optional(),
  pokepaste: z.string().optional(),
  members: z.array(trainedPokemonSaveSchema.nullable()).max(6),
});

export const teamsSaveSchema = z.array(teamSaveSchema);

export const teamSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    members: z.array(trainedPokemonSchema.nullable()).length(6),
  })
  .superRefine((team, ctx) => {
    // --- Pass 1: 重複しているアイテム・species_id を洗い出す ---
    const itemCount = new Map<number, number>();
    const speciesCount = new Map<number, number>();

    for (const member of team.members) {
      if (!member) continue;
      if (member.item !== null && member.item !== undefined) {
        itemCount.set(member.item, (itemCount.get(member.item) ?? 0) + 1);
      }
      const pokemonBaseData = pokemonByIdentifier.get(member.identifier);
      if (pokemonBaseData) {
        speciesCount.set(
          pokemonBaseData.species_id,
          (speciesCount.get(pokemonBaseData.species_id) ?? 0) + 1,
        );
      }
    }

    const duplicateItems = new Set(
      [...itemCount.entries()].filter(([, count]) => count > 1).map(([id]) => id),
    );
    const duplicateSpecies = new Set(
      [...speciesCount.entries()].filter(([, count]) => count > 1).map(([id]) => id),
    );

    // --- Pass 2: 重複に関わる全メンバーにエラーを付ける ---
    for (let i = 0; i < team.members.length; i++) {
      const member = team.members[i];
      if (!member) continue;

      if (member.item !== null && member.item !== undefined && duplicateItems.has(member.item)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate item. Each Pokemon must have a unique item.`,
          path: ["members", i, "item"],
        });
      }

      const pokemonBaseData = pokemonByIdentifier.get(member.identifier);
      if (pokemonBaseData && duplicateSpecies.has(pokemonBaseData.species_id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate species. Each Pokemon must have a unique species.`,
          path: ["members", i, "identifier"],
        });
      }
    }
  });

export const teamsSchema = z.array(teamSchema);
