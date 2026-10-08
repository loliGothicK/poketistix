import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Chartiberry", () => {
  it("weakens supereffective attack and consumes berry", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "charizard", item: "chartiberry", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "machamp", moves: ["stoneedge", "sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "stoneedge", damage_roll: "max" }, "sleeptalk"],
      },
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move stoneedge 1, move sleeptalk", {
      crits: "never",
      accuracy: "always",
    });
  });
});
