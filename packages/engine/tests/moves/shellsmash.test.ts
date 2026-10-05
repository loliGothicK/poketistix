import { test, expect } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Move: Shell Smash changes offensive and defensive stages", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "blastoise", moves: ["shellsmash"] }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "tauros", ability: "sheerforce", moves: ["sleeptalk"] }),
      pokemon({ species: "clefable", moves: ["sleeptalk"] }),
    ],
  );
  const result = env.executeTurn(
    "move shellsmash, move sleeptalk",
    "move sleeptalk, move sleeptalk",
  );
  env.assertStateMatch(result.engineState, env.sim);
  expect(result.engineState.p1.active[0].boosts).toMatchObject({
    atk: 2,
    def: -1,
    spa: 2,
    spd: -1,
    spe: 2,
  });
});
