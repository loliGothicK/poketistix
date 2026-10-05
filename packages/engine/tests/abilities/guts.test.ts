import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Guts", () => {
  it("boosts Attack by 1.5x when having a status condition and ignores burn attack drop", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "conkeldurr",
          ability: "guts",
          moves: ["machpunch", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "gengar",
          ability: "cursedbody",
          moves: ["willowisp", "sleeptalk"],
        }),
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
      ],
      {
        deterministicMoves: ["machpunch", "willowisp", "sleeptalk"],
      },
    );

    // Turn 1: Gengar burns Conkeldurr with Will-O-Wisp
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move willowisp 1, move sleeptalk");

    // Turn 2: Burned Conkeldurr uses Mach Punch with Guts (1.5x Attack boost) on Snorlax (p2b)
    env.executeAndAssert("move machpunch 2, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
