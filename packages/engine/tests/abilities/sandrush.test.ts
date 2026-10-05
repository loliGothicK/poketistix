import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Sand Rush", () => {
  it("doubles Speed in Sandstorm and grants immunity to Sandstorm damage", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "excadrill",
          ability: "sandrush",
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

    env.executeAndAssert("move earthquake, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
