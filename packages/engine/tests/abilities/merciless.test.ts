import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Merciless", () => {
  it("lands a guaranteed critical hit against poisoned targets", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "toxapex",
          ability: "merciless",
          moves: ["toxic", "venoshock", "sleeptalk"],
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
        deterministicMoves: ["toxic", "venoshock", "sleeptalk"],
      },
    );

    // Turn 1: Toxapex poisons Snorlax with Toxic
    env.executeAndAssert("move toxic 1, move sleeptalk", "move sleeptalk, move sleeptalk");

    // Turn 2: Toxapex hits poisoned Snorlax with Venoshock; Merciless guarantees a critical hit
    env.executeAndAssert("move venoshock 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
