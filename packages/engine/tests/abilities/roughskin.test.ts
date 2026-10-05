import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Rough Skin", () => {
  it("inflicts 1/8 max HP recoil damage when hit by a contact move", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "garchomp",
          ability: "roughskin",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "lopunny-mega",
          ability: "scrappy",
          moves: ["quickattack", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["quickattack", "sleeptalk"],
      },
    );

    // Turn 1: Lopunny hits Garchomp with contact move Quick Attack and takes Rough Skin damage
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move quickattack 1, move sleeptalk");
  });
});
