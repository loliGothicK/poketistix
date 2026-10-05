import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Gluttony", () => {
  it("allows Pokémon to eat berries when HP drops", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "snorlax",
          ability: "gluttony",
          item: "sitrusberry",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "lucario",
          ability: "innerfocus",
          moves: ["aurasphere", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["aurasphere", "sleeptalk", "protect"],
      },
    );

    // Lucario uses Aura Sphere on Snorlax
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move aurasphere 1, move sleeptalk");
  });
});
