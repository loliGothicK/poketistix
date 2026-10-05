import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Technician", () => {
  it("powers up moves with base power 60 or less by 1.5x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "scizor",
          ability: "technician",
          moves: ["bulletpunch", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bulletpunch", "sleeptalk"],
      },
    );

    // Turn 1: Scizor uses Bullet Punch (base power 40) boosted by Technician 1.5x
    env.executeAndAssert("move bulletpunch 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
