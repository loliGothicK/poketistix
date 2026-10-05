import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Reckless", () => {
  it("boosts recoil moves by 1.2x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "staraptor",
          ability: "reckless",
          moves: ["bravebird", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bravebird", "sleeptalk"],
      },
    );

    // Turn 1: Staraptor uses Brave Bird boosted by Reckless
    env.executeAndAssert("move bravebird 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
