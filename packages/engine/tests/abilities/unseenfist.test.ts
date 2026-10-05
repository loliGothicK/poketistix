import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Unseen Fist", () => {
  it("allows contact moves to bypass Protect and Detect", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "golurk-mega",
          ability: "unseenfist",
          moves: ["shadowpunch", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["shadowpunch", "protect", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax protects, but Golurk-Mega's contact move bypasses protect due to Unseen Fist
    env.executeAndAssert("move shadowpunch 1, move sleeptalk", "move protect, move sleeptalk");
  });
});
