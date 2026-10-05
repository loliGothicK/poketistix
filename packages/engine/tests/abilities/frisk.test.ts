import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Frisk", () => {
  it("identifies held items of opposing Pokémon on start", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "grimmsnarl",
          ability: "frisk",
          moves: ["spiritbreak", "protect"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          item: "leftovers",
          moves: ["bodyslam", "protect"],
        }),
        pokemon({
          species: "umbreon",
          ability: "synchronize",
          item: "sitrusberry",
          moves: ["protect"],
        }),
      ],
      {
        deterministicMoves: ["spiritbreak", "bodyslam", "protect"],
      },
    );

    env.executeAndAssert("move spiritbreak 1, move protect", "move bodyslam 1, move protect");
  });
});
