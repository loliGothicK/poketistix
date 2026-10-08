import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Rawst Berry", () => {
  it("cures burn and is consumed", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "clefable", item: "rawstberry", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["willowisp", "sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move willowisp 1, move sleeptalk");
  });
});
