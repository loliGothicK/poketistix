import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Mirror Armor", () => {
  it("reflects stat-lowering effects back to the opposing user", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "incineroar", ability: "intimidate", moves: ["sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "corviknight", ability: "mirrorarmor", moves: ["sleeptalk"] }),
        pokemon({ species: "blastoise", ability: "torrent", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Incineroar's Intimidate targets Corviknight, which bounces the -1 Atk drop back to Incineroar
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
