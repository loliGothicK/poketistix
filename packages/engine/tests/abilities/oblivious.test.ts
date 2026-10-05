import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Oblivious", () => {
  it("grants immunity to Taunt", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "slowbro",
          ability: "oblivious",
          moves: ["amnesia", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "umbreon",
          ability: "synchronize",
          moves: ["taunt", "sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["taunt", "amnesia", "sleeptalk"],
      },
    );

    // Umbreon attempts to Taunt Slowbro; Oblivious blocks it
    env.executeAndAssert("move amnesia, move sleeptalk", "move taunt 1, move sleeptalk");
  });
});
