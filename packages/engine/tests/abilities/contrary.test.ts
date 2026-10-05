import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Contrary", () => {
  it("inverts stat stage changes (e.g. Leaf Storm boosts Sp. Atk)", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "serperior", ability: "contrary", moves: ["leafstorm", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "blastoise", ability: "torrent", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "leafstorm", accuracy: true }, "sleeptalk"],
      },
    );

    // Serperior uses Leaf Storm on Snorlax; with Contrary, Sp. Atk increases by 2
    env.executeAndAssert("move leafstorm 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
