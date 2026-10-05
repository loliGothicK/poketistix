import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Cud Chew", () => {
  it("reuses an eaten berry at the end of the next turn", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "farigiraf",
          ability: "cudchew",
          item: "sitrus-berry",
          hp: 100,
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["bodyslam", "sleeptalk"] }),
        pokemon({ species: "pikachu", ability: "static", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bodyslam", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax attacks Farigiraf -> Farigiraf drops below 50% HP -> eats Sitrus Berry
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move bodyslam 1, move sleeptalk");

    // Turn 2: Both use sleeptalk -> Cud Chew activates at end of turn and eats Sitrus Berry again
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
