import { describe, it, expect } from "vitest";
import { buildPartialTeam, getAllChangeIds, type SyncChangeItem } from "./useSyncState";
import type { Team, TrainedPokemon } from "@/store/team/team";

const pikachuBase: TrainedPokemon = {
  boxId: "01J00000000000000000000001",
  identifier: "pikachu",
  slug: "pikachu",
  item: 213, // light-ball
  ability: 31, // lightning-rod
  gender: { fixed: false },
  nature: { plus: "spe", minus: "atk" },
  moves: [85, 87, 521, 182], // thunderbolt, thunder, volt-switch, protect
  evs: { hp: 0, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
  description: "Standard fast special attacker",
};

const pikachuModified: TrainedPokemon = {
  ...pikachuBase,
  item: 211, // leftovers
  moves: [85, 87, 521, 182], // same moves
  evs: { hp: 32, atk: 0, def: 0, spa: 32, spd: 0, spe: 0 }, // bulkier EV
  description: "Bulky pivot variant",
};

const charizard: TrainedPokemon = {
  boxId: "01J00000000000000000000002",
  identifier: "charizard",
  slug: "charizard",
  item: 696, // charizardite-x
  ability: 66, // blaze
  gender: { fixed: false },
  nature: { plus: "spe", minus: "atk" },
  moves: [53, 403, 416, 182], // flamethrower, air-slash, giga-impact, protect
  evs: { hp: 0, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
};

describe("buildPartialTeam - field level interactive commit", () => {
  const serverTeam: Team = {
    id: "team-1",
    name: "Original Team Name",
    description: "Original Description",
    members: [pikachuBase, null, null, null, null, null],
  };

  const activeTeam: Team = {
    id: "team-1",
    name: "Updated Team Name",
    description: "Updated Description",
    members: [pikachuModified, charizard, null, null, null, null],
  };

  it("selectively applies only the 'item' field change for an updated Pokemon", () => {
    // Only select slot 0's item change
    const selected = new Set<string>(["slot-0:item"]);
    const partial = buildPartialTeam(serverTeam, activeTeam, selected);

    // Name & description should remain server version
    expect(partial.name).toBe("Original Team Name");
    expect(partial.description).toBe("Original Description");

    // Slot 0 should have the new item, but OLD evs and OLD description
    const member0 = partial.members[0];
    expect(member0).not.toBeNull();
    expect(member0?.item).toBe(211); // modified item
    expect(member0?.evs).toEqual({ hp: 0, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 }); // original EVs
    expect(member0?.description).toBe("Standard fast special attacker"); // original description

    // Slot 1 (charizard) was not selected, so should remain null
    expect(partial.members[1]).toBeNull();
  });

  it("selectively applies only the 'evs' field change and team name", () => {
    const selected = new Set<string>(["name", "slot-0:evs"]);
    const partial = buildPartialTeam(serverTeam, activeTeam, selected);

    expect(partial.name).toBe("Updated Team Name");
    expect(partial.description).toBe("Original Description");

    const member0 = partial.members[0];
    expect(member0?.item).toBe(213); // original item preserved
    expect(member0?.evs).toEqual({ hp: 32, atk: 0, def: 0, spa: 32, spd: 0, spe: 0 }); // modified EVs applied
  });

  it("applies newly added pokemon when selected", () => {
    const selected = new Set<string>(["slot-1"]);
    const partial = buildPartialTeam(serverTeam, activeTeam, selected);

    expect(partial.members[1]?.identifier).toBe("charizard");
    // slot 0 was not selected, so remains original
    expect(partial.members[0]?.item).toBe(213);
  });
});

describe("getAllChangeIds", () => {
  it("extracts field-level IDs for updated slots and slot IDs for others", () => {
    const changes: SyncChangeItem[] = [
      { id: "name", type: "name", from: "A", to: "B" },
      {
        id: "slot-0",
        type: "slot",
        slot: 0,
        kind: "updated",
        identifier: "pikachu",
        changedFields: ["item", "evs"],
        fieldChanges: [
          { id: "slot-0:item", field: "item", from: pikachuBase, to: pikachuModified },
          { id: "slot-0:evs", field: "evs", from: pikachuBase, to: pikachuModified },
        ],
        from: pikachuBase,
        to: pikachuModified,
      },
      {
        id: "slot-1",
        type: "slot",
        slot: 1,
        kind: "added",
        identifier: "charizard",
        changedFields: ["details"],
        fieldChanges: [],
        from: null,
        to: charizard,
      },
    ];

    const ids = getAllChangeIds(changes);
    expect(ids).toEqual(["name", "slot-0:item", "slot-0:evs", "slot-1"]);
  });
});
