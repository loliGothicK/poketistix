import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Sand Spit", () => {
  it("summons a Sandstorm when hit by an attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "sandaconda",
          ability: "sandspit",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["bodypress", "sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bodypress", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax attacks Sandaconda, triggering Sand Spit to set Sandstorm
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodypress 1, move sleeptalk");
  });
});
