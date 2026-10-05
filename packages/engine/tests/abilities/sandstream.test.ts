import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Sand Stream", () => {
  it("summons a Sandstorm upon entering the battlefield", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "hippowdon",
          ability: "sandstream",
          moves: ["slackoff", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["slackoff", "sleeptalk"],
      },
    );

    // Turn 1: Hippowdon entered and summoned Sandstorm
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
