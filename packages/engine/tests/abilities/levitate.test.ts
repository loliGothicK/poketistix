import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Levitate", () => {
  it("provides immunity to Ground-type attacks", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "rotom",
          ability: "levitate",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["earthquake", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["earthquake", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax uses Earthquake; Rotom is immune due to Levitate
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move earthquake, move sleeptalk");
  });
});
