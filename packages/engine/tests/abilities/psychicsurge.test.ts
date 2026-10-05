import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Psychic Surge", () => {
  it("sets Psychic Terrain upon entering the battlefield", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "indeedee-male",
          ability: "psychicsurge",
          moves: ["hypervoice", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["hypervoice", "sleeptalk"],
      },
    );

    // Turn 1: Psychic Terrain is already active from switch-in
    env.executeAndAssert("move hypervoice, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
