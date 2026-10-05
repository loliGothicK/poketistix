import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Harvest", () => {
  it("restores a consumed Berry at end of turn in harsh sunlight", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "trevenant",
          ability: "harvest",
          item: "sitrusberry",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({
          species: "charizard-mega-y",
          ability: "drought",
          moves: ["sleeptalk"],
        }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["crunch", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["crunch", "sleeptalk", "protect"],
      },
    );

    // Turn 1: Snorlax attacks Trevenant with Crunch, triggering Sitrus Berry; Harvest restores it in Sun
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move crunch 1, move sleeptalk");
  });
});
