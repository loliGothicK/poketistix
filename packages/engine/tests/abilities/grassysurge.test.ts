import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Grassy Surge", () => {
  it("sets Grassy Terrain on switch-in", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "rillaboom",
          ability: "grassysurge",
          moves: ["woodhammer", "protect"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["protect"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["woodhammer", "protect"],
      },
    );

    // Turn 1: Grassy Surge sets Grassy Terrain on start
    env.executeAndAssert("move woodhammer 1, move protect", "move protect, move protect");
  });
});
