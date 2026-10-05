import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Multiscale", () => {
  it("halves damage taken when at full HP", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "dragonite",
          ability: "multiscale",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "charizard",
          ability: "blaze",
          moves: ["dragonclaw", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["dragonclaw", "sleeptalk"],
      },
    );

    // Turn 1: Charizard uses Dragon Claw on Dragonite at full HP; Multiscale reduces damage by 50%
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move dragonclaw 1, move sleeptalk");
  });
});
