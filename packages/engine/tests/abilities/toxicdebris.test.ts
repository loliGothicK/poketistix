import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Toxic Debris", () => {
  it("scatters Toxic Spikes at the feet of the opposing team when hit by physical attacks", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "glimmora",
          ability: "toxicdebris",
          moves: ["sleeptalk"],
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
        deterministicMoves: ["bodyslam", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax attacks Glimmora with Body Slam (physical); Toxic Debris sets Toxic Spikes
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodyslam 1, move sleeptalk");
  });
});
