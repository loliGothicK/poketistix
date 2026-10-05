import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Forewarn", () => {
  it("warns of the opposing Pokémon's strongest move on start", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "musharna",
          ability: "forewarn",
          moves: ["psychic", "protect"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["bodyslam", "protect"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["psychic", "bodyslam", "protect"],
      },
    );

    env.executeAndAssert("move psychic 1, move protect", "move bodyslam 1, move protect");
  });
});
