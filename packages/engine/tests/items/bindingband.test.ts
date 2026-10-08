import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Binding Band", () => {
  it("increases residual damage of partial trapping moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "charizard", item: "bindingband", moves: ["firespin", "sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move firespin 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
