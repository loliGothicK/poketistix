import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Friend Guard", () => {
  it("reduces damage taken by allies by 25%", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "vivillon",
          ability: "friendguard",
          moves: ["protect", "sleeptalk"],
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
        deterministicMoves: ["bodyslam", "sleeptalk", "protect"],
      },
    );

    // Turn 1: Snorlax uses Body Slam on Charizard (p1b) -> Friend Guard on Vivillon reduces damage by 25%
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodyslam 2, move sleeptalk");
  });
});
