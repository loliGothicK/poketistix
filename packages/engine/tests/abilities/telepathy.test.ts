import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Telepathy", () => {
  it("protects the Pokémon from damaging attacks made by its ally", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "garchomp",
          ability: "roughskin",
          moves: ["earthquake", "sleeptalk"],
        }),
        pokemon({
          species: "gardevoir",
          ability: "telepathy",
          moves: ["sleeptalk"],
        }),
      ],
      [
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["earthquake", "sleeptalk"],
      },
    );

    // Turn 1: Garchomp uses Earthquake; Telepathy grants Gardevoir immunity to ally's Earthquake
    env.executeAndAssert("move earthquake, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
