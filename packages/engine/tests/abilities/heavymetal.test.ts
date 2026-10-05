import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Heavy Metal", () => {
  it("doubles the Pokémon's weight, increasing Heavy Slam power", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "aggron",
          ability: "heavymetal",
          moves: ["heavyslam", "protect"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "clefable",
          ability: "unaware",
          moves: ["protect"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["heavyslam", "protect"],
      },
    );

    // Turn 1: Aggron uses Heavy Slam on Clefable with doubled weight
    env.executeAndAssert("move heavyslam 1, move protect", "move protect, move protect");
  });
});
