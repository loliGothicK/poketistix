import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Innards Out", () => {
  it("damages the attacker for the remaining HP when knocked out", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "victreebel-mega",
          ability: "innardsout",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "charizard",
          ability: "blaze",
          moves: ["flamethrower", "sleeptalk"],
        }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "sleeptalk"],
      },
    );

    // Turn 1: Charizard uses Flamethrower to knock out Victreebel-Mega; Innards Out deals recoil equal to Victreebel's HP
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move flamethrower 1, move sleeptalk");
  });
});
