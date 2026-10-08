import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Misty Seed", () => {
  it("activates on Misty Terrain and boosts Special Defense", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "mistyseed", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["mistyterrain", "sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move mistyterrain", "move sleeptalk, move sleeptalk");
  });
});
