import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Light Metal", () => {
  it("halves the Pokémon's weight, reducing damage taken from Low Kick", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "scizor",
          ability: "lightmetal",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "machamp",
          ability: "guts",
          moves: ["lowkick", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["lowkick", "sleeptalk"],
      },
    );

    // Turn 1: Machamp uses Low Kick on Scizor; Light Metal reduces weight and damage
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move lowkick 1, move sleeptalk");
  });
});
