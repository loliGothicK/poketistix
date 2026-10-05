import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Drought", () => {
  it("summons harsh sunlight on entry, boosting Fire moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "torkoal", ability: "drought", moves: ["flamethrower", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "sleeptalk"],
      },
    );

    // Torkoal sets Harsh Sunlight on entry and uses Flamethrower boosted by Sun
    env.executeAndAssert("move flamethrower 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
