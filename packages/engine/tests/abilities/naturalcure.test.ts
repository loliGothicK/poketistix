import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Natural Cure", () => {
  it("cures status condition when switching out", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "starmie",
          ability: "naturalcure",
          moves: ["waterfall", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "umbreon",
          ability: "synchronize",
          moves: ["toxic", "sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["toxic", "sleeptalk", "waterfall"],
      },
    );

    // Turn 1: Umbreon poisons Starmie with Toxic
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move toxic 1, move sleeptalk");

    // Turn 2: Starmie switches out for Snorlax (Natural Cure cures poison on switch-out)
    env.executeAndAssert("switch 3, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
