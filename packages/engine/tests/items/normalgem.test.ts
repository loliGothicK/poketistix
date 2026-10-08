import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Normal Gem", () => {
  it("boosts Normal-type move and is consumed", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "normalgem", moves: ["bodyslam", "sleeptalk"] }),
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "bodyslam", damage_roll: "max" }, "sleeptalk"],
      },
    );

    env.executeAndAssert("move bodyslam 1, move sleeptalk", "move sleeptalk, move sleeptalk", {
      secondary: "never",
      crits: "never",
    });
  });
});
