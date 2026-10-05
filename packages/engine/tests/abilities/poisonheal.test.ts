import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Poison Heal", () => {
  it("restores 1/8 max HP at the end of each turn when poisoned instead of taking damage", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "gliscor",
          ability: "poisonheal",
          moves: ["sleeptalk"],
          hp: 100,
          status: "psn",
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // End of turn: Gliscor heals 1/8 max HP due to Poison Heal
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
