import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Plus", () => {
  it("boosts Special Attack when ally has Plus or Minus", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "ampharos",
          ability: "plus",
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
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["thunderbolt", "sleeptalk"],
      },
    );

    // Turn 1: Ampharos attacks with Plus boost from ally Dedenne
    env.executeAndAssert("move thunderbolt 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
