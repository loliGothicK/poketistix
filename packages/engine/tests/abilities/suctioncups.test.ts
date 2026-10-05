import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Suction Cups", () => {
  it("prevents the Pokémon from being forced out by moves like Roar", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "malamar",
          ability: "suctioncups",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "arcanine",
          ability: "intimidate",
          moves: ["roar", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["roar", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax uses Roar on Malamar; Suction Cups anchors Malamar
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move roar 1, move sleeptalk");
  });
});
