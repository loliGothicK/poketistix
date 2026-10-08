import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Electricseed", () => {
  it("activates on matching terrain and boosts stat", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "electricseed", moves: ["sleeptalk"] }),
        pokemon({ species: "pincurchin", ability: "electricsurge", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
