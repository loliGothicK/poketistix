import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Defiant", () => {
  it("sharply raises Attack (+2) when a stat is lowered by an opponent", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "incineroar", ability: "intimidate", moves: ["sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "kingambit", ability: "defiant", moves: ["sleeptalk"] }),
        pokemon({ species: "blastoise", ability: "torrent", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Incineroar's Intimidate lowers Kingambit's Atk (-1), which triggers Defiant (+2 Atk, net +1)
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
