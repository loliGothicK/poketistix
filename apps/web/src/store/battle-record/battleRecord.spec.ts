import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  seasonInputSchema,
  seasonUpdateSchema,
  battleRecordInputSchema,
  battleRecordUpdateSchema,
  opponentInputSchema,
  getLatestSeason,
} from "./battleRecord";

describe("seasonInputSchema", () => {
  it("accepts a minimal valid season", () => {
    const parsed = v.safeParse(seasonInputSchema, {
      name: "レギュレーションH S24",
      format: "singles",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a full valid season", () => {
    const parsed = v.safeParse(seasonInputSchema, {
      id: "01JABCDEF0123456789ABCDEFG",
      name: "doubles season",
      format: "doubles",
      ruleMark: "regulation-h",
      startedAt: "2026-01-01",
      endedAt: "2026-03-31",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid format", () => {
    const parsed = v.safeParse(seasonInputSchema, { name: "x", format: "triples" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const parsed = v.safeParse(seasonInputSchema, { name: "", format: "singles" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a name longer than 100 chars", () => {
    const parsed = v.safeParse(seasonInputSchema, { name: "a".repeat(101), format: "singles" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    const parsed = v.safeParse(seasonInputSchema, {
      name: "x",
      format: "singles",
      startedAt: "2026/01/01",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("seasonUpdateSchema", () => {
  it("accepts an empty partial update", () => {
    expect(v.safeParse(seasonUpdateSchema, {}).success).toBe(true);
  });

  it("accepts a single-field update", () => {
    expect(v.safeParse(seasonUpdateSchema, { name: "renamed" }).success).toBe(true);
  });

  it("still validates the provided field", () => {
    expect(v.safeParse(seasonUpdateSchema, { format: "invalid" }).success).toBe(false);
  });
});

describe("opponentInputSchema", () => {
  it("accepts a minimal opponent (slug only)", () => {
    const parsed = v.safeParse(opponentInputSchema, { slotIndex: 0, pokemonSlug: "miraidon" });
    expect(parsed.success).toBe(true);
  });

  it("rejects slotIndex out of range", () => {
    expect(v.safeParse(opponentInputSchema, { slotIndex: 6, pokemonSlug: "x" }).success).toBe(false);
  });

  it("rejects an invalid selectionRole", () => {
    const parsed = v.safeParse(opponentInputSchema, {
      slotIndex: 0,
      pokemonSlug: "x",
      selectionRole: "middle",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("battleRecordInputSchema", () => {
  const base = {
    seasonId: "01JABCDEF0123456789ABCDEFG",
    result: "win" as const,
    myTeam: [{ boxId: "a" }, { boxId: "b" }],
    opponents: [
      { slotIndex: 0, pokemonSlug: "miraidon", selectionRole: "lead" as const },
      { slotIndex: 1, pokemonSlug: "flutter-mane", selectionRole: "back" as const },
    ],
  };

  it("accepts a valid record", () => {
    expect(v.safeParse(battleRecordInputSchema, base).success).toBe(true);
  });

  it("accepts an optional ISO playedAt", () => {
    const parsed = v.safeParse(battleRecordInputSchema, {
      ...base,
      playedAt: "2026-07-07T10:00:00+09:00",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid result", () => {
    expect(v.safeParse(battleRecordInputSchema, { ...base, result: "victory" }).success).toBe(false);
  });

  it("rejects more than 6 team members", () => {
    const parsed = v.safeParse(battleRecordInputSchema, {
      ...base,
      myTeam: Array.from({ length: 7 }, (_, i) => ({ boxId: String(i) })),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects duplicate opponent slotIndex", () => {
    const parsed = v.safeParse(battleRecordInputSchema, {
      ...base,
      opponents: [
        { slotIndex: 0, pokemonSlug: "a" },
        { slotIndex: 0, pokemonSlug: "b" },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects mySelection index out of range", () => {
    expect(v.safeParse(battleRecordInputSchema, { ...base, mySelection: [0, 9] }).success).toBe(false);
  });
});

describe("battleRecordUpdateSchema", () => {
  it("accepts an empty partial update", () => {
    expect(v.safeParse(battleRecordUpdateSchema, {}).success).toBe(true);
  });

  it("accepts a result-only update", () => {
    expect(v.safeParse(battleRecordUpdateSchema, { result: "loss" }).success).toBe(true);
  });

  it("omits seasonId (immutable)", () => {
    const parsed = v.parse(battleRecordUpdateSchema, { seasonId: "should-be-stripped" });
    expect(parsed).not.toHaveProperty("seasonId");
  });
});

describe("getLatestSeason", () => {
  it("returns null when seasons list is empty", () => {
    expect(getLatestSeason([])).toBeNull();
  });

  it("returns the latest season prioritizing startedAt then createdAt", () => {
    const s1 = {
      id: "1",
      name: "Season 1",
      format: "singles" as const,
      ruleMark: null,
      startedAt: "2026-07-01",
      endedAt: "2026-07-31",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    const s2 = {
      id: "2",
      name: "Season 2",
      format: "doubles" as const,
      ruleMark: null,
      startedAt: "2026-08-01",
      endedAt: "2026-08-31",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    expect(getLatestSeason([s1, s2])?.id).toBe("2");
    expect(getLatestSeason([s2, s1])?.id).toBe("2");
  });
});
