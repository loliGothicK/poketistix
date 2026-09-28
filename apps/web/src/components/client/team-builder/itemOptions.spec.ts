import { describe, it, expect } from "vitest";
import { ok } from "neverthrow";
import { itemList, itemByIdentifier } from "@/data/items";
import { getItemOptions, getCorrespondingMegaStones, ITEM_TYPE_ORDER } from "./itemOptions";

describe("itemOptions", () => {
  describe("getCorrespondingMegaStones", () => {
    it("returns empty array when mega is undefined or empty", () => {
      expect(getCorrespondingMegaStones(undefined)).toEqual([]);
      expect(getCorrespondingMegaStones([])).toEqual([]);
    });

    it("returns corresponding mega stone items for pokemon with mega stones", () => {
      // Charizard has Charizardite X (696) and Y (714)
      const charizardMega = [
        { mega_id: 10034, stone_id: 696 },
        { mega_id: 10035, stone_id: 714 },
      ];
      const stones = getCorrespondingMegaStones(charizardMega);
      expect(stones).toHaveLength(2);
      expect(stones.map((s) => s.identifier)).toEqual(["charizardite-x", "charizardite-y"]);
    });
  });

  describe("getItemOptions", () => {
    it("contains all items from itemList exactly once without duplicates", () => {
      const options = getItemOptions({});
      expect(options).toHaveLength(itemList.length);

      const ids = options.map((o) => o.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(itemList.length);
    });

    it("groups items by item type when no popular items or mega stones exist", () => {
      const options = getItemOptions({});

      // Groups should be in ITEM_TYPE_ORDER
      const seenGroups: string[] = [];
      let currentGroup: string | null = null;

      for (const option of options) {
        if (option.group !== currentGroup) {
          expect(seenGroups).not.toContain(option.group);
          seenGroups.push(option.group);
          currentGroup = option.group;
        }
      }

      // Verify groups are contiguous (no duplicate group transitions)
      expect(seenGroups).toEqual(ITEM_TYPE_ORDER.filter((type) => options.some((o) => o.group === type)));
    });

    it("puts popular items at the top in a 'popular' group", () => {
      const mockBattleData = ok({
        heldItems: [
          { name: "focus-sash", rank: 1, percentage: 42.5 },
          { name: "life-orb", rank: 2, percentage: 28.1 },
        ],
        moves: [],
      });

      const options = getItemOptions({ battleData: mockBattleData });

      // First items must be in 'popular' group
      expect(options[0]?.identifier).toBe("focus-sash");
      expect(options[0]?.group).toBe("popular");
      expect(options[0]?.rank).toBe(1);
      expect(options[0]?.percentage).toBe(42.5);

      expect(options[1]?.identifier).toBe("life-orb");
      expect(options[1]?.group).toBe("popular");
      expect(options[1]?.rank).toBe(2);
      expect(options[1]?.percentage).toBe(28.1);

      // Verify popular items are not duplicated later in their normal type groups
      const focusSashCount = options.filter((o) => o.identifier === "focus-sash").length;
      const lifeOrbCount = options.filter((o) => o.identifier === "life-orb").length;
      expect(focusSashCount).toBe(1);
      expect(lifeOrbCount).toBe(1);

      // Total count remains equal to itemList
      expect(options).toHaveLength(itemList.length);
    });

    it("places corresponding mega stones in the 'popular' group", () => {
      const charizarditeY = itemByIdentifier.get("charizardite-y")!;
      const options = getItemOptions({
        correspondingMegaStoneIds: [charizarditeY.id],
      });

      expect(options[0]?.identifier).toBe("charizardite-y");
      expect(options[0]?.group).toBe("popular");

      // Verify no duplicates
      const count = options.filter((o) => o.identifier === "charizardite-y").length;
      expect(count).toBe(1);
      expect(options).toHaveLength(itemList.length);
    });

    it("does not duplicate mega stones if already included in battleData popular items", () => {
      const charizarditeY = itemByIdentifier.get("charizardite-y")!;
      const mockBattleData = ok({
        heldItems: [{ name: "charizardite-y", rank: 1, percentage: 75.0 }],
        moves: [],
      });

      const options = getItemOptions({
        battleData: mockBattleData,
        correspondingMegaStoneIds: [charizarditeY.id],
      });

      const charizarditeYOptions = options.filter((o) => o.identifier === "charizardite-y");
      expect(charizarditeYOptions).toHaveLength(1);
      expect(charizarditeYOptions[0]?.group).toBe("popular");
      expect(charizarditeYOptions[0]?.rank).toBe(1);
    });

    it("preserves contiguous grouping so MUI Autocomplete does not generate duplicate headers", () => {
      const mockBattleData = ok({
        heldItems: [{ name: "focus-sash", rank: 1, percentage: 50.0 }],
        moves: [],
      });
      const options = getItemOptions({ battleData: mockBattleData });

      const groupTransitions: string[] = [];
      let lastGroup = "";
      for (const opt of options) {
        if (opt.group !== lastGroup) {
          groupTransitions.push(opt.group);
          lastGroup = opt.group;
        }
      }

      // Check that every group in groupTransitions is unique (no jumping back and forth)
      const uniqueTransitions = new Set(groupTransitions);
      expect(groupTransitions.length).toBe(uniqueTransitions.size);
    });
  });
});
