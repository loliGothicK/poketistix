import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Motor Drive", () => {
  it("absorbs Electric attacks and boosts Speed by 1", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "pikachu", ability: "static", moves: ["thunderbolt", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "emolga", ability: "motordrive", moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["thunderbolt", "sleeptalk"],
      },
    );

    // Pikachu uses Thunderbolt on Emolga (p2a)
    // Motor Drive absorbs Thunderbolt and raises Speed by 1
    env.executeAndAssert("move thunderbolt 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
