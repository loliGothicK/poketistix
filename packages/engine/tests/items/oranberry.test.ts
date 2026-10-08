import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Oran Berry", () => {
  it("heals 10 HP when HP drops to half or below", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "oranberry", moves: ["bellydrum", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move bellydrum, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
