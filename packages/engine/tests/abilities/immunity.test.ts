import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Immunity", () => {
  it("prevents the Pokémon from being poisoned", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "snorlax",
          ability: "immunity",
          moves: ["bodyslam", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "umbreon",
          ability: "synchronize",
          moves: ["toxic", "sleeptalk"],
        }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["toxic", "bodyslam", "sleeptalk"],
      },
    );

    // Turn 1: Umbreon uses Toxic on Snorlax; Snorlax is immune to Poison
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move toxic 1, move sleeptalk");
  });
});
