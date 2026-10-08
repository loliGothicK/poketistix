import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Pecha Berry", () => {
  it("cures poison and is consumed", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "clefable", item: "pechaberry", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["toxic", "sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move toxic 1, move sleeptalk");
  });
});
