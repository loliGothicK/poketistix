import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Run Away", () => {
  it("has no negative battle effect and functions in competitive format", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "thievul",
          ability: "runaway",
          moves: ["snarl", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["snarl", "sleeptalk"],
      },
    );

    env.executeAndAssert("move snarl, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
