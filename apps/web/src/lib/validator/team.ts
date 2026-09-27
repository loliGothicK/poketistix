import * as v from "valibot";
import { pokemonByIdentifier } from "@/data/pokemon";
import { trainedPokemonSchema, trainedPokemonSaveSchema } from "./trained-pokemon";

export const teamSaveSchema = v.object({
  id: v.string(),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  description: v.optional(v.pipe(v.string(), v.maxLength(30000))),
  pokepaste: v.optional(v.string()),
  members: v.pipe(v.array(v.nullable(trainedPokemonSaveSchema)), v.maxLength(6)),
});

export const teamsSaveSchema = v.array(teamSaveSchema);

export const teamSchema = v.pipe(
  v.object({
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    members: v.pipe(v.array(v.nullable(trainedPokemonSchema)), v.length(6)),
  }),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const team = dataset.value;

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
        addIssue({
          message: `Duplicate item. Each Pokemon must have a unique item.`,
          path: [
            { type: "object", origin: "value", input: team, key: "members", value: team.members },
            { type: "array", origin: "value", input: team.members, key: i, value: member },
            { type: "object", origin: "value", input: member, key: "item", value: member.item },
          ],
        });
      }

      const pokemonBaseData = pokemonByIdentifier.get(member.identifier);
      if (pokemonBaseData && duplicateSpecies.has(pokemonBaseData.species_id)) {
        addIssue({
          message: `Duplicate species. Each Pokemon must have a unique species.`,
          path: [
            { type: "object", origin: "value", input: team, key: "members", value: team.members },
            { type: "array", origin: "value", input: team.members, key: i, value: member },
            {
              type: "object",
              origin: "value",
              input: member,
              key: "identifier",
              value: member.identifier,
            },
          ],
        });
      }
    }
  }),
);

export const teamsSchema = v.array(teamSchema);
