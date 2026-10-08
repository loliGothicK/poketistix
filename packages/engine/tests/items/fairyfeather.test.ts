import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Fairyfeather", () => {
  it("boosts matching type attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "clefable", item: "fairyfeather", moves: ["moonblast", "sleeptalk"] }),
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "moonblast", damage_roll: "max" }, "sleeptalk"],
      },
    );

    env.executeAndAssert("move moonblast 1, move sleeptalk", "move sleeptalk, move sleeptalk", {
      crits: "never",
      secondary: "never",
    });
  });
});
