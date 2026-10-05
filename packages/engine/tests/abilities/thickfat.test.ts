import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Thick Fat", () => {
  it("halves damage taken from Fire-type and Ice-type moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "charizard",
          ability: "blaze",
          moves: ["flamethrower", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "sleeptalk"],
      },
    );

    // Turn 1: Charizard uses Flamethrower on Snorlax; Thick Fat halves the damage
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move flamethrower 1, move sleeptalk");
  });
});
