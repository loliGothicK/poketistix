import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Opportunist", () => {
  it("copies opponent positive stat boosts", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "espathra",
          ability: "opportunist",
          moves: ["calmmind", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["amnesia", "sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["amnesia", "calmmind", "sleeptalk"],
      },
    );

    // Snorlax uses Amnesia (+2 SpD); Espathra's Opportunist copies the +2 SpD boost
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move amnesia, move sleeptalk");
  });
});
