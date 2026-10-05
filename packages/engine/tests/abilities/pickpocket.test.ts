import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Pickpocket", () => {
  it("steals attacker's item on contact when user has no item", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "weavile",
          ability: "pickpocket",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          item: "leftovers",
          moves: ["bodyslam", "sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bodyslam", "sleeptalk"],
      },
    );

    // Snorlax uses Body Slam (contact) on Weavile; Weavile steals Leftovers
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodyslam 1, move sleeptalk");
  });
});
