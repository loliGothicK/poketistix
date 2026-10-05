import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Big Pecks", () => {
  it("prevents Defense drops from opponent moves and logs fail", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["screech", "protect"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({ species: "pidgeot", ability: "bigpecks", moves: ["protect"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["screech", "protect"],
      },
    );

    // Snorlax uses Screech on Pidgeot (p2a)
    // Big Pecks blocks the Defense drop and logs fail
    env.executeAndAssert("move screech 1, move protect", "move protect, move protect");
  });
});
