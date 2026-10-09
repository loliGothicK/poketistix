import { test } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Move: Future Sight", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "clefable", moves: ["futuresight", "sleeptalk"] }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "tauros", moves: ["sleeptalk"] }),
      pokemon({ species: "clefable", moves: ["sleeptalk"] }),
    ],
  );
  // Turn 1: Future Sight used
  env.executeAndAssert("move futuresight 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  // Turn 2: Pending
  env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  // Turn 3: Future Sight hits at end of turn (Step 4)
  env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
});
