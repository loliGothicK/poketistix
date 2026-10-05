import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Infiltrator", () => {
  it("bypasses the opponent's Reflect barrier", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "dragapult",
          ability: "infiltrator",
          moves: ["dragondarts", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({
          species: "umbreon",
          ability: "synchronize",
          moves: ["reflect", "sleeptalk"],
        }),
      ],
      {
        deterministicMoves: ["dragondarts", "reflect", "sleeptalk"],
      },
    );

    // Turn 1: Umbreon sets up Reflect
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move reflect");

    // Turn 2: Dragapult uses Dragon Darts, bypassing Reflect damage reduction
    env.executeAndAssert("move dragondarts 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
