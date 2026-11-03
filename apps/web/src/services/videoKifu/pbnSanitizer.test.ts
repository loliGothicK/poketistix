import { describe, expect, it } from "vitest";
import { isLeft, isRight } from "fp-ts/lib/Either";
import {
  sanitizeAndValidateBattleLog,
  validateLeadActiveSlots,
  validateNoSelfAttack,
  validateNoDuplicateActionPerTurn,
} from "./pbnSanitizer";
import type { TurnRecord } from "@/services/battleLogParser";

function createDummySlot(slug: string | null) {
  return {
    slug,
    teamIdx: 0,
    hp: "100%",
    fainted: false,
    status: null,
    volatileStatus: {},
    boosts: {},
  };
}

function createDummyTurn(
  turnNumber: number,
  slots: { p1a: string | null; p1b: string | null; p2a: string | null; p2b: string | null },
  events: TurnRecord["events"] = [],
): TurnRecord {
  return {
    turnNumber,
    timestampMs: 1000 * turnNumber,
    fieldEffects: [],
    stateSnapshot: {
      p1a: createDummySlot(slots.p1a),
      p1b: createDummySlot(slots.p1b),
      p2a: createDummySlot(slots.p2a),
      p2b: createDummySlot(slots.p2b),
      ownHpByTeamIdx: {},
      oppHpBySlug: {},
      ownMegaSlugByTeamIdx: {},
      faintedOwnIndices: [],
      faintedOppSlugs: [],
      observedOppSlugs: [],
    },
    actions: [null, null],
    mega: { p1a: false, p1b: false },
    activeAtStart: { p1a: true, p1b: true },
    events,
  };
}

describe("battleLogSanitizer (Structured AST Validation with fp-ts)", () => {
  it("rejects Turn 1 when lead slots are unresolved (null)", () => {
    const turns = [createDummyTurn(1, { p1a: null, p1b: null, p2a: null, p2b: null })];
    const res = validateLeadActiveSlots(turns);
    expect(isLeft(res)).toBe(true);
    if (isLeft(res)) {
      expect(res.left.length).toBeGreaterThanOrEqual(1);
      expect(res.left[0]!.message).toContain("[LeadSlotUnresolved]");
    }
  });

  it("rejects when a move inflicts direct self-damage (self attack)", () => {
    const turns = [
      createDummyTurn(
        1,
        { p1a: "lopunny", p1b: "kingambit", p2a: "incineroar", p2b: "rillaboom" },
        [
          {
            verb: "move",
            args: ["p1a", "kowtow-cleave"],
            t: 1000,
            confidence: 1,
            review: false,
          },
          {
            verb: "damage",
            args: ["p1a", "142/142 -> 100/142"],
            t: 1100,
            confidence: 1,
            review: false,
          },
        ],
      ),
    ];
    const res = validateNoSelfAttack(turns);
    expect(isLeft(res)).toBe(true);
    if (isLeft(res)) {
      expect(res.left.some((e) => e.message.includes("[SelfAttackDetected]"))).toBe(true);
    }
  });

  it("rejects when a slot executes multiple moves in the same turn", () => {
    const turns = [
      createDummyTurn(
        1,
        { p1a: "lopunny", p1b: "kingambit", p2a: "incineroar", p2b: "rillaboom" },
        [
          {
            verb: "move",
            args: ["p1a", "fake-out", "p2a"],
            t: 1000,
            confidence: 1,
            review: false,
          },
          {
            verb: "move",
            args: ["p1a", "close-combat", "p2a"],
            t: 2000,
            confidence: 1,
            review: false,
          },
        ],
      ),
    ];
    const res = validateNoDuplicateActionPerTurn(turns);
    expect(isLeft(res)).toBe(true);
    if (isLeft(res)) {
      expect(res.left.some((e) => e.message.includes("[DuplicateActionPerTurn]"))).toBe(true);
    }
  });

  it("accumulates multiple errors across different validations using fp-ts Validated before PBN render", () => {
    const invalidTurns = [
      createDummyTurn(1, { p1a: null, p1b: null, p2a: null, p2b: null }, [
        {
          verb: "move",
          args: ["p1a", "kowtow-cleave"],
          t: 1000,
          confidence: 1,
          review: false,
        },
        {
          verb: "damage",
          args: ["p1a", "142/142 -> 100/142"],
          t: 1100,
          confidence: 1,
          review: false,
        },
        {
          verb: "move",
          args: ["p1a", "close-combat"],
          t: 2000,
          confidence: 1,
          review: false,
        },
      ]),
    ];
    const res = sanitizeAndValidateBattleLog(invalidTurns, []);
    expect(isLeft(res)).toBe(true);
    if (isLeft(res)) {
      // Accumulates LeadSlotUnresolved, SelfAttackDetected, and DuplicateActionPerTurn
      expect(res.left.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("accepts valid and consistent TurnRecords", () => {
    const validTurns = [
      createDummyTurn(
        1,
        { p1a: "lopunny", p1b: "kingambit", p2a: "incineroar", p2b: "rillaboom" },
        [
          {
            verb: "move",
            args: ["p1a", "close-combat", "p2a"],
            t: 1000,
            confidence: 1,
            review: false,
          },
          {
            verb: "damage",
            args: ["p2a", "100% -> 30%"],
            t: 1100,
            confidence: 1,
            review: false,
          },
          {
            verb: "move",
            args: ["p1b", "kowtow-cleave", "p2b"],
            t: 2000,
            confidence: 1,
            review: false,
          },
        ],
      ),
    ];
    const res = sanitizeAndValidateBattleLog(validTurns, []);
    expect(isRight(res)).toBe(true);
  });
});
