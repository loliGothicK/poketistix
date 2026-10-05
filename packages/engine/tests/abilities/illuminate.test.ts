import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Illuminate", () => {
  it("prevents other Pokémon from lowering its accuracy", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "starmie",
          ability: "illuminate",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["mudslap", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["mudslap", "sleeptalk", "protect"],
      },
    );

    // Turn 1: Snorlax uses Mud-Slap on Starmie; Starmie's Illuminate blocks the accuracy drop
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move mudslap 1, move sleeptalk");
  });
});
