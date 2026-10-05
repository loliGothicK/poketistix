import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Sniper", () => {
  it("powers up critical hits to 2.25x instead of 1.5x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "inteleon",
          ability: "sniper",
          moves: ["snipeshot", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "snipeshot", willCrit: true }, "sleeptalk"],
        engineConfig: {
          crits: "always",
        },
      },
    );

    // Turn 1: Inteleon lands guaranteed crit with Snipe Shot, boosted by Sniper
    env.executeAndAssert("move snipeshot 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
