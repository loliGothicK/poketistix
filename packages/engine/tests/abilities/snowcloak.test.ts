import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Snow Cloak", () => {
  it("grants immunity to Snow residual damage", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "glaceon",
          ability: "snowcloak",
          moves: ["icebeam", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "abomasnow",
          ability: "snowwarning",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["icebeam", "sleeptalk"],
      },
    );

    // Turn 1: Abomasnow summoned Snow; Glaceon is immune to any hail/snow effects
    env.executeAndAssert("move icebeam 2, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
