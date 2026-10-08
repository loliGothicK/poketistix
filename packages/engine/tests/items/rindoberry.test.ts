import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Rindoberry", () => {
  it("weakens supereffective attack and consumes berry", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "swampert", item: "rindoberry", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "venusaur", moves: ["energyball", "sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move energyball 1, move sleeptalk");
  });
});
