import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Super Luck", () => {
  it("heightens the critical-hit ratio by 1 stage", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "absol",
          ability: "superluck",
          moves: ["nightslash", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "nightslash", willCrit: true }, "sleeptalk"],
        engineConfig: {
          crits: "always",
        },
      },
    );

    // Turn 1: Absol attacks Snorlax with Night Slash (boosted crit stage from Super Luck)
    env.executeAndAssert("move nightslash 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
