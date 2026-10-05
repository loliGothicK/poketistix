import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Regenerator", () => {
  it("restores 1/3 max HP upon switching out", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "slowbro",
          ability: "regenerator",
          moves: ["sleeptalk"],
          hp: 80,
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", ability: "static", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Turn 1: Slowbro switches out to Pikachu, recovering 1/3 max HP
    env.executeAndAssert("switch 3, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
