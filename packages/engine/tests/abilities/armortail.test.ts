import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Armor Tail", () => {
  it("blocks opponent priority moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "pikachu", ability: "static", moves: ["quickattack", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "farigiraf", ability: "armortail", moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["quickattack", "sleeptalk"],
      },
    );

    // Pikachu uses Quick Attack on Farigiraf (p2a)
    // Armor Tail blocks the priority attack
    env.executeAndAssert("move quickattack 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
