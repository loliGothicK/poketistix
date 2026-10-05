import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Sweet Veil", () => {
  it("prevents the Pokémon and its allies from falling asleep", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "slurpuff",
          ability: "sweetveil",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["yawn", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["yawn", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax uses Yawn on Slurpuff; Sweet Veil prevents sleep
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move yawn 1, move sleeptalk");
  });
});
