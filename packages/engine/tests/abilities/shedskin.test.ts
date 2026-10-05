import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Shed Skin", () => {
  it("cures status conditions at the end of turn", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "sandaconda",
          ability: "shedskin",
          moves: ["rest", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        engineConfig: { secondary: "always" },
        deterministicMoves: ["rest", "sleeptalk"],
      },
    );

    // Turn 1: Sandaconda uses Rest and falls asleep; Shed Skin cures sleep at end of turn
    env.executeAndAssert("move rest, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
