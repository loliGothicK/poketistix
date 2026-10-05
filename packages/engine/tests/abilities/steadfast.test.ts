import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Steadfast", () => {
  it("boosts Speed by 1 stage upon flinching", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "lucario",
          ability: "steadfast",
          moves: ["closecombat", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "weavile",
          ability: "pressure",
          moves: ["fakeout", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["fakeout", "closecombat", "sleeptalk"],
      },
    );

    // Turn 1: Weavile uses Fake Out causing Lucario to flinch; Steadfast triggers +1 Speed
    env.executeAndAssert("move closecombat 1, move sleeptalk", "move fakeout 1, move sleeptalk");
  });
});
