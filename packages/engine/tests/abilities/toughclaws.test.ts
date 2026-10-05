import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Tough Claws", () => {
  it("powers up moves that make direct contact by 1.3x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "charizard-mega-x",
          ability: "toughclaws",
          moves: ["dragonclaw", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["dragonclaw", "sleeptalk"],
      },
    );

    // Turn 1: Mega Charizard X attacks Snorlax with Dragon Claw (contact move boosted by Tough Claws)
    env.executeAndAssert("move dragonclaw 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
