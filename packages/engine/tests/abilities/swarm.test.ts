import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Swarm", () => {
  it("boosts Bug-type moves when at or below 1/3 HP", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "scizor",
          ability: "swarm",
          moves: ["xscissor", "sleeptalk"],
          hp: 40,
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
        deterministicMoves: ["xscissor", "sleeptalk"],
      },
    );

    // Turn 1: Scizor at low HP uses X-Scissor on Umbreon with Swarm 1.5x boost
    env.executeAndAssert("move xscissor 2, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
