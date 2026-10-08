import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Cheri Berry", () => {
  it("cures paralysis and is consumed", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "clefable", item: "cheriberry", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "pikachu", moves: ["thunderwave", "sleeptalk"] }),
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move thunderwave 1, move sleeptalk", {
      accuracy: "always",
    });
  });
});
