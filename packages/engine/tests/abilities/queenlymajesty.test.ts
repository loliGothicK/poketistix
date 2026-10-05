import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Queenly Majesty", () => {
  it("blocks opponent priority moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "pikachu", ability: "static", moves: ["quickattack", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "tsareena", ability: "queenlymajesty", moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["quickattack", "sleeptalk"],
      },
    );

    // Pikachu uses Quick Attack on Tsareena (p2a)
    // Queenly Majesty blocks the priority attack
    env.executeAndAssert("move quickattack 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
