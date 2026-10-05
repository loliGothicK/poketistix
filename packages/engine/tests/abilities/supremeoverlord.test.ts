import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Supreme Overlord", () => {
  it("boosts move power based on the number of fainted party members", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "kingambit",
          ability: "supremeoverlord",
          moves: ["ironhead", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"], hp: 0 }),
      ],
      [
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["ironhead", "sleeptalk"],
      },
    );

    // Turn 1: Kingambit attacks Snorlax with boosted power from 1 fainted party member
    env.executeAndAssert("move ironhead 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
