import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Hustle", () => {
  it("boosts physical Attack by 1.5x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "flapple",
          ability: "hustle",
          moves: ["gravapple", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["gravapple", "sleeptalk"],
      },
    );

    // Turn 1: Flapple attacks Snorlax with Grav Apple boosted by Hustle (1.5x Attack)
    env.executeAndAssert("move gravapple 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
