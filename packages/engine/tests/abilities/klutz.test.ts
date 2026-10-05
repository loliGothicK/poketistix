import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Klutz", () => {
  it("prevents the Pokémon from using its held item", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "lopunny",
          ability: "klutz",
          item: "lifeorb",
          moves: ["quickattack", "sleeptalk"],
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
        deterministicMoves: ["quickattack", "sleeptalk"],
      },
    );

    // Turn 1: Lopunny attacks with Quick Attack; Klutz negates Life Orb damage boost and recoil
    env.executeAndAssert("move quickattack 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
