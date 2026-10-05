import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: White Smoke", () => {
  it("prevents other Pokémon from lowering its stats", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "torkoal",
          ability: "whitesmoke",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "incineroar",
          ability: "blaze",
          moves: ["scaryface", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["scaryface", "sleeptalk"],
      },
    );

    // Turn 1: Incineroar uses Scary Face on Torkoal; White Smoke prevents stat drop
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move scaryface 1, move sleeptalk");
  });
});
