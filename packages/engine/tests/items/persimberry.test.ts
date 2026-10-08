import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Persim Berry", () => {
  it("cures confusion and is consumed", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "clefable", item: "persimberry", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["confuseray", "sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move confuseray 1, move sleeptalk");
  });
});
