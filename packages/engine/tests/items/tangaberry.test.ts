import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Tangaberry", () => {
  it("weakens supereffective attack and consumes berry", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "alakazam", item: "tangaberry", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "scizor", moves: ["xscissor", "sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move xscissor 1, move sleeptalk");
  });
});
