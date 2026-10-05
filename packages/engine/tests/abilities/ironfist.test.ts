import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Iron Fist", () => {
  it("boosts punching moves power by 1.2x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "conkeldurr",
          ability: "ironfist",
          moves: ["machpunch", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
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
        deterministicMoves: ["machpunch", "sleeptalk"],
      },
    );

    // Turn 1: Conkeldurr uses Mach Punch boosted by Iron Fist on Snorlax
    env.executeAndAssert("move machpunch 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
