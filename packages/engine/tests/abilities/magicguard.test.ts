import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Magic Guard", () => {
  it("prevents indirect damage including Life Orb recoil", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "clefable",
          ability: "magicguard",
          item: "lifeorb",
          moves: ["moonblast", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["moonblast", "sleeptalk"],
      },
    );

    // Turn 1: Clefable uses Moonblast with Life Orb; Magic Guard prevents Life Orb recoil
    env.executeAndAssert("move moonblast 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
