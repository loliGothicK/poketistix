import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Chlorophyll", () => {
  it("doubles Speed in harsh sunlight", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "torkoal", ability: "drought", moves: ["protect"] }),
        pokemon({ species: "venusaur", ability: "chlorophyll", moves: ["sludgebomb", "protect"] }),
      ],
      [
        pokemon({ species: "weavile", ability: "pressure", moves: ["nightslash", "protect"] }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["sludgebomb", "nightslash", "protect"],
      },
    );

    // In sun from Torkoal's Drought, Venusaur's Speed is doubled by Chlorophyll, outspeeding Weavile.
    // Venusaur moves before Weavile with Sludge Bomb.
    env.executeAndAssert("move protect, move sludgebomb 1", "move nightslash 2, move protect");
  });
});
