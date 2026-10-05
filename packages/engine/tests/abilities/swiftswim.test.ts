import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Swift Swim", () => {
  it("doubles Speed in Rain", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "beartic",
          ability: "swiftswim",
          moves: ["liquidation", "sleeptalk"],
        }),
        pokemon({
          species: "pelipper",
          ability: "drizzle",
          moves: ["sleeptalk"],
        }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["liquidation", "sleeptalk"],
      },
    );

    // Turn 1: Pelipper sets Rain; Beartic moves first due to doubled Speed from Swift Swim
    env.executeAndAssert("move liquidation 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
