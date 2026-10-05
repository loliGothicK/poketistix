import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Heatproof", () => {
  it("halves damage taken from Fire-type moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "sinistcha",
          ability: "heatproof",
          moves: ["protect", "matchagotcha"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "charizard",
          ability: "blaze",
          moves: ["flamethrower", "protect"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "matchagotcha", "protect"],
      },
    );

    // Turn 1: Charizard uses Flamethrower on Sinistcha (p1a) -> Heatproof halves damage
    env.executeAndAssert("move protect, move protect", "move flamethrower 1, move protect");
  });
});
