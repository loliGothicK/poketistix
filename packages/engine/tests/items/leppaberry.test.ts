import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Leppa Berry", () => {
  it("holder can hold Leppa Berry in battle", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "leppaberry", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
