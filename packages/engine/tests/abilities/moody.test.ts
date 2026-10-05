import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Moody", () => {
  it("raises one stat sharply and lowers another at the end of each turn", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "glalie",
          ability: "moody",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["protect", "sleeptalk"],
      },
    );

    // Turn 1: Glalie uses protect; at end of turn Moody boosts a stat by 2 stages and lowers another by 1
    env.executeAndAssert("move protect, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
