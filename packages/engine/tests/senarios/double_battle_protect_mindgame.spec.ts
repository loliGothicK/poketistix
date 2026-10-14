import { expect, test } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Scenario: Protect completely absorbs double-target focus attacks while ally attacks freely", () => {
  const env = new TestEnvironment(
    [
      pokemon({
        species: "charizard",
        ability: "blaze",
        moves: ["protect", "flamethrower"],
        evs: { hp: 2, spe: 32 },
      }),
      pokemon({
        species: "garchomp",
        ability: "roughskin",
        moves: ["earthquake", "dragonclaw"],
        evs: { hp: 2, atk: 32, spe: 32 },
      }),
    ],
    [
      pokemon({
        species: "blastoise",
        ability: "torrent",
        moves: ["hydropump", "surf"],
        evs: { hp: 32, def: 32 },
      }),
      pokemon({
        species: "venusaur",
        ability: "overgrow",
        moves: ["sludgebomb", "gigadrain"],
        evs: { hp: 32, spd: 32 },
      }),
    ],
  );

  // Turn 1:
  // Charizard uses Protect.
  // Blastoise and Venusaur both focus-fire on Charizard (slot 1).
  // Garchomp uses Dragon Claw on Venusaur.
  const { engineState } = env.executeAndAssert(
    "move protect, move dragonclaw 2",
    "move hydropump 1, move sludgebomb 1",
  );

  // Charizard should take 0 damage due to Protect
  expect(engineState.p1.active[0].hp).toBe(engineState.p1.active[0].maxhp);

  // Venusaur should take damage from Garchomp's Dragon Claw
  expect(engineState.p2.active[1].hp).toBeLessThan(engineState.p2.active[1].maxhp);
});

test("Scenario: Predicting Protect and targeting the ally deals damage while Protect goes unused", () => {
  const env = new TestEnvironment(
    [
      pokemon({
        species: "charizard",
        ability: "blaze",
        moves: ["protect", "flamethrower"],
        evs: { hp: 2, spe: 32 },
      }),
      pokemon({
        species: "garchomp",
        ability: "roughskin",
        moves: ["dragonclaw", "earthquake"],
        evs: { hp: 2, spe: 32 },
      }),
    ],
    [
      pokemon({
        species: "blastoise",
        ability: "torrent",
        moves: ["icebeam", "surf"],
        evs: { hp: 32, spa: 32 },
      }),
      pokemon({
        species: "venusaur",
        ability: "overgrow",
        moves: ["gigadrain", "sludgebomb"],
        evs: { hp: 32, def: 32 },
      }),
    ],
  );

  // Turn 1:
  // Charizard predicts incoming attack and uses Protect.
  // Opponents predict Charizard's Protect and redirect attack (Ice Beam) to Garchomp (slot 2).
  const { engineState } = env.executeAndAssert("move protect, move dragonclaw 1", "move icebeam 2, move gigadrain 2");

  // Charizard protected safely
  expect(engineState.p1.active[0].hp).toBe(engineState.p1.active[0].maxhp);

  // Garchomp took the Ice Beam and Giga Drain targeted at slot 2
  expect(engineState.p1.active[1].hp).toBeLessThan(engineState.p1.active[1].maxhp);
});
