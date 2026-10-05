import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Illusion", () => {
  it("enters battle with Illusion", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "zoroark",
          ability: "illusion",
          moves: ["darkpulse", "sleeptalk"],
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
        deterministicMoves: ["darkpulse", "sleeptalk"],
      },
    );

    // Turn 1: Zoroark uses Dark Pulse on Snorlax
    env.executeAndAssert("move darkpulse 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
