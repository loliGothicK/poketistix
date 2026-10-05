import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Mega Sol", () => {
  it("treats weather as harsh sunlight for the user's moves even under clear skies", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "meganium-mega",
          ability: "megasol",
          moves: ["solarbeam", "sleeptalk"],
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
        deterministicMoves: ["solarbeam", "sleeptalk"],
      },
    );

    // Turn 1: Meganium uses Solar Beam without charging turn due to Mega Sol
    env.executeAndAssert("move solarbeam 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
