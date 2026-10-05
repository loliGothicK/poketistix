import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Hydration", () => {
  it("cures status conditions at the end of the turn when raining", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "vaporeon",
          ability: "hydration",
          moves: ["raindance", "rest", "sleeptalk"],
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
        deterministicMoves: ["raindance", "rest", "sleeptalk"],
      },
    );

    // Turn 1: Vaporeon sets Rain
    env.executeAndAssert("move raindance, move sleeptalk", "move sleeptalk, move sleeptalk");

    // Turn 2: Vaporeon uses Rest to fall asleep, and Hydration cures sleep at the end of the turn
    env.executeAndAssert("move rest, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
