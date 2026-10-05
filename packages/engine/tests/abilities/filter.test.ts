import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Filter", () => {
  it("reduces the damage taken from super-effective attacks by 25%", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "mr-mime",
          ability: "filter",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "immunity",
          moves: ["shadowball", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["shadowball", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax uses Shadow Ball on Mr. Mime (super-effective against Psychic, reduced by Filter)
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move shadowball 1, move sleeptalk");
  });
});
