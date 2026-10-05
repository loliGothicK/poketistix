import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Clear Body", () => {
  it("prevents stat drops from opponent moves and logs fail", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "incineroar", ability: "blaze", moves: ["scaryface", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "dragapult", ability: "clearbody", moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["scaryface", "sleeptalk"],
      },
    );

    // Incineroar uses Scary Face on Dragapult (p2a)
    // Clear Body blocks the Speed drop and Showdown/Engine log fail
    env.executeAndAssert("move scaryface 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
