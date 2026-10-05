import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Justified", () => {
  it("boosts Attack by 1 stage when hit by a Dark-type move", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "lucario",
          ability: "justified",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["bite", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bite", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax uses Bite on Lucario; Lucario's Justified raises its Attack by 1 stage
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bite 1, move sleeptalk");
  });
});
