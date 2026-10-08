import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Mysticwater", () => {
  it("boosts matching type attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "blastoise", item: "mysticwater", moves: ["waterpulse", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "waterpulse", damage_roll: "max" }, "sleeptalk"],
      },
    );

    env.executeAndAssert("move waterpulse 1, move sleeptalk", "move sleeptalk, move sleeptalk", {
      crits: "never",
      secondary: "never",
    });
  });
});
