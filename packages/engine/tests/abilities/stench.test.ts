import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Stench", () => {
  it("allows user to attack normally with Stench ability", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "garbodor",
          ability: "stench",
          moves: ["crosspoison", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "jolteon", ability: "voltabsorb", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["crosspoison", "sleeptalk"],
      },
    );

    // Turn 1: Jolteon acts first, then Garbodor uses Cross Poison on Jolteon
    env.executeAndAssert("move crosspoison 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
