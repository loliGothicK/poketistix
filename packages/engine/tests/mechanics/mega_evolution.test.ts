import { test, expect } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Mega Evolution: basic mega evolution and ability activation", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "charizard", item: "charizarditey", moves: ["flamethrower"] }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "tauros", moves: ["sleeptalk"] }),
      pokemon({ species: "clefable", moves: ["sleeptalk"] }),
    ],
  );

  // Turn 1: Charizard mega evolves into Charizard-Mega-Y, triggering Drought
  const res = env.executeAndAssert(
    "move flamethrower 1 mega, move sleeptalk",
    "move sleeptalk, move sleeptalk",
  );
  const p1a = res.engineState.p1.active[0];
  expect(p1a.is_mega).toBe(true);
  expect(p1a.species).toBe("charizard-mega-y");
  expect(p1a.ability).toBe("drought");
  expect(res.engineState.weather).toBe("hashsunlight");
  expect(res.engineState.p1.mega_used).toBe(true);
});

test("Mega Evolution: matching Mega Stone cannot be removed by Knock Off and does not boost Knock Off", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "venusaur-mega", moves: ["knockoff"] }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "venusaur", item: "venusaurite", moves: ["sleeptalk"] }),
      pokemon({ species: "clefable", moves: ["sleeptalk"] }),
    ],
  );

  // Venusaur-Mega uses Knock Off against Venusaur holding Venusaurite (matching Mega Stone)
  const res = env.executeAndAssert(
    "move knockoff 1, move sleeptalk",
    "move sleeptalk, move sleeptalk",
  );
  const p2a = res.engineState.p2.active[0];
  // Venusaurite should NOT be knocked off
  expect(p2a.item).toBe("venusaurite");
});

test("Mega Evolution: non-matching Mega Stone CAN be removed by Knock Off", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "venusaur-mega", moves: ["knockoff"] }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    [
      // Tauros holding Venusaurite (mismatched)
      pokemon({ species: "tauros", item: "venusaurite", moves: ["sleeptalk"] }),
      pokemon({ species: "clefable", moves: ["sleeptalk"] }),
    ],
  );

  const res = env.executeAndAssert(
    "move knockoff 1, move sleeptalk",
    "move sleeptalk, move sleeptalk",
  );
  const p2a = res.engineState.p2.active[0];
  // Mismatched stone SHOULD be knocked off
  expect(p2a.item).toBeUndefined();
});

test("Mega Evolution: only 1 Mega Evolution per side per battle", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "charizard", item: "charizarditey", moves: ["swordsdance"] }),
      pokemon({ species: "venusaur", item: "venusaurite", moves: ["growth"] }),
    ],
    [
      pokemon({ species: "tauros", moves: ["sleeptalk"] }),
      pokemon({ species: "clefable", moves: ["sleeptalk"] }),
    ],
  );

  // Turn 1: Charizard mega evolves
  env.executeAndAssert("move swordsdance mega, move growth", "move sleeptalk, move sleeptalk");
  expect(env.engine.get_state().p1.mega_used).toBe(true);

  // Turn 2: Valid choices executed and asserted with Showdown
  env.executeAndAssert("move swordsdance, move growth", "move sleeptalk, move sleeptalk");
  expect(env.engine.get_state().p1.active[0]?.is_mega).toBe(true);
  expect(env.engine.get_state().p1.active[1]?.is_mega).toBe(false);

  // Verify engine directly ignores/rejects a 2nd mega evolution when mega_used is true
  env.engine.run_turn({
    p1a: "swordsdance",
    p1a_target: 0,
    p1b: "growth",
    p1b_target: 0,
    p1b_mega: true,
    p2a: "sleeptalk",
    p2a_target: 0,
    p2b: "sleeptalk",
    p2b_target: 0,
  });
  const p1b = env.engine.get_state().p1.active[1];
  expect(p1b.is_mega).toBe(false);
  expect(p1b.species).toBe("venusaur");
});
