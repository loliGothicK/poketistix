import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Spicy Spray", () => {
  it("burns the attacker upon being hit by a damaging attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "scovillain-mega",
          ability: "spicyspray",
          moves: ["sleeptalk"],
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
        deterministicMoves: ["bodypress", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax uses Body Press on Scovillain-Mega; Spicy Spray inflicts burn on Snorlax
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodypress 1, move sleeptalk");
  });
});
