import { Item, ItemType, itemList, itemById, itemByIdentifier } from "@/data/items";
import type { FetchResponse } from "@services/battleData";
import type { Result } from "neverthrow";

export type ItemGroup = "popular" | ItemType;

export interface ItemOption extends Item {
  readonly group: ItemGroup;
  readonly rank?: number;
  readonly percentage?: number;
}

export const ITEM_TYPE_ORDER: readonly ItemType[] = [
  "power-boost",
  "defense",
  "recovery",
  "stat-boost",
  "effect-extend",
  "mega-evolution",
  "other",
];

export function getCorrespondingMegaStones(
  mega?: readonly { readonly mega_id: number; readonly stone_id: number }[],
): readonly Item[] {
  if (!mega) return [];
  return mega
    .map(({ stone_id }) => itemById.get(stone_id))
    .filter((stone): stone is Item => stone != null);
}

export function getItemOptions(params: {
  readonly battleData?: Result<FetchResponse, Error> | null;
  readonly correspondingMegaStoneIds?: readonly number[];
  readonly getItemLabel?: (identifier: string) => string;
}): readonly ItemOption[] {
  const { battleData, correspondingMegaStoneIds = [], getItemLabel } = params;

  const popularItems: ItemOption[] = [];
  const seenIds = new Set<number>();

  // 1. バトルデータからの人気アイテム
  if (battleData && battleData.isOk()) {
    for (const info of battleData.value.heldItems) {
      const item = itemByIdentifier.get(info.name);
      if (item && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        popularItems.push({
          ...item,
          group: "popular",
          rank: info.rank,
          percentage: info.percentage,
        });
      }
    }
  }

  // 2. 対応するメガストーンを人気グループに追加（未追加の場合）
  for (const stoneId of correspondingMegaStoneIds) {
    if (!seenIds.has(stoneId)) {
      const stone = itemById.get(stoneId);
      if (stone) {
        seenIds.add(stone.id);
        popularItems.push({
          ...stone,
          group: "popular",
        });
      }
    }
  }

  // 3. 残りのアイテムをアイテムタイプ別にグルーピング
  const remainingGroupedItems: ItemOption[] = [];
  for (const type of ITEM_TYPE_ORDER) {
    const itemsInType = itemList.filter((item) => item.type === type && !seenIds.has(item.id));

    if (getItemLabel) {
      itemsInType.sort((a, b) =>
        getItemLabel(a.identifier).localeCompare(getItemLabel(b.identifier)),
      );
    } else {
      itemsInType.sort((a, b) => a.identifier.localeCompare(b.identifier));
    }

    for (const item of itemsInType) {
      seenIds.add(item.id);
      remainingGroupedItems.push({
        ...item,
        group: type,
      });
    }
  }

  // 万一 ITEM_TYPE_ORDER に含まれていないタイプがあれば末尾に付加
  for (const item of itemList) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      remainingGroupedItems.push({
        ...item,
        group: item.type,
      });
    }
  }

  return [...popularItems, ...remainingGroupedItems];
}
