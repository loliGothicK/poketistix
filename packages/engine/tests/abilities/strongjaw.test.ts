import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Strong Jaw", () => {
  it("powers up biting moves by 1.5x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "tyrantrum",
          ability: "strongjaw",
          moves: ["crunch", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["crunch", "sleeptalk"],
      },
    );

    // Turn 1: Tyrantrum attacks Snorlax with Strong Jaw boosted Crunch
    env.executeAndAssert("move crunch 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
