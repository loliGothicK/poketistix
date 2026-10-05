import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Surge Surfer", () => {
  it("doubles Speed on Electric Terrain", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "alolan-raichu",
          ability: "surgesurfer",
          moves: ["thunderbolt", "sleeptalk"],
        }),
        pokemon({
          species: "pincurchin",
          ability: "electricsurge",
          moves: ["sleeptalk"],
        }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["thunderbolt", "sleeptalk"],
      },
    );

    // Turn 1: Hadron Engine sets Electric Terrain; Alolan Raichu outspeeds and attacks first
    env.executeAndAssert("move thunderbolt 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
