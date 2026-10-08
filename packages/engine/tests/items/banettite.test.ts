import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Banettite", () => {
  it("allows Banette to hold its mega stone in battle", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "banette", item: "banettite", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
