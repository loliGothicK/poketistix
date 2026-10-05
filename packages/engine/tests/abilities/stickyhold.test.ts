import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Sticky Hold", () => {
  it("prevents the Pokémon's held item from being removed or stolen", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "swalot",
          ability: "stickyhold",
          item: "leftovers",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "weavile",
          ability: "pressure",
          moves: ["knockoff", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["knockoff", "sleeptalk"],
      },
    );

    // Turn 1: Weavile uses Knock Off on Swalot; Sticky Hold prevents item loss
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move knockoff 1, move sleeptalk");
  });
});
