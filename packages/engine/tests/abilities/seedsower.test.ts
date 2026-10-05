import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Seed Sower", () => {
  it("turns the ground into Grassy Terrain when hit by an attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "arboliva",
          ability: "seedsower",
          moves: ["energyball", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["bodypress", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bodypress", "energyball", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax attacks Arboliva, triggering Seed Sower to set Grassy Terrain
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodypress 1, move sleeptalk");
  });
});
