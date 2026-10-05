import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Inner Focus", () => {
  it("prevents the Pokémon from having its Attack stat lowered by Intimidate", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "umbreon",
          ability: "innerfocus",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "arcanine",
          ability: "intimidate",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Turn 1: Arcanine's Intimidate fails against Umbreon's Inner Focus
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
