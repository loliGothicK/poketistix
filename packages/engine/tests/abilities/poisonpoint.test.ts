import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Poison Point", () => {
  it("poisons the attacker on contact", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "roserade",
          ability: "poisonpoint",
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
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bodyslam", "sleeptalk"],
      },
    );

    // Snorlax uses Body Slam (contact) on Roserade; Poison Point poisons Snorlax
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodyslam 1, move sleeptalk");
  });
});
