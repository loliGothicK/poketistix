import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Shucaberry", () => {
  it("weakens supereffective attack and consumes berry", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "pikachu", item: "shucaberry", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "garchomp", moves: ["stompingtantrum", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "stompingtantrum", damage_roll: "max" }, "sleeptalk"],
      },
    );

    env.executeAndAssert(
      "move sleeptalk, move sleeptalk",
      "move stompingtantrum 1, move sleeptalk",
      {
        crits: "never",
      },
    );
  });
});
