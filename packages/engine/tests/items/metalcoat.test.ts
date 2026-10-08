import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Metalcoat", () => {
  it("boosts matching type attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "scizor", item: "metalcoat", moves: ["ironhead", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move ironhead 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
