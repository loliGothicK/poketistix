import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Fur Coat", () => {
  it("doubles Defense stat against physical attacks", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "furfrou",
          ability: "furcoat",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["bodyslam", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bodyslam", "sleeptalk", "protect"],
      },
    );

    // Turn 1: Snorlax uses Body Slam (physical) on Furfrou (p1a) -> Fur Coat doubles Defense
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodyslam 1, move sleeptalk");
  });
});
