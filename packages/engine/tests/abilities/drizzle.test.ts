import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Drizzle", () => {
  it("summons rain on entry, boosting Water moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "politoed", ability: "drizzle", moves: ["surf", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["surf", "sleeptalk"],
      },
    );

    // Politoed sets Rain on entry and uses Surf boosted by Rain
    env.executeAndAssert("move surf, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
