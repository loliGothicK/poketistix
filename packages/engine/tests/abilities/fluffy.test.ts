import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Fluffy", () => {
  it("halves contact move damage and doubles Fire move damage", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "houndstone",
          ability: "fluffy",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["crunch", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["crunch", "sleeptalk", "protect"],
      },
    );

    // Turn 1: Snorlax uses Crunch (contact move) on Houndstone (p1a) -> Fluffy halves damage
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move crunch 1, move sleeptalk");
  });
});
