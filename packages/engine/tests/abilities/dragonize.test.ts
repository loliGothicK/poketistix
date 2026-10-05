import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Dragonize", () => {
  it("turns Normal-type moves into Dragon-type moves and boosts their power", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "feraligatr-mega",
          ability: "dragonize",
          moves: ["bodyslam", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bodyslam", "sleeptalk"],
      },
    );

    // Mega Feraligatr uses Body Slam (Normal move) on Clefable (Fairy type)
    // Dragonize turns Body Slam into Dragon-type, which is completely immune against Fairy
    env.executeAndAssert("move bodyslam 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
