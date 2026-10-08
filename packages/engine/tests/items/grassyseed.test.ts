import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Grassyseed", () => {
  it("activates on matching terrain and boosts stat", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "grassyseed", moves: ["sleeptalk"] }),
        pokemon({ species: "rillaboom", ability: "grassysurge", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
