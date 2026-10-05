import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Solar Power", () => {
  it("boosts Sp. Atk by 1.5x in harsh sunlight and loses 1/8 max HP at end of turn", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "charizard",
          ability: "solarpower",
          moves: ["flamethrower", "sleeptalk"],
        }),
        pokemon({
          species: "torkoal",
          ability: "drought",
          moves: ["sleeptalk"],
        }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "sleeptalk"],
      },
    );

    // Turn 1: Sun is set by Torkoal's Drought; Charizard attacks with boosted Sp. Atk and loses HP at end of turn
    env.executeAndAssert("move flamethrower 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
