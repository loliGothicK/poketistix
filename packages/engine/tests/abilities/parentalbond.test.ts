import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Parental Bond", () => {
  it("hits twice with single-target damaging move", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "kangaskhan-mega",
          ability: "parentalbond",
          moves: ["bodyslam", "sleeptalk"],
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
        deterministicMoves: ["bodyslam", "sleeptalk"],
      },
    );

    // Kangaskhan uses Body Slam on Snorlax; hits twice
    env.executeAndAssert("move bodyslam 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
