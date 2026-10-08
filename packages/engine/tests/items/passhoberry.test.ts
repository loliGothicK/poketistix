import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Passhoberry", () => {
  it("weakens supereffective attack and consumes berry", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "flareon", item: "passhoberry", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "blastoise", moves: ["waterpulse", "sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "waterpulse", damage_roll: "max" }, "sleeptalk"],
      },
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move waterpulse 1, move sleeptalk", {
      crits: "never",
      secondary: "never",
    });
  });
});
