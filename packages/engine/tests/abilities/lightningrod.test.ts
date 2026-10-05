import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Lightning Rod", () => {
  it("absorbs Electric moves, granting immunity and boosting Special Attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "pikachu",
          ability: "lightningrod",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "raichu",
          ability: "lightningrod",
          moves: ["thunderbolt", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["thunderbolt", "sleeptalk"],
      },
    );

    // Turn 1: Raichu uses Thunderbolt on Pikachu; Lightning Rod absorbs and boosts Pikachu's SpA
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move thunderbolt 1, move sleeptalk");
  });
});
