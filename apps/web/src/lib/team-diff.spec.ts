import { describe, it, expect } from "vitest";
import {
  serializeTeamForDiff,
  parseTeamFromDiffText,
  createTeamDiff,
  reconstructTeamText,
  buildTeamSnapshot,
  diffTeamSnapshots,
  isEmptyTeamDiff,
} from "./team-diff";
import type { TrainedPokemon } from "@/store/team/team";

const pikachu = (overrides: Partial<TrainedPokemon> = {}): TrainedPokemon => ({
  boxId: "01J00000000000000000000001",
  identifier: "pikachu",
  slug: "pikachu",
  item: 213,
  ability: 31,
  gender: { fixed: false },
  nature: {},
  moves: [85, 87, 521, 182],
  evs: { hp: 0, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
  ...overrides,
});

describe("team-diff (legacy text patch)", () => {
  it("serializes and parses team text correctly", () => {
    const serialized = serializeTeamForDiff(
      "Rain Offense",
      "Pelipper with Focus Sash",
      "Pelipper @ Focus Sash\nAbility: Drizzle",
    );

    const parsed = parseTeamFromDiffText(serialized);
    expect(parsed.name).toBe("Rain Offense");
    expect(parsed.description).toBe("Pelipper with Focus Sash");
    expect(parsed.pokepaste).toBe("Pelipper @ Focus Sash\nAbility: Drizzle");
  });

  it("handles empty description cleanly", () => {
    const serialized = serializeTeamForDiff("Simple Team", undefined, "Pikachu @ Light Ball");
    const parsed = parseTeamFromDiffText(serialized);
    expect(parsed.name).toBe("Simple Team");
    expect(parsed.description).toBe("");
    expect(parsed.pokepaste).toBe("Pikachu @ Light Ball");
  });

  it("creates and reconstructs sequential revisions using patches", () => {
    const textV1 = serializeTeamForDiff("V1 Team", "Initial note", "Pikachu @ Light Ball");
    const diff1 = createTeamDiff("", textV1);

    const textV2 = serializeTeamForDiff("V2 Team", "Updated note", "Pikachu @ Focus Sash");
    const diff2 = createTeamDiff(textV1, textV2);

    const textV3 = serializeTeamForDiff("V2 Team", "Updated note", "Pikachu @ Focus Sash\nRaichu @ Life Orb");
    const diff3 = createTeamDiff(textV2, textV3);

    const revs = [{ diff: diff1 }, { diff: diff2 }, { diff: diff3 }];

    // Reconstruct V1
    const reconstructedV1 = reconstructTeamText(revs, 0);
    expect(reconstructedV1).toBe(textV1);
    expect(parseTeamFromDiffText(reconstructedV1).name).toBe("V1 Team");

    // Reconstruct V2
    const reconstructedV2 = reconstructTeamText(revs, 1);
    expect(reconstructedV2).toBe(textV2);
    expect(parseTeamFromDiffText(reconstructedV2).description).toBe("Updated note");

    // Reconstruct V3 (all)
    const reconstructedV3 = reconstructTeamText(revs);
    expect(reconstructedV3).toBe(textV3);
    expect(parseTeamFromDiffText(reconstructedV3).pokepaste).toContain("Raichu @ Life Orb");
  });
});

describe("team-diff (snapshot + semantic diff)", () => {
  it("builds a normalized snapshot", () => {
    const snapshot = buildTeamSnapshot(
      { name: "  Rain  ", description: undefined, members: [pikachu()] },
      "  Pikachu @ Light Ball  ",
    );
    expect(snapshot.name).toBe("Rain");
    expect(snapshot.description).toBe("");
    expect(snapshot.pokepaste).toBe("Pikachu @ Light Ball");
    expect(snapshot.members).toHaveLength(6);
    expect(snapshot.members[0]?.identifier).toBe("pikachu");
    expect(snapshot.members[1]).toBeNull();
  });

  it("detects no changes between identical snapshots", () => {
    const snapshot = buildTeamSnapshot({ name: "Team", description: "note", members: [pikachu()] }, "paste");
    const diff = diffTeamSnapshots(snapshot, snapshot);
    expect(isEmptyTeamDiff(diff)).toBe(true);
    expect(diff.members).toHaveLength(0);
  });

  it("detects name, description, and pokepaste changes", () => {
    const oldSnapshot = buildTeamSnapshot({ name: "V1", description: "old", members: [] }, "paste v1");
    const newSnapshot = buildTeamSnapshot({ name: "V2", description: "new", members: [] }, "paste v2");
    const diff = diffTeamSnapshots(oldSnapshot, newSnapshot);
    expect(diff.name).toEqual({ from: "V1", to: "V2" });
    expect(diff.description).toEqual({ from: "old", to: "new" });
    expect(diff.pokepasteChanged).toBe(true);
    expect(isEmptyTeamDiff(diff)).toBe(false);
  });

  it("detects added / removed / replaced / updated members", () => {
    const oldSnapshot = buildTeamSnapshot(
      {
        name: "Team",
        members: [
          pikachu(),
          pikachu({ boxId: "01J00000000000000000000002", identifier: "gengar", slug: "gengar" }),
          null,
        ],
      },
      "paste",
    );
    const newSnapshot = buildTeamSnapshot(
      {
        name: "Team",
        members: [
          pikachu({ item: 999 }),
          pikachu({ boxId: "01J00000000000000000000003", identifier: "charizard", slug: "charizard" }),
          pikachu(),
        ],
      },
      "paste",
    );
    const diff = diffTeamSnapshots(oldSnapshot, newSnapshot);
    expect(diff.members).toHaveLength(3);
    expect(diff.members[0]).toMatchObject({ slot: 0, kind: "updated" });
    expect(diff.members[0].changedFields).toContain("item");
    expect(diff.members[1]).toMatchObject({
      slot: 1,
      kind: "replaced",
      identifierFrom: "gengar",
      identifierTo: "charizard",
    });
    expect(diff.members[2]).toMatchObject({ slot: 2, kind: "added", identifierTo: "pikachu" });
  });

  it("ignores boxId-only differences", () => {
    const oldSnapshot = buildTeamSnapshot({ name: "T", members: [pikachu()] }, "paste");
    const newSnapshot = buildTeamSnapshot(
      { name: "T", members: [pikachu({ boxId: "01J00000000000000000000009" })] },
      "paste",
    );
    expect(isEmptyTeamDiff(diffTeamSnapshots(oldSnapshot, newSnapshot))).toBe(true);
  });

  it("treats null old snapshot as initial revision", () => {
    const snapshot = buildTeamSnapshot({ name: "T", members: [pikachu()] }, "paste");
    const diff = diffTeamSnapshots(null, snapshot);
    expect(diff.name).toEqual({ from: "", to: "T" });
    expect(diff.members).toHaveLength(1);
    expect(diff.members[0]).toMatchObject({ slot: 0, kind: "added" });
  });

  it("does not include unchanged Pokémon in diff even with JSONB key reordering", () => {
    const original = pikachu();
    // Simulate JSONB round-trip where keys are reordered alphabetically
    const jsonbParsed = JSON.parse(JSON.stringify(original)) as TrainedPokemon;
    // Reverse or scramble top-level keys
    const scrambled = Object.fromEntries(Object.entries(jsonbParsed).reverse()) as unknown as TrainedPokemon;

    const oldSnapshot = buildTeamSnapshot(
      { name: "Team", members: [original, pikachu({ identifier: "charizard", slug: "charizard" })] },
      "paste",
    );
    // Only slot 1 (charizard) has an actual change (held item changed)
    const newSnapshot = buildTeamSnapshot(
      {
        name: "Team",
        members: [scrambled, pikachu({ identifier: "charizard", slug: "charizard", item: 540 })],
      },
      "paste",
    );

    const diff = diffTeamSnapshots(oldSnapshot, newSnapshot);
    // Slot 0 (pikachu) has zero changes, so it MUST NOT be in diff.members!
    expect(diff.members).toHaveLength(1);
    expect(diff.members[0].slot).toBe(1);
    expect(diff.members[0].identifierTo).toBe("charizard");
  });
});
