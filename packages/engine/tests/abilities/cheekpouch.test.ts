import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Cheek Pouch", () => {
  it("restores additional HP upon consuming a berry", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "charizard", ability: "blaze", moves: ["flamethrower", "protect"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "diggersby",
          ability: "cheekpouch",
          item: "sitrusberry",
          moves: ["protect"],
        }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "protect"],
      },
    );

    // Charizard uses Flamethrower on Diggersby (p2a)
    // Diggersby takes damage, eats Sitrus Berry, and Cheek Pouch heals an extra 1/3 max HP
    env.executeAndAssert("move flamethrower 1, move protect", "move protect, move protect");
  });
});
