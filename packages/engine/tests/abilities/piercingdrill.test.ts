import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Piercing Drill", () => {
  it("allows contact moves to bypass Protect at 0.25x damage", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "excadrill-mega",
          ability: "piercingdrill",
          moves: ["drillrun", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "drillrun", accuracy: true }, "protect", "sleeptalk"],
      },
    );

    // Snorlax protects, Excadrill uses Drill Run (contact) on Snorlax; Piercing Drill bypasses Protect
    env.executeAndAssert("move drillrun 1, move sleeptalk", "move protect, move sleeptalk");
  });
});
