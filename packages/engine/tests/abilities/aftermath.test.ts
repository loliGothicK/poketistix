import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Aftermath", () => {
  it("damages the attacker when fainted by a contact move", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "pikachu", ability: "static", moves: ["quickattack", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "garbodor", ability: "aftermath", hp: 1, moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["quickattack", "sleeptalk"],
      },
    );

    // Pikachu uses Quick Attack (contact) to faint Garbodor (1 HP)
    // Aftermath damages Pikachu for 1/4 max HP
    env.executeAndAssert("move quickattack 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
