import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Sturdy", () => {
  it("survives an attack that would KO with 1 HP when at full HP", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "skarmory",
          ability: "sturdy",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "charizard",
          ability: "blaze",
          moves: ["flamethrower", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        engineConfig: { damage_roll: "max" },
        deterministicMoves: ["flamethrower", "sleeptalk"],
      },
    );

    // Charizard uses Flamethrower which would OHKO Skarmory.
    // Sturdy activates, Skarmory endures with 1 HP.
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move flamethrower 1, move sleeptalk");
  });
});
