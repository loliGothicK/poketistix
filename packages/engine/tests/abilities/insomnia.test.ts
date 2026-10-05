import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Insomnia", () => {
  it("prevents the Pokémon from falling asleep", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "banette",
          ability: "insomnia",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["yawn", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["yawn", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax uses Yawn on Banette; Banette is immune due to Insomnia
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move yawn 1, move sleeptalk");
  });
});
