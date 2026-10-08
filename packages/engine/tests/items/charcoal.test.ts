import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Charcoal", () => {
  it("boosts matching type attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "torkoal", item: "charcoal", moves: ["flamethrower", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move flamethrower 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
