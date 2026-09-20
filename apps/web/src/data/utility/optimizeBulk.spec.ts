import { describe, expect, it } from "vitest";
import { optimizeBulk } from "./optimizeBulk";

describe("optimizeBulk", () => {
  it("Blissey (extreme HP, low Def/SpD) prefers B/D over H for balanced bulk", () => {
    // Blissey base stats: HP 255, Def 10, SpD 135
    const baseStats = { hp: 255, def: 10, spd: 135 };
    const nature = { plus: null, minus: null };
    const pool = 32; // limited pool

    const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 0.5 });

    // Since H is already massive (255+75 = 330), B is tiny (10+20 = 30).
    // Adding to B gives huge % increases in physical bulk, so B should get all 32 EVs, and H should be 0.
    expect(result.evs.def).toBe(32);
    expect(result.evs.hp).toBe(0);
  });

  it("Rotom / Shuckle (low HP, high Def/SpD) prioritizes H investment with fixed neutral nature", () => {
    // Rotom-Wash base stats: HP 50, Def 107, SpD 107
    const baseStats = { hp: 50, def: 107, spd: 107 };
    const nature = { plus: null, minus: null };
    const pool = 64;

    const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 0.5, optimizeNature: false });

    // Rotom has low HP (50+75=125) compared to B+D (127+127=254).
    // H < B + D -> H should be maxed out to 32!
    expect(result.evs.hp).toBe(32);
    // Remaining 32 should be distributed between Def and SpD
    expect(result.evs.def + result.evs.spd).toBe(32);
    // B and D base are equal with neutral nature, so Def and SpD should be equally split
    expect(result.evs.def).toBe(16);
    expect(result.evs.spd).toBe(16);
  });

  it("Physical specialization (physicalRatio = 1.0) maximizes H * B", () => {
    const baseStats = { hp: 100, def: 100, spd: 100 };
    const nature = { plus: null, minus: null };
    const pool = 64;

    const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 1.0 });

    // Should invest 32 in H and 32 in Def, 0 in SpD
    expect(result.evs.hp).toBe(32);
    expect(result.evs.def).toBe(32);
    expect(result.evs.spd).toBe(0);
  });

  it("Special specialization (physicalRatio = 0.0) maximizes H * D", () => {
    const baseStats = { hp: 100, def: 100, spd: 100 };
    const nature = { plus: null, minus: null };
    const pool = 64;

    const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 0.0 });

    // Should invest 32 in H and 32 in SpD, 0 in Def
    expect(result.evs.hp).toBe(32);
    expect(result.evs.def).toBe(0);
    expect(result.evs.spd).toBe(32);
  });

  it("Respects small available EV pool and clamps to available pool", () => {
    const baseStats = { hp: 80, def: 80, spd: 80 };
    const nature = { plus: null, minus: null };
    const pool = 10;

    const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 0.5 });
    const totalUsed = result.evs.hp + result.evs.def + result.evs.spd;

    expect(totalUsed).toBeLessThanOrEqual(10);
    expect(result.evs.hp).toBeGreaterThanOrEqual(0);
    expect(result.evs.def).toBeGreaterThanOrEqual(0);
    expect(result.evs.spd).toBeGreaterThanOrEqual(0);
  });

  it("Accounts for nature multipliers (+Def, -SpD etc.)", () => {
    const baseStats = { hp: 80, def: 80, spd: 80 };
    const nature = { plus: "def", minus: "spa" }; // Bold nature (+Def)
    const pool = 64;

    const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 0.5 });

    expect(result.evs.hp).toBe(32);
    // B has 1.1x multiplier, so raw stats differ slightly, optimizing accordingly
    expect(result.evs.def + result.evs.spd).toBe(32);
  });

  it("Respects already allocated HBD EVs as minimum constraints", () => {
    const baseStats = { hp: 80, def: 80, spd: 80 };
    const nature = { plus: null, minus: null };
    // Already allocated 20 in def, 10 in spd, 0 in hp. Pool is 20+10+14 = 44
    const pool = 44;
    const minEvs = { hp: 0, def: 20, spd: 10 };

    const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 0.5, minEvs });

    // Must not reduce existing allocations
    expect(result.evs.def).toBeGreaterThanOrEqual(20);
    expect(result.evs.spd).toBeGreaterThanOrEqual(10);
    expect(result.evs.hp).toBeGreaterThanOrEqual(0);
    expect(result.evs.hp + result.evs.def + result.evs.spd).toBeLessThanOrEqual(44);
  });

  describe("Nature optimization when nature.plus is not specified", () => {
    it("selects Def+ nature when physicalRatio is 1.0", () => {
      const baseStats = { hp: 80, def: 80, spd: 80 };
      const nature = { plus: null, minus: null };
      const pool = 64;

      const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 1.0 });

      expect(result.nature?.plus).toBe("def");
      expect(result.nature?.minus).toBe("atk"); // default minus
      expect(result.evs.hp).toBe(32);
      expect(result.evs.def).toBe(32);
    });

    it("selects SpD+ nature when physicalRatio is 0.0", () => {
      const baseStats = { hp: 80, def: 80, spd: 80 };
      const nature = { plus: null, minus: null };
      const pool = 64;

      const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 0.0 });

      expect(result.nature?.plus).toBe("spd");
      expect(result.nature?.minus).toBe("atk");
      expect(result.evs.hp).toBe(32);
      expect(result.evs.spd).toBe(32);
    });

    it("selects Def+ for Blissey (extreme low Def) to balance defenses", () => {
      const baseStats = { hp: 255, def: 10, spd: 135 };
      const nature = {};
      const pool = 32;

      const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 0.5 });

      expect(result.nature?.plus).toBe("def");
    });

    it("preserves existing nature.plus when already specified (e.g. Atk+ or Spe+)", () => {
      const baseStats = { hp: 80, def: 80, spd: 80 };
      const pool = 64;

      // Atk+ specified
      const resultAtk = optimizeBulk(baseStats, { plus: "atk", minus: "spa" }, pool, { physicalRatio: 0.5 });
      expect(resultAtk.nature?.plus).toBe("atk");
      expect(resultAtk.nature?.minus).toBe("spa");

      // Spe+ specified
      const resultSpe = optimizeBulk(baseStats, { plus: "spe", minus: "atk" }, pool, { physicalRatio: 1.0 });
      expect(resultSpe.nature?.plus).toBe("spe");
      expect(resultSpe.nature?.minus).toBe("atk");

      // Def+ already specified
      const resultDef = optimizeBulk(baseStats, { plus: "def", minus: "spa" }, pool, { physicalRatio: 0.0 });
      expect(resultDef.nature?.plus).toBe("def");
      expect(resultDef.nature?.minus).toBe("spa");
    });

    it("preserves existing valid minus stat (e.g. Spe- for Trick Room)", () => {
      const baseStats = { hp: 80, def: 80, spd: 80 };
      const nature = { plus: null, minus: "spe" };
      const pool = 64;

      const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 1.0 });

      expect(result.nature?.plus).toBe("def");
      expect(result.nature?.minus).toBe("spe"); // Relaxed nature
    });

    it("respects defaultMinus option when specified", () => {
      const baseStats = { hp: 80, def: 80, spd: 80 };
      const nature = { plus: null, minus: null };
      const pool = 64;

      const result = optimizeBulk(baseStats, nature, pool, { physicalRatio: 1.0, defaultMinus: "spa" });

      expect(result.nature?.plus).toBe("def");
      expect(result.nature?.minus).toBe("spa"); // Impish nature
    });
  });

  describe("Def & SpD multipliers (1.5x, 2.0x)", () => {
    it("shifts EVs to Def and HP when SpD has 1.5x multiplier (+1 SpD stage / Sandstorm)", () => {
      const baseStats = { hp: 100, def: 100, spd: 100 };
      const nature = { plus: null, minus: null };
      const pool = 64;

      // Base case (1.0x): 32 H, 16 Def, 16 SpD
      const normalResult = optimizeBulk(baseStats, nature, pool, {
        physicalRatio: 0.5,
        optimizeNature: false,
      });
      expect(normalResult.evs).toEqual({ hp: 32, def: 16, spd: 16 });

      // With 1.5x SpD: Def needs more investment to balance physical and special bulk
      const spdBoostedResult = optimizeBulk(baseStats, nature, pool, {
        physicalRatio: 0.5,
        optimizeNature: false,
        spdMultiplier: 1.5,
      });

      expect(spdBoostedResult.evs.hp).toBe(32);
      expect(spdBoostedResult.evs.def).toBeGreaterThan(spdBoostedResult.evs.spd);
      expect(spdBoostedResult.evs.hp + spdBoostedResult.evs.def + spdBoostedResult.evs.spd).toBe(64);
    });

    it("shifts EVs to SpD and HP when Def has 2.0x multiplier (+2 Def stages)", () => {
      const baseStats = { hp: 100, def: 100, spd: 100 };
      const nature = { plus: null, minus: null };
      const pool = 64;

      const defBoostedResult = optimizeBulk(baseStats, nature, pool, {
        physicalRatio: 0.5,
        optimizeNature: false,
        defMultiplier: 2.0,
      });

      expect(defBoostedResult.evs.hp).toBe(32);
      expect(defBoostedResult.evs.spd).toBeGreaterThan(defBoostedResult.evs.def);
      expect(defBoostedResult.evs.hp + defBoostedResult.evs.def + defBoostedResult.evs.spd).toBe(64);
    });

    it("maintains symmetric distribution when both Def and SpD have 1.5x multiplier", () => {
      const baseStats = { hp: 100, def: 100, spd: 100 };
      const nature = { plus: null, minus: null };
      const pool = 64;

      const normalResult = optimizeBulk(baseStats, nature, pool, {
        physicalRatio: 0.5,
        optimizeNature: false,
      });
      const bothBoostedResult = optimizeBulk(baseStats, nature, pool, {
        physicalRatio: 0.5,
        optimizeNature: false,
        defMultiplier: 1.5,
        spdMultiplier: 1.5,
      });

      expect(bothBoostedResult.evs).toEqual(normalResult.evs);
      expect(bothBoostedResult.score).toBeGreaterThan(normalResult.score);
    });

    it("selects Def+ nature when SpD multiplier is 1.5x", () => {
      const baseStats = { hp: 100, def: 100, spd: 100 };
      const nature = { plus: null, minus: null };
      const pool = 64;

      const result = optimizeBulk(baseStats, nature, pool, {
        physicalRatio: 0.5,
        spdMultiplier: 1.5,
      });

      expect(result.nature?.plus).toBe("def");
    });

    it("selects SpD+ nature when Def multiplier is 2.0x", () => {
      const baseStats = { hp: 100, def: 100, spd: 100 };
      const nature = { plus: null, minus: null };
      const pool = 64;

      const result = optimizeBulk(baseStats, nature, pool, {
        physicalRatio: 0.5,
        defMultiplier: 2.0,
      });

      expect(result.nature?.plus).toBe("spd");
    });

    it("safely falls back to 1.0 when multipliers are non-positive or undefined", () => {
      const baseStats = { hp: 100, def: 100, spd: 100 };
      const nature = { plus: null, minus: null };
      const pool = 64;

      const normalResult = optimizeBulk(baseStats, nature, pool, {
        physicalRatio: 0.5,
        optimizeNature: false,
      });
      const fallbackResult = optimizeBulk(baseStats, nature, pool, {
        physicalRatio: 0.5,
        optimizeNature: false,
        defMultiplier: -1,
        spdMultiplier: 0,
      });

      expect(fallbackResult.evs).toEqual(normalResult.evs);
      expect(fallbackResult.score).toBeCloseTo(normalResult.score, 5);
    });
  });
});
