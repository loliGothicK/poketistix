import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Hardstone", () => {
  it("boosts matching type attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "machamp", item: "hardstone", moves: ["stoneedge", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "stoneedge", damage_roll: "max" }, "sleeptalk"],
      },
    );

    env.executeAndAssert("move stoneedge 1, move sleeptalk", "move sleeptalk, move sleeptalk", {
      crits: "never",
      accuracy: "always",
    });
  });
});
