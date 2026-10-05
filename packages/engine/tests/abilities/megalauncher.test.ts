import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Mega Launcher", () => {
  it("boosts pulse and aura moves power by 1.5x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "blastoise-mega",
          ability: "megalauncher",
          moves: ["waterpulse", "sleeptalk"],
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
        deterministicMoves: ["waterpulse", "sleeptalk"],
      },
    );

    // Blastoise uses Water Pulse on Snorlax; Mega Launcher boosts power by 1.5x
    env.executeAndAssert("move waterpulse 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
