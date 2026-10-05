import { test } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Move: Syrup Bomb", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "hydrapple", ability: "regenerator", moves: ["syrupbomb", "sleeptalk"] }),
      pokemon({ species: "charizard", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "blastoise", moves: ["sleeptalk"] }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    {
      deterministicMoves: [{ id: "syrupbomb", accuracy: true, secondary: "always" }, "sleeptalk"],
      engineConfig: {
        damage_roll: "max",
        crits: "never",
        accuracy: "always",
        secondary: "inherit",
      },
    },
  );

  env.executeAndAssert("move syrupbomb 1, move sleeptalk", "move sleeptalk, move sleeptalk");
});
