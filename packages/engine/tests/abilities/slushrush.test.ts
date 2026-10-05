import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Slush Rush", () => {
  it("doubles Speed in Snow", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "beartic",
          ability: "slushrush",
          moves: ["iciclecrash", "sleeptalk"],
        }),
        pokemon({
          species: "abomasnow",
          ability: "snowwarning",
          moves: ["sleeptalk"],
        }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["iciclecrash", "sleeptalk"],
      },
    );

    // Turn 1: Snow is set by Abomasnow's Snow Warning; Beartic moves first due to doubled Speed
    env.executeAndAssert("move iciclecrash 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
