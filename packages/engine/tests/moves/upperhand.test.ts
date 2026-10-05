import { test } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Move: Upper Hand", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "raichu", moves: ["upperhand", "sleeptalk"] }),
      pokemon({ species: "charizard", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "pikachu", ability: "lightningrod", moves: ["fakeout", "sleeptalk"] }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    {
      deterministicMoves: [
        { id: "upperhand", accuracy: true, secondary: "always" },
        { id: "fakeout", accuracy: true },
        "sleeptalk",
      ],
      engineConfig: {
        damage_roll: "max",
        crits: "never",
        accuracy: "always",
        secondary: "inherit",
      },
    },
  );

  env.executeAndAssert("move upperhand 1, move sleeptalk", "move fakeout 1, move sleeptalk");
});
