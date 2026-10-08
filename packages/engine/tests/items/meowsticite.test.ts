import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Meowsticite", () => {
  it("allows Meowstic Female to hold its mega stone in battle", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "meowstic-female", item: "meowsticite", moves: ["sleeptalk"] }),
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
