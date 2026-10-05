import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Guard Dog", () => {
  it("boosts Attack by 1 stage instead of dropping when Intimidated", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "incineroar", ability: "intimidate", moves: ["sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "mabosstiff", ability: "guarddog", moves: ["sleeptalk"] }),
        pokemon({ species: "blastoise", ability: "torrent", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Incineroar's Intimidate boosts Mabosstiff's Attack (+1)
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
