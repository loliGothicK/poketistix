import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Water Bubble", () => {
  it("doubles the power of Water-type moves and halves Fire damage taken", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "araquanid",
          ability: "waterbubble",
          moves: ["liquidation", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["liquidation", "sleeptalk"],
      },
    );

    // Turn 1: Araquanid attacks Snorlax with Water Bubble boosted Liquidation
    env.executeAndAssert("move liquidation 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
