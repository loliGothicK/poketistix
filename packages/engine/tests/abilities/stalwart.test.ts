import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Stalwart", () => {
  it("allows user to enter the battlefield and take action with Stalwart", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "archaludon",
          ability: "stalwart",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Turn 1: Archaludon takes turn normally with Stalwart ability
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
