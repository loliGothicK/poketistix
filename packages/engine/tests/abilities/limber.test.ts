import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Limber", () => {
  it("prevents the Pokémon from being paralyzed", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "lopunny",
          ability: "limber",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "raichu",
          ability: "lightningrod",
          moves: ["thunderwave", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["thunderwave", "sleeptalk"],
      },
    );

    // Turn 1: Raichu attempts Thunder Wave on Lopunny; Limber blocks paralysis
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move thunderwave 1, move sleeptalk");
  });
});
