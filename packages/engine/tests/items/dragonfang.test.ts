import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Dragonfang", () => {
  it("boosts matching type attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "dragonite", item: "dragonfang", moves: ["dragonclaw", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move dragonclaw 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
