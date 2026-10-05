import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Gooey", () => {
  it("lowers attacker's Speed by 1 stage on contact moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "goodra",
          ability: "gooey",
          moves: ["protect", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["bodyslam", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bodyslam", "sleeptalk", "protect"],
      },
    );

    // Turn 1: Snorlax uses Body Slam (contact) on Goodra (p1a) -> Gooey lowers Snorlax's Speed by 1 stage
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodyslam 1, move sleeptalk");
  });
});
