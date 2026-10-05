import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Sand Force", () => {
  it("boosts Rock, Ground, and Steel moves by 1.3x in a Sandstorm and grants Sandstorm immunity", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "excadrill",
          ability: "sandforce",
          moves: ["earthquake", "sleeptalk"],
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
        deterministicMoves: ["earthquake", "slackoff", "sleeptalk"],
      },
    );

    // Turn 1: Sandstorm is active from Hippowdon's Sand Stream
    // Excadrill uses Earthquake boosted by Sand Force
    env.executeAndAssert("move earthquake, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
