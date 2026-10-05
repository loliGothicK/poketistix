import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Hunger Switch", () => {
  it("changes form between Full Belly and Hangry at the end of each turn", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "morpeko-full-belly",
          ability: "hungerswitch",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["protect", "sleeptalk"],
      },
    );

    // Turn 1: Morpeko protects; at end of turn, Hunger Switch transforms it to Morpeko-Hangry
    env.executeAndAssert("move protect, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
