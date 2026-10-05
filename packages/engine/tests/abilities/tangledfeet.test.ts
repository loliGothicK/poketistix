import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Tangled Feet", () => {
  it("allows user to take actions normally with Tangled Feet", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "pidgeot",
          ability: "tangledfeet",
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

    // Turn 1: Pidgeot takes turn normally
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
