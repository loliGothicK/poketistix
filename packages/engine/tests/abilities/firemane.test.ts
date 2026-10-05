import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Fire Mane", () => {
  it("boosts Attack and Special Attack by 1.5x", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "pyroar-mega",
          ability: "firemane",
          moves: ["flamethrower", "protect"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "immunity",
          moves: ["protect"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "protect"],
      },
    );

    // Pyroar-Mega uses Flamethrower on Snorlax (p2a) with Fire Mane (1.5x boost)
    env.executeAndAssert("move flamethrower 1, move protect", "move protect, move protect");
  });
});
