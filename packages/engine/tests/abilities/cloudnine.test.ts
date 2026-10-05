import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Cloud Nine", () => {
  it("suppresses the effects of active weather", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "torkoal", ability: "drought", moves: ["protect"] }),
        pokemon({ species: "altaria", ability: "cloudnine", moves: ["protect"] }),
      ],
      [
        pokemon({ species: "charizard", ability: "blaze", moves: ["flamethrower", "protect"] }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "protect"],
      },
    );

    // Sun is active from Torkoal, but Altaria's Cloud Nine suppresses weather effects.
    // Charizard's Flamethrower on Snorlax does not get the 1.5x sun boost.
    env.executeAndAssert("move protect, move protect", "move flamethrower 1, move protect");
  });
});
