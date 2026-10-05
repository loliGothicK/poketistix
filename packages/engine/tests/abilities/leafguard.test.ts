import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Leaf Guard", () => {
  it("prevents status conditions in harsh sunlight", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "leafeon",
          ability: "leafguard",
          moves: ["sunnyday", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "umbreon",
          ability: "synchronize",
          moves: ["toxic", "sleeptalk"],
        }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sunnyday", "toxic", "sleeptalk"],
      },
    );

    // Turn 1: Leafeon sets Sunny Day
    env.executeAndAssert("move sunnyday, move sleeptalk", "move sleeptalk, move sleeptalk");

    // Turn 2: Umbreon attempts Toxic on Leafeon; Leaf Guard blocks status in sunlight
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move toxic 1, move sleeptalk");
  });
});
