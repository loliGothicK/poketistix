import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Rattled", () => {
  it("boosts Speed by 1 stage when hit by a Dark-type move", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "alolan-persian",
          ability: "rattled",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "thievul",
          ability: "runaway",
          moves: ["snarl", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["snarl", "sleeptalk"],
      },
    );

    // Turn 1: Thievul hits Persian with Dark-type Snarl, boosting Persian's Speed via Rattled
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move snarl, move sleeptalk");
  });
});
