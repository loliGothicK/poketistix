import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Huge Power", () => {
  it("doubles the Pokémon's Attack stat", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "azumarill",
          ability: "hugepower",
          moves: ["aquajet", "protect"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["protect"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["aquajet", "protect"],
      },
    );

    // Turn 1: Azumarill uses Aqua Jet with Huge Power (2x Attack) on Snorlax
    env.executeAndAssert("move aquajet 1, move protect", "move protect, move protect");
  });
});
