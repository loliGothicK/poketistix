import { describe, expect, it } from "vitest";
import * as E from "fp-ts/lib/Either";
import {
  createInitialBattleState,
  validateLeadDeploy,
  validateSwitchIn,
  validateWithdraw,
  validateWeatherEnd,
  validateTerrainEnd,
  validateMoveExecution,
  validateStatusInflict,
  validateStatusCure,
  validateCantMove,
  validateResidualDamage,
  type BattleState,
} from "./battleDomainContract";
import { BattleLogParser } from "../battleLogParser";

describe("Battle Domain Contracts (fp-ts Precondition & Invariant Engine)", () => {
  describe("Lead Deployment Contract", () => {
    it("successfully deploys distinct leads across slots", () => {
      let state = createInitialBattleState();
      const res1 = validateLeadDeploy(state, "p1a", { slug: "sneasler" });
      expect(E.isRight(res1)).toBe(true);
      if (E.isRight(res1)) state = res1.right;

      const res2 = validateLeadDeploy(state, "p1b", { slug: "kingambit" });
      expect(E.isRight(res2)).toBe(true);
      if (E.isRight(res2)) state = res2.right;

      const res3 = validateLeadDeploy(state, "p2a", { slug: "excadrill" });
      expect(E.isRight(res3)).toBe(true);
      if (E.isRight(res3)) state = res3.right;

      const res4 = validateLeadDeploy(state, "p2b", { slug: "tyranitar" });
      expect(E.isRight(res4)).toBe(true);
      if (E.isRight(res4)) state = res4.right;

      expect(state.slots.p1a.kind).toBe("active");
      expect(state.slots.p2b.kind).toBe("active");
    });

    it("rejects duplicate deployment to an already occupied lead slot (Single Assignment)", () => {
      const state = createInitialBattleState();
      const deployed = validateLeadDeploy(state, "p2a", { slug: "excadrill" });
      expect(E.isRight(deployed)).toBe(true);

      if (E.isRight(deployed)) {
        const dup = validateLeadDeploy(deployed.right, "p2a", { slug: "gholdengo" });
        expect(E.isLeft(dup)).toBe(true);
        if (E.isLeft(dup)) {
          expect(dup.left.type).toBe("LeadAlreadyOccupied");
        }
      }
    });

    it("rejects duplicate species on the same side (Species Clause)", () => {
      const state = createInitialBattleState();
      const deployed = validateLeadDeploy(state, "p1a", { slug: "sneasler" });
      expect(E.isRight(deployed)).toBe(true);

      if (E.isRight(deployed)) {
        const dupSpecies = validateLeadDeploy(deployed.right, "p1b", { slug: "sneasler" });
        expect(E.isLeft(dupSpecies)).toBe(true);
        if (E.isLeft(dupSpecies)) {
          expect(dupSpecies.left.type).toBe("LeadSpeciesDuplicateOnSide");
        }
      }
    });

    it("rejects 5th Pokémon on a side (VGC 4-Pokémon Selection Cap)", () => {
      let state = createInitialBattleState();
      for (const [slot, slug] of [
        ["p1a", "sneasler"],
        ["p1b", "kingambit"],
      ] as const) {
        const res = validateLeadDeploy(state, slot, { slug });
        if (E.isRight(res)) state = res.right;
      }

      // Simulate 2 bench Pokémon observed
      state = {
        ...state,
        observedSlugsBySide: {
          ...state.observedSlugsBySide,
          p1: ["sneasler", "kingambit", "rillaboom", "incineroar"],
        },
      };

      // Withdraw p1a so the slot is empty
      const withdrawn = validateWithdraw(state, "p1a");
      expect(E.isRight(withdrawn)).toBe(true);
      if (E.isRight(withdrawn)) state = withdrawn.right;

      // Attempting to bring a 5th Pokémon (e.g. gengar) violates the 4-Pokémon roster limit
      const fifth = validateSwitchIn(state, "p1a", { slug: "gengar" });
      expect(E.isLeft(fifth)).toBe(true);
      if (E.isLeft(fifth)) {
        expect(fifth.left.type).toBe("RosterLimitExceeded");
      }
    });
  });

  describe("Weather Precondition Contract", () => {
    it("rejects ending rain when the active weather is Sandstorm", () => {
      const state: BattleState = {
        ...createInitialBattleState(),
        weather: { kind: "Sandstorm", remainingTurns: 4, maxTurns: 5 },
      };

      const res = validateWeatherEnd(state, "Rain");
      expect(E.isLeft(res)).toBe(true);
      if (E.isLeft(res)) {
        expect(res.left.type).toBe("WeatherNotActive");
        if (res.left.type === "WeatherNotActive") {
          expect(res.left.currentWeather).toBe("Sandstorm");
          expect(res.left.attemptedEndedWeather).toBe("Rain");
        }
      }
    });

    it("rejects ending weather when no weather is active", () => {
      const state = createInitialBattleState();
      const res = validateWeatherEnd(state, "None");
      expect(E.isLeft(res)).toBe(true);
      if (E.isLeft(res)) {
        expect(res.left.type).toBe("WeatherNotActive");
      }
    });

    it("successfully ends sandstorm when sandstorm is active", () => {
      const state: BattleState = {
        ...createInitialBattleState(),
        weather: { kind: "Sandstorm", remainingTurns: 1, maxTurns: 5 },
      };

      const res = validateWeatherEnd(state, "Sandstorm");
      expect(E.isRight(res)).toBe(true);
      if (E.isRight(res)) {
        expect(res.right.weather.kind).toBe("None");
      }
    });
  });

  describe("Terrain Precondition Contract", () => {
    it("rejects ending Grassy Terrain when Electric Terrain is active", () => {
      const state: BattleState = {
        ...createInitialBattleState(),
        terrain: { kind: "Electric", remainingTurns: 3, maxTurns: 5 },
      };

      const res = validateTerrainEnd(state, "Grassy");
      expect(E.isLeft(res)).toBe(true);
      if (E.isLeft(res)) {
        expect(res.left.type).toBe("TerrainNotActive");
      }
    });
  });

  describe("Move Action Limit & Instruct Exception Contract", () => {
    function setupActiveState(): BattleState {
      let state = createInitialBattleState();
      const d1 = validateLeadDeploy(state, "p1a", { slug: "oranguru" });
      const d2 = validateLeadDeploy(E.isRight(d1) ? d1.right : state, "p1b", { slug: "sneasler" });
      return E.isRight(d2) ? d2.right : state;
    }

    it("rejects a second move in the same turn without Instruct", () => {
      const state = setupActiveState();
      const firstMove = validateMoveExecution(state, "p1b", "close-combat");
      expect(E.isRight(firstMove)).toBe(true);

      if (E.isRight(firstMove)) {
        const secondMove = validateMoveExecution(firstMove.right, "p1b", "gunk-shot");
        expect(E.isLeft(secondMove)).toBe(true);
        if (E.isLeft(secondMove)) {
          expect(secondMove.left.type).toBe("DuplicateActionWithoutInstruct");
        }
      }
    });

    it("allows a second move in the same turn IF Instruct was just used targeting that slot", () => {
      const state = setupActiveState();
      // 1. Sneasler executes close-combat
      const m1 = validateMoveExecution(state, "p1b", "close-combat");
      expect(E.isRight(m1)).toBe(true);

      if (E.isRight(m1)) {
        // 2. Oranguru uses Instruct targeting Sneasler (p1b)
        const mInstruct = validateMoveExecution(m1.right, "p1a", "instruct", "p1b");
        expect(E.isRight(mInstruct)).toBe(true);

        if (E.isRight(mInstruct)) {
          // 3. Sneasler executes close-combat a second time via Instruct
          const mInstructed = validateMoveExecution(mInstruct.right, "p1b", "close-combat");
          expect(E.isRight(mInstructed)).toBe(true);
        }
      }
    });
  });

  describe("Status Cure & CantMove Precondition Contract", () => {
    it("rejects waking up when the slot was never asleep", () => {
      let state = createInitialBattleState();
      const d = validateLeadDeploy(state, "p1a", { slug: "sneasler" });
      state = E.isRight(d) ? d.right : state;

      const cureRes = validateStatusCure(state, "p1a", "slp");
      expect(E.isLeft(cureRes)).toBe(true);
      if (E.isLeft(cureRes)) {
        expect(cureRes.left.type).toBe("StatusNotPresentForCure");
      }
    });

    it("rejects cantMove 'slp' when the slot is not asleep", () => {
      let state = createInitialBattleState();
      const d = validateLeadDeploy(state, "p1a", { slug: "sneasler" });
      state = E.isRight(d) ? d.right : state;

      const cantRes = validateCantMove(state, "p1a", "slp");
      expect(E.isLeft(cantRes)).toBe(true);
      if (E.isLeft(cantRes)) {
        expect(cantRes.left.type).toBe("CantMovePreconditionFailed");
      }
    });

    it("accepts status cure when the slot is actually asleep", () => {
      let state = createInitialBattleState();
      const d = validateLeadDeploy(state, "p1a", { slug: "sneasler" });
      state = E.isRight(d) ? d.right : state;

      const inflict = validateStatusInflict(state, "p1a", "slp");
      expect(E.isRight(inflict)).toBe(true);
      state = E.isRight(inflict) ? inflict.right : state;

      const cure = validateStatusCure(state, "p1a", "slp");
      expect(E.isRight(cure)).toBe(true);
    });
  });

  describe("Residual Damage Precondition Contract", () => {
    it("rejects sandstorm damage when active weather is not Sandstorm", () => {
      let state = createInitialBattleState();
      const d = validateLeadDeploy(state, "p1a", { slug: "sneasler" });
      state = E.isRight(d) ? d.right : state;

      const res = validateResidualDamage(state, "p1a", "sandstorm");
      expect(E.isLeft(res)).toBe(true);
      if (E.isLeft(res)) {
        expect(res.left.type).toBe("ResidualPreconditionFailed");
      }
    });
  });

  describe("BattleLogParser Contract Enforcement", () => {
    const makeParser = () =>
      new BattleLogParser({
        myTeam: [
          { slug: "sneasler", identifier: "sneasler" },
          { slug: "kingambit", identifier: "kingambit" },
          { slug: "rillaboom", identifier: "rillaboom" },
          { slug: "incineroar", identifier: "incineroar" },
        ],
        dictionaries: {
          species: [
            { slug: "sneasler", alias: "オオニューラ" },
            { slug: "kingambit", alias: "ドドゲザン" },
            { slug: "rillaboom", alias: "ゴリランダー" },
            { slug: "incineroar", alias: "ガオガエン" },
            { slug: "tyranitar", alias: "バンギラス" },
            { slug: "excadrill", alias: "ドリュウズ" },
          ],
          moves: [
            { slug: "close-combat", alias: "インファイト" },
            { slug: "kowtow-cleave", alias: "ドゲザン" },
            { slug: "instruct", alias: "さいはい" },
            { slug: "protect", alias: "まもる" },
          ],
          abilities: [{ slug: "sand-stream", alias: "すなおこし" }],
          items: [],
        },
        p2Roster: ["tyranitar", "excadrill"],
        p1MaxHp: () => 150,
        p1ItemSlug: () => null,
      });

    it("prevents double move declarations for the same slot without Instruct", () => {
      const parser = makeParser();
      parser.feedMessage("ゆけっ！ オオニューラ と ドドゲザン！", 1000);
      parser.feedMessage("相手は バンギラス と ドリュウズを 繰り出した！", 2000);
      parser.beginTurn(3000);

      // First move by p1a
      const r1 = parser.feedMessage("オオニューラの インファイト！", 4000);
      expect(r1).toBe(true);

      // Second move by p1a in the same turn without Instruct must be rejected by contract
      const r2 = parser.feedMessage("オオニューラの インファイト！", 5000);
      expect(r2).toBe(false);
    });

    it("prevents weather end when weather is not active", () => {
      const parser = makeParser();
      parser.feedMessage("ゆけっ！ オオニューラ と ドドゲザン！", 1000);
      parser.feedMessage("相手は バンギラス と ドリュウズを 繰り出した！", 2000);
      parser.beginTurn(3000);

      expect(parser.getWeather()).toBe("None");
      // Spurious weather cleared message when weather is None
      const r = parser.feedMessage("雨が 止んだ！", 4000);
      expect(r).toBe(false);
    });

    it("prevents multiple lead deployments to the same slot", () => {
      const parser = makeParser();
      // First lead deployment for p2
      const r1 = parser.feedMessage("相手は バンギラス と ドリュウズを 繰り出した！", 1000);
      expect(r1).toBe(true);

      // Spurious repeated lead deployment in lead phase must be rejected
      const r2 = parser.feedMessage("相手は バンギラス と ドリュウズを 繰り出した！", 2000);
      expect(r2).toBe(false);
    });
  });
});
