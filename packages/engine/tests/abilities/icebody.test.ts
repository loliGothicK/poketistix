import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Ice Body", () => {
  it("restores 1/16 of its max HP at the end of each turn in Snow", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "glaceon",
          ability: "icebody",
          moves: ["snowscape", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["bodyslam", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["snowscape", "bodyslam", "sleeptalk"],
      },
    );

    // Turn 1: Glaceon sets Snowscape; Snorlax attacks Glaceon with Body Slam; Glaceon heals 1/16 HP at end of turn
    env.executeAndAssert("move snowscape, move sleeptalk", "move bodyslam 1, move sleeptalk");
  });
});
