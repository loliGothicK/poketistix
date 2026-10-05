import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Poison Touch", () => {
  it("poisons the target on contact attacking moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "toxicroak",
          ability: "poisontouch",
          moves: ["drainpunch", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["drainpunch", "sleeptalk"],
      },
    );

    // Toxicroak uses Drain Punch (contact) on Snorlax; Poison Touch poisons Snorlax
    env.executeAndAssert("move drainpunch 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
