import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: No Guard", () => {
  it("ensures all moves used by or against the Pokemon never miss", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "machamp", ability: "noguard", moves: ["dynamicpunch", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "pikachu",
          ability: "lightningrod",
          moves: ["doubleteam", "sleeptalk"],
        }),
        pokemon({ species: "blastoise", ability: "torrent", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Pikachu uses Double Team (+1 Evasion)
    // Machamp uses Dynamic Punch (50% accuracy); No Guard ensures it connects
    env.executeAndAssert("move dynamicpunch 1, move sleeptalk", "move doubleteam, move sleeptalk");
  });
});
