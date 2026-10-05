import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Pure Power", () => {
  it("doubles the Pokémon's Attack stat", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "medicham",
          ability: "purepower",
          moves: ["drainpunch", "protect"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
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
        deterministicMoves: ["drainpunch", "protect", "sleeptalk"],
      },
    );

    // Medicham uses Drain Punch with Pure Power (2x Attack) on Snorlax
    env.executeAndAssert("move drainpunch 1, move protect", "move sleeptalk, move sleeptalk");
  });
});
