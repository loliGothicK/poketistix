import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Chilanberry", () => {
  it("weakens supereffective attack and consumes berry", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "chilanberry", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "kangaskhan", moves: ["bodyslam", "sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "bodyslam", damage_roll: "max" }, "sleeptalk"],
      },
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodyslam 1, move sleeptalk", {
      crits: "never",
      secondary: "never",
    });
  });
});
