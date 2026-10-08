import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Softsand", () => {
  it("boosts matching type attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "garchomp", item: "softsand", moves: ["stompingtantrum", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "stompingtantrum", damage_roll: "max" }, "sleeptalk"],
      },
    );

    env.executeAndAssert(
      "move stompingtantrum 1, move sleeptalk",
      "move sleeptalk, move sleeptalk",
      {
        crits: "never",
      },
    );
  });
});
