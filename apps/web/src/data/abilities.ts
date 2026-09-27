import { data } from "@poketistix/data/master/abilities.json";
import * as v from "valibot";

const AbilitySchema = v.object({
  id: v.number(),
  identifier: v.string(),
});

export type Ability = v.InferOutput<typeof AbilitySchema>;

export const abilityList: readonly Ability[] = data.map((entry) => v.parse(AbilitySchema, entry));

export const abilityById = new Map(abilityList.map((ability) => [ability.id, ability]));
export const abilityByIdentifier = new Map(
  abilityList.map((ability) => [ability.identifier, ability]),
);
