import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Sharpness", () => {
  it("boosts slicing moves power by 1.5x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "gallade",
          ability: "sharpness",
          moves: ["sacredsword", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sacredsword", "sleeptalk"],
      },
    );

    // Turn 1: Gallade uses Sacred Sword boosted by Sharpness (1.5x)
    env.executeAndAssert("move sacredsword 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
