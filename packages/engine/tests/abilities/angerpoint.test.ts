import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Anger Point", () => {
  it("maxes Attack when hit by a critical hit", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "glaceon", ability: "snowcloak", moves: ["frostbreath", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "tauros", ability: "angerpoint", moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["frostbreath", "sleeptalk"],
      },
    );

    // Glaceon uses Frost Breath on Tauros (p2a)
    // Frost Breath crits and Anger Point maxes Attack
    env.executeAndAssert("move frostbreath 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
