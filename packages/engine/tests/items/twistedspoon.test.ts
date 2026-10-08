import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Twistedspoon", () => {
  it("boosts matching type attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "alakazam", item: "twistedspoon", moves: ["psychic", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move psychic 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
