import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Mold Breaker", () => {
  it("ignores target's defensive abilities that affect attacks", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "excadrill",
          ability: "moldbreaker",
          moves: ["earthquake", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "rotom-wash",
          ability: "levitate",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["earthquake", "sleeptalk"],
      },
    );

    // Turn 1: Excadrill uses Earthquake; Mold Breaker hits Rotom-Wash despite Levitate
    env.executeAndAssert("move earthquake, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
