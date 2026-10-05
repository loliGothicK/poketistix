import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Sand Veil", () => {
  it("grants immunity to Sandstorm residual damage", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "garchomp",
          ability: "sandveil",
          moves: ["dragonclaw", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "hippowdon",
          ability: "sandstream",
          moves: ["slackoff", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["dragonclaw", "slackoff", "sleeptalk"],
      },
    );

    // Turn 1: Hippowdon entered and summoned Sandstorm, Garchomp is immune to Sandstorm damage
    env.executeAndAssert("move dragonclaw 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
