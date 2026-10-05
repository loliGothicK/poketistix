import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Early Bird", () => {
  it("wakes up twice as fast from sleep", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "houndoom",
          ability: "earlybird",
          hp: 100,
          moves: ["rest", "flamethrower", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["rest", "flamethrower", "sleeptalk"],
      },
    );

    // Turn 1: Houndoom uses Rest (falls asleep for 3 turns)
    env.executeAndAssert("move rest, move sleeptalk", "move sleeptalk, move sleeptalk");

    // Turn 2: Houndoom is asleep, sleep counter drops by 2 (from 3 to 1) with Early Bird
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");

    // Turn 3: Houndoom wakes up (counter drops from 1 to <= 0) and uses Flamethrower successfully
    env.executeAndAssert("move flamethrower 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
