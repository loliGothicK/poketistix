import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Minus", () => {
  it("boosts Special Attack by 1.5x when an ally has Plus or Minus", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "toxtricity-low-key",
          ability: "minus",
          moves: ["thunderbolt", "sleeptalk"],
        }),
        pokemon({
          species: "dedenne",
          ability: "plus",
          moves: ["sleeptalk"],
        }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["thunderbolt", "sleeptalk"],
      },
    );

    // Turn 1: Toxtricity uses Thunderbolt; Minus boosts its Sp. Atk by 1.5x due to Plus ally
    env.executeAndAssert("move thunderbolt 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
