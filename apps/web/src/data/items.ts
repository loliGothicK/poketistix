import { data } from "@poketistix/data/champions/items.json";
import * as v from "valibot";

const ItemCategorySchema = v.picklist(["berry", "held-item", "mega-evolution"]);

const ItemSchema = v.object({
  id: v.number(),
  identifier: v.string(),
  category: ItemCategorySchema,
});

export type Item = v.InferOutput<typeof ItemSchema>;
export type ItemCategory = v.InferOutput<typeof ItemCategorySchema>;

export const itemList: readonly Item[] = data.map((entry) => v.parse(ItemSchema, entry));

export const itemById = new Map(itemList.map((item) => [item.id, item]));
export const itemByIdentifier = new Map(itemList.map((item) => [item.identifier, item]));
