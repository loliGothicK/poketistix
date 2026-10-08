import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Leek", () => {
  it("boosts critical hit ratio for Sirfetch'd", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "sirfetchd", item: "leek", moves: ["leafblade", "sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "leafblade", damage_roll: "max" }, "sleeptalk"],
      },
    );

    env.executeAndAssert("move leafblade 1, move sleeptalk", "move sleeptalk, move sleeptalk", {
      crits: "always",
    });
  });
});
