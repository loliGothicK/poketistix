import { data } from "@poketistix/data/champions/items.json";
import * as v from "valibot";

const ItemCategorySchema = v.picklist(["berry", "held-item", "mega-evolution"]);

export const ItemTypeSchema = v.picklist([
  "mega-evolution",
  "recovery",
  "defense",
  "power-boost",
  "other",
  "stat-boost",
  "effect-extend",
]);

const ItemSchema = v.object({
  id: v.number(),
  identifier: v.string(),
  category: ItemCategorySchema,
  type: ItemTypeSchema,
});

export type Item = v.InferOutput<typeof ItemSchema>;
export type ItemCategory = v.InferOutput<typeof ItemCategorySchema>;
export type ItemType = v.InferOutput<typeof ItemTypeSchema>;

export const itemList: readonly Item[] = data.map((entry) => v.parse(ItemSchema, entry));

export const itemById = new Map(itemList.map((item) => [item.id, item]));
export const itemByIdentifier = new Map(itemList.map((item) => [item.identifier, item]));
