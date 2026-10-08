import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Nevermeltice", () => {
  it("boosts matching type attack", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "abomasnow", item: "nevermeltice", moves: ["icebeam", "sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move icebeam 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
