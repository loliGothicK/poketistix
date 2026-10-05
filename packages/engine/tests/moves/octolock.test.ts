import { test } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Move: octolock traps target and lowers Def/SpD at end of turn", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "grapploct", ability: "limber", moves: ["octolock"] }),
      pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
      pokemon({ species: "venusaur", ability: "overgrow", moves: ["sleeptalk"] }),
    ],
    {
      deterministicMoves: ["octolock", "sleeptalk"],
    },
  );

  // Grapploct uses Octolock on Snorlax
  env.executeAndAssert("move octolock 1, move sleeptalk", "move sleeptalk, move sleeptalk");
});
