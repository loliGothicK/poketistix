import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Grass Pelt", () => {
  it("boosts Defense by 1.5x in Grassy Terrain", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "gogoat",
          ability: "grasspelt",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({
          species: "rillaboom",
          ability: "grassysurge",
          moves: ["sleeptalk"],
        }),
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

    // Turn 1: Snorlax uses Body Slam (physical) on Gogoat in Grassy Terrain -> Grass Pelt boosts Defense by 1.5x
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodyslam 1, move sleeptalk");
  });
});
