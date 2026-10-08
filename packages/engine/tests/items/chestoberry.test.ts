import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Chesto Berry", () => {
  it("cures sleep immediately and is consumed", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "chestoberry", moves: ["rest", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move rest, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
