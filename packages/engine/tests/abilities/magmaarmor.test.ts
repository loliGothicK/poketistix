import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Magma Armor", () => {
  it("prevents the Pokémon from being frozen", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "camerupt",
          ability: "magmaarmor",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "slowbro",
          ability: "oblivious",
          moves: ["icebeam", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "icebeam", secondary: "always" }, "sleeptalk"],
      },
    );

    // Turn 1: Slowbro hits Camerupt with Ice Beam; Magma Armor prevents freeze
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move icebeam 1, move sleeptalk");
  });
});
