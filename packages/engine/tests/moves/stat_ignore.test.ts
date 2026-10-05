import { test } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Move: Darkest Lariat", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "incineroar", moves: ["darkestlariat"] }),
      pokemon({ species: "charizard", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "blastoise", moves: ["irondefense"] }),
      pokemon({ species: "raichu", moves: ["sleeptalk"] }),
    ],
  );
  // Blastoise uses Iron Defense (+2 Def), Incineroar uses Darkest Lariat
  // Darkest Lariat should ignore the +2 Def.
  const res = env.executeTurn(
    "move darkestlariat 1, move sleeptalk",
    "move irondefense, move sleeptalk",
  );
  env.assertStateMatch(res.engineState, env.sim);
});

test("Move: Sacred Sword", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "gallade", ability: "steadfast", moves: ["sacredsword"] }),
      pokemon({ species: "gengar", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "pikachu", ability: "lightningrod", moves: ["doubleteam"] }),
      pokemon({ species: "raichu", moves: ["sleeptalk"] }),
    ],
  );
  // Pikachu uses Double Team (+1 Evasion)
  const res = env.executeTurn(
    "move sacredsword 1, move sleeptalk",
    "move doubleteam, move sleeptalk",
  );
  env.assertStateMatch(res.engineState, env.sim);
});
