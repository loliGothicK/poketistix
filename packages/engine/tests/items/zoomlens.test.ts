import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Zoom Lens", () => {
  it("boosts move accuracy by 1.2x when moving after the target", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "snorlax",
          item: "zoomlens",
          moves: ["bodyslam", "sleeptalk"],
        }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "pikachu",
          ability: "lightningrod",
          moves: ["quickattack", "sleeptalk"],
        }),
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
      ],
    );

    // Pikachu moves first with Quick Attack.
    // Snorlax moves after Pikachu, gaining Zoom Lens's accuracy boost.
    env.executeAndAssert("move bodyslam 1, move sleeptalk", "move quickattack 1, move sleeptalk", {
      secondary: "never",
    });
  });
});
