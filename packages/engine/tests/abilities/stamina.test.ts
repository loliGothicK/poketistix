import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Stamina", () => {
  it("boosts Defense by 1 when hit by an attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "pikachu", ability: "static", moves: ["quickattack", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "mudsdale", ability: "stamina", moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["quickattack", "sleeptalk"],
      },
    );

    // Pikachu uses Quick Attack on Mudsdale (p2a)
    // Mudsdale takes damage and Stamina raises Defense by 1
    env.executeAndAssert("move quickattack 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
