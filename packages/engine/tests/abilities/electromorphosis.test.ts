import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Electromorphosis", () => {
  it("gains Charge status when hit by an attack, boosting the next Electric move", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "bellibolt",
          ability: "electromorphosis",
          moves: ["thunderbolt", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "immunity",
          moves: ["bodyslam", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bodyslam", "thunderbolt", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax attacks Bellibolt -> Electromorphosis activates (Bellibolt is Charged)
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodyslam 1, move sleeptalk");

    // Turn 2: Bellibolt uses Thunderbolt on Snorlax with 2x power from Charge
    env.executeAndAssert("move thunderbolt 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
