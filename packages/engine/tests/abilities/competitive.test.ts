import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Competitive", () => {
  it("sharply raises Sp. Atk (+2) when a stat is lowered by an opponent", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "incineroar", ability: "intimidate", moves: ["sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "milotic", ability: "competitive", moves: ["sleeptalk"] }),
        pokemon({ species: "blastoise", ability: "torrent", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Incineroar's Intimidate lowers Milotic's Atk (-1), which triggers Competitive (+2 Sp. Atk)
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
