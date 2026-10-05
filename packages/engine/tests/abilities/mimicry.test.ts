import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Mimicry", () => {
  it("changes the user's type according to the active terrain", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "galarian-stunfisk",
          ability: "mimicry",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "raichu",
          ability: "lightningrod",
          moves: ["electricterrain", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["electricterrain", "sleeptalk"],
      },
    );

    // Turn 1: Raichu sets Electric Terrain; Mimicry changes Galarian Stunfisk to Electric type
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move electricterrain, move sleeptalk");
  });
});
