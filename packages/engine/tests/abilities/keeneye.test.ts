import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Keen Eye", () => {
  it("prevents other Pokémon from lowering its accuracy", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "skarmory",
          ability: "keeneye",
          moves: ["sleeptalk"],
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
        deterministicMoves: ["mudslap", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax uses Mud-Slap on Skarmory; Keen Eye prevents accuracy loss
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move mudslap 1, move sleeptalk");
  });
});
