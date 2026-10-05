import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Damp", () => {
  it("prevents self-destruct moves from being used", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "politoed", ability: "damp", moves: ["sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "forretress", ability: "sturdy", moves: ["explosion", "sleeptalk"] }),
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["explosion", "sleeptalk"],
      },
    );

    // Forretress tries to use Explosion, but Damp prevents it
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move explosion, move sleeptalk");
  });
});
