import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Mummy", () => {
  it("changes the attacker's ability to Mummy when hit by a contact move", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "cofagrigus",
          ability: "mummy",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "pikachu",
          ability: "static",
          moves: ["quickattack", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["quickattack", "sleeptalk"],
      },
    );

    // Turn 1: Pikachu hits Cofagrigus with Quick Attack (contact); Pikachu's ability becomes Mummy
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move quickattack 1, move sleeptalk");
  });
});
