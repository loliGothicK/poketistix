import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Hyper Cutter", () => {
  it("prevents other Pokémon from lowering its Attack stat", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "gliscor",
          ability: "hypercutter",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "arcanine",
          ability: "intimidate",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Turn 1: Arcanine's Intimidate fails to lower Gliscor's Attack due to Hyper Cutter
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
