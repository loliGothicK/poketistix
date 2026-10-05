import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Skill Link", () => {
  it("causes multi-hit moves to always hit the maximum number of times (5 hits)", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "heracross-mega",
          ability: "skilllink",
          moves: ["pinmissile", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "pinmissile", accuracy: true }, "sleeptalk"],
      },
    );

    // Turn 1: Heracross-Mega uses Pin Missile, hitting 5 times
    env.executeAndAssert("move pinmissile 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
