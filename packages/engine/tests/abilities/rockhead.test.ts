import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Rock Head", () => {
  it("prevents recoil damage from recoil moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "hisuian-arcanine",
          ability: "rockhead",
          moves: ["headsmash", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["headsmash", "sleeptalk"],
      },
    );

    // Turn 1: Arcanine uses Head Smash, deals damage but takes 0 recoil damage
    env.executeAndAssert("move headsmash 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
