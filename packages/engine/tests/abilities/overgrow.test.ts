import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Overgrow", () => {
  it("boosts Grass-type moves when at or below 1/3 HP", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "venusaur",
          ability: "overgrow",
          moves: ["energyball", "sleeptalk"],
          hp: 40,
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["energyball", "sleeptalk"],
      },
    );

    // Turn 1: Venusaur at full HP uses Energy Ball on Snorlax
    env.executeAndAssert("move energyball 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
