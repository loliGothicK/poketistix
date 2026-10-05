import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Liquid Ooze", () => {
  it("damages the attacker instead of healing when targeted by draining moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "swalot",
          ability: "liquidooze",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "venusaur",
          ability: "overgrow",
          moves: ["gigadrain", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["gigadrain", "sleeptalk"],
      },
    );

    // Turn 1: Venusaur uses Giga Drain on Swalot; Liquid Ooze damages Venusaur instead of healing
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move gigadrain 1, move sleeptalk");
  });
});
