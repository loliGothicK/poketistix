import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Long Reach", () => {
  it("prevents the user's moves from making contact with the target", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "decidueye",
          ability: "longreach",
          moves: ["leafblade", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "garchomp",
          ability: "roughskin",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["leafblade", "sleeptalk"],
      },
    );

    // Turn 1: Decidueye uses Leaf Blade on Garchomp; Long Reach prevents Rough Skin recoil
    env.executeAndAssert("move leafblade 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
