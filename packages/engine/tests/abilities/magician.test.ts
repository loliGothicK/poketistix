import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Magician", () => {
  it("steals the target's held item upon attacking if the user has no item", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "delphox",
          ability: "magician",
          moves: ["mysticalfire", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          item: "leftovers",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["mysticalfire", "sleeptalk"],
      },
    );

    // Turn 1: Delphox attacks Snorlax with Mystical Fire; Magician steals Snorlax's Leftovers
    env.executeAndAssert("move mysticalfire 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
