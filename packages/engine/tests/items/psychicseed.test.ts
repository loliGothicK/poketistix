import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Psychicseed", () => {
  it("activates on matching terrain and boosts stat", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "psychicseed", moves: ["sleeptalk"] }),
        pokemon({ species: "indeedee-female", ability: "psychicsurge", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
