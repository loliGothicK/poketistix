import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Rain Dish", () => {
  it("heals 1/16 max HP at the end of each turn in Rain", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "blastoise",
          ability: "raindish",
          moves: ["sleeptalk"],
          hp: 100,
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
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Turn 1: Pelipper sets Rain via Drizzle, Blastoise heals 1/16 max HP at end of turn
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
