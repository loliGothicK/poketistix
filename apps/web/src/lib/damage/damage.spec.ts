import { describe, it, expect } from "vitest";
import { calculate, preloadDamageEngine, _resetModuleForTesting } from "./engine";
import { analyze } from "./analysis";
import { weatherModifier, stabModifier, screenModifier, spreadModifier } from "./modifiers";
import { M } from "./types";

describe("damage engine (wasm)", () => {
  it("matches the dissertation Kyogre Water Spout example (84-99)", async () => {
    const out = await calculate({
      level: 50,
      basePower: 150,
      attack: 255,
      defense: 145,
      isPhysical: false,
      moveType: "water",
      defenderType1: "grass",
      defenderType2: "poison",
      spreadModifier: M.SPREAD,
      weatherModifier: M.WEATHER_BOOST,
      stabModifier: M.STAB,
    });
    expect(out.min).toBe(84);
    expect(out.max).toBe(99);
    expect(out.rolls).toEqual([84, 84, 85, 87, 87, 88, 90, 90, 91, 93, 93, 94, 96, 96, 97, 99]);
  });

  it("matches the dissertation Mega Rayquaza example (47-56)", async () => {
    const out = await calculate({
      level: 50,
      basePower: 120,
      attack: 232,
      defense: 109,
      isPhysical: true,
      moveType: "flying",
      defenderType1: "psychic",
      defenderType2: "ghost",
      stabModifier: M.STAB,
      finalModifiers: [M.SCREEN_DOUBLES, M.MULTISCALE, M.FRIEND_GUARD, M.LIFE_ORB],
    });
    expect(out.min).toBe(47);
    expect(out.max).toBe(56);
  });

  it("returns zero damage against an immune type", async () => {
    const out = await calculate({
      level: 50,
      basePower: 80,
      attack: 120,
      defense: 100,
      isPhysical: true,
      moveType: "normal",
      defenderType1: "ghost",
    });
    expect(out.max).toBe(0);
  });

  it("deals damage when immuneOverride is false against an immune type (e.g. Scrappy)", async () => {
    const out = await calculate({
      level: 50,
      basePower: 80,
      attack: 120,
      defense: 100,
      isPhysical: true,
      moveType: "normal",
      defenderType1: "ghost",
      immuneOverride: false,
    });
    expect(out.max).toBeGreaterThan(0);
  });

  it("safely preloads damage engine without throwing", () => {
    _resetModuleForTesting();
    expect(() => preloadDamageEngine()).not.toThrow();
  });
});

describe("modifier resolution", () => {
  it("resolves weather modifiers by move type", () => {
    expect(weatherModifier("rain", "water")).toBe(M.WEATHER_BOOST);
    expect(weatherModifier("rain", "fire")).toBe(M.WEATHER_PENALTY);
    expect(weatherModifier("sun", "fire")).toBe(M.WEATHER_BOOST);
    expect(weatherModifier("none", "water")).toBe(M.NEUTRAL);
  });

  it("resolves STAB and Adaptability", () => {
    expect(stabModifier(["water"], "water")).toBe(M.STAB);
    expect(stabModifier(["water"], "water", true)).toBe(M.STAB_ADAPTABILITY);
    expect(stabModifier(["fire"], "water")).toBe(M.NEUTRAL);
  });

  it("skips screens on crit / infiltrator", () => {
    expect(screenModifier({ reflect: true }, true, true)).toBe(M.SCREEN_DOUBLES);
    expect(screenModifier({ reflect: true }, true, false)).toBe(M.SCREEN_SINGLES);
    expect(screenModifier({ reflect: true }, true, true, { isCrit: true })).toBe(M.NEUTRAL);
    expect(screenModifier({ lightScreen: true }, true, true)).toBe(M.NEUTRAL); // physical vs LightScreen
  });

  it("resolves spread modifier", () => {
    expect(spreadModifier(true)).toBe(M.SPREAD);
    expect(spreadModifier(false)).toBe(M.NEUTRAL);
    expect(spreadModifier(true, true)).toBe(M.SPREAD_ROYAL);
  });
});

describe("analysis", () => {
  it("derives percentages and KO info", () => {
    const a = analyze({ rolls: Array(16).fill(50), min: 50, max: 50 }, 100);
    expect(a.minPercent).toBe(50);
    expect(a.maxPercent).toBe(50);
    expect(a.minHitsToKO).toBe(2);
    expect(a.maxHitsToKO).toBe(2);
    expect(a.guaranteed).toBe(true);
    expect(a.ohkoChance).toBe(0);
  });
});
