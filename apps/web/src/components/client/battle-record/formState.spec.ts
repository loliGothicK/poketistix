import { describe, it, expect } from "vitest";
import { emptyDraft, draftFromRecord, draftToInput } from "./formState";
import type { BattleRecord } from "@/store/battle-record/battleRecord";

describe("emptyDraft", () => {
  it("defaults to a win with now-filled playedAt and no opponents", () => {
    const draft = emptyDraft();
    expect(draft.result).toBe("win");
    expect(draft.opponents).toEqual([]);
    expect(draft.selection).toEqual({ leads: [], backs: [] });
    expect(draft.playedAt).not.toBe("");
  });

  it("pre-fills team id and members", () => {
    const draft = emptyDraft({ teamId: "team-1", myTeam: [] });
    expect(draft.teamId).toBe("team-1");
  });
});

describe("draftToInput", () => {
  it("maps a filled draft to API input", () => {
    const input = draftToInput(
      {
        result: "loss",
        teamId: "team-1",
        myTeam: [],
        selection: { leads: [0, 2], backs: [1] },
        rating: "1650",
        notes: "close game",
        playedAt: "2026-07-07T10:30",
        tags: [],
        opponents: [
          {
            key: "k1",
            pokemonSlug: "miraidon",
            itemSlug: "choice-specs",
            abilitySlug: "hadron-engine",
            moves: ["draco-meteor"],
            selectionRole: "lead",
            notes: "",
          },
        ],
      },
      "season-1",
    );

    expect(input.seasonId).toBe("season-1");
    expect(input.teamId).toBe("team-1");
    expect(input.result).toBe("loss");
    expect(input.mySelection).toEqual([0, 2, 1]);
    expect(input.rating).toBe(1650);
    expect(input.notes).toBe("close game");
    expect(input.opponents[0].slotIndex).toBe(0);
    expect(input.opponents[0].moves).toEqual(["draco-meteor"]);
    expect(input.playedAt).not.toBeNull();
  });

  it("normalizes empty collections and strings to null", () => {
    const input = draftToInput({ ...emptyDraft(), rating: "   ", notes: "   " }, "season-1");
    expect(input.mySelection).toBeNull();
    expect(input.rating).toBeNull();
    expect(input.notes).toBeNull();
    expect(input.opponents).toEqual([]);
  });

  it("normalizes empty teamId string to null", () => {
    const input = draftToInput({ ...emptyDraft(), teamId: "   " }, "season-1");
    expect(input.teamId).toBeNull();
  });

  it("safely handles invalid playedAt without throwing RangeError", () => {
    expect(() => draftToInput({ ...emptyDraft(), playedAt: "invalid-date" }, "season-1")).not.toThrow();
    const input = draftToInput({ ...emptyDraft(), playedAt: "invalid-date" }, "season-1");
    expect(input.playedAt).toBeNull();

    const emptyInput = draftToInput({ ...emptyDraft(), playedAt: "" }, "season-1");
    expect(emptyInput.playedAt).toBeNull();
  });

  it("normalizes empty itemSlug and abilitySlug to null and filters empty moves/tags", () => {
    const input = draftToInput(
      {
        ...emptyDraft(),
        tags: ["  ", "weather-rain", ""],
        opponents: [
          {
            key: "a",
            pokemonSlug: "  pikachu  ",
            itemSlug: "   ",
            abilitySlug: "",
            moves: ["  ", "thunderbolt", ""],
            selectionRole: null,
            notes: "   ",
          },
        ],
      },
      "season-1",
    );
    expect(input.tags).toEqual(["weather-rain"]);
    expect(input.opponents[0].pokemonSlug).toBe("pikachu");
    expect(input.opponents[0].itemSlug).toBeNull();
    expect(input.opponents[0].abilitySlug).toBeNull();
    expect(input.opponents[0].moves).toEqual(["thunderbolt"]);
    expect(input.opponents[0].notes).toBeNull();
  });

  it("ignores non-numeric rating", () => {
    const input = draftToInput({ ...emptyDraft(), rating: "abc" }, "season-1");
    expect(input.rating).toBeNull();
  });

  it("parses decimal ratings correctly", () => {
    const input = draftToInput({ ...emptyDraft(), rating: "1650.5" }, "season-1");
    expect(input.rating).toBe(1650.5);
  });

  it("re-indexes opponent slotIndex by array position", () => {
    const input = draftToInput(
      {
        ...emptyDraft(),
        opponents: [
          {
            key: "a",
            pokemonSlug: "a",
            itemSlug: null,
            abilitySlug: null,
            moves: [],
            selectionRole: null,
            notes: "",
          },
          {
            key: "b",
            pokemonSlug: "b",
            itemSlug: null,
            abilitySlug: null,
            moves: [],
            selectionRole: null,
            notes: "",
          },
        ],
      },
      "s",
    );
    expect(input.opponents.map((o) => o.slotIndex)).toEqual([0, 1]);
  });
});

describe("draftFromRecord", () => {
  const record: BattleRecord = {
    id: "rec-1",
    seasonId: "season-1",
    teamId: "team-1",
    result: "win",
    myTeam: [],
    mySelection: [0, 1, 2],
    rating: 1720,
    notes: null,
    playedAt: new Date("2026-07-07T01:30:00.000Z").toISOString(),
    tags: [],
    opponents: [
      {
        slotIndex: 0,
        pokemonSlug: "flutter-mane",
        itemSlug: null,
        abilitySlug: null,
        moves: null,
        selectionRole: "back",
        notes: null,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("hydrates a draft, splitting leads by format", () => {
    const draft = draftFromRecord(record, "doubles");
    expect(draft.result).toBe("win");
    expect(draft.teamId).toBe("team-1");
    expect(draft.rating).toBe("1720");
    // doubles -> first 2 indices are leads
    expect(draft.selection).toEqual({ leads: [0, 1], backs: [2] });
    expect(draft.opponents[0].pokemonSlug).toBe("flutter-mane");
    expect(draft.opponents[0].moves).toEqual([]);
  });

  it("round-trips selection through draftToInput", () => {
    const input = draftToInput(draftFromRecord(record, "doubles"), "season-1");
    expect(input.mySelection).toEqual([0, 1, 2]);
    expect(input.rating).toBe(1720);
  });
});
