import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Magic Bounce", () => {
  it("bounces status moves back to the user", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "espeon",
          ability: "magicbounce",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "gyarados",
          ability: "intimidate",
          moves: ["taunt", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["taunt", "sleeptalk"],
      },
    );

    // Turn 1: Gyarados uses Taunt on Espeon; Magic Bounce reflects Taunt back to Gyarados
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move taunt 1, move sleeptalk");
  });
});
