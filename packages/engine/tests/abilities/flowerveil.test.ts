import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Flower Veil", () => {
  it("prevents stat drops on Grass-type allies from opposing Pokemon", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "florges",
          ability: "flowerveil",
          moves: ["sleeptalk"],
        }),
        pokemon({
          species: "venusaur",
          ability: "chlorophyll",
          moves: ["sleeptalk"],
        }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["screech", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["screech", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax uses Screech on Venusaur (p1b) -> blocked by Flower Veil
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move screech 2, move sleeptalk");
  });
});
