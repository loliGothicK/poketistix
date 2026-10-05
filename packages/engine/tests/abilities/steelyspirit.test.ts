import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Steely Spirit", () => {
  it("powers up the Steel-type moves of the Pokémon and its allies by 1.5x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "perrserker",
          ability: "steelyspirit",
          moves: ["ironhead", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["ironhead", "sleeptalk"],
      },
    );

    // Turn 1: Perrserker uses Iron Head with Steely Spirit 1.5x boost
    env.executeAndAssert("move ironhead 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
