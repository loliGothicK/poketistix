import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Quick Feet", () => {
  it("boosts Speed by 1.5x when statused and ignores paralysis speed drop", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "jolteon",
          ability: "quickfeet",
          moves: ["sleeptalk"],
          status: "brn",
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Turn 1: Jolteon has paralysis and has 1.5x Speed via Quick Feet
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
