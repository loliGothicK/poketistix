import { test } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";
test("Move: Fickle Beam", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "hydrapple", ability: "regenerator", moves: ["ficklebeam"] }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      pokemon({ species: "tauros", moves: ["sleeptalk"] }),
    ],
    {
      deterministicMoves: [{ id: "ficklebeam", basePower: 80 }, "sleeptalk"],
    },
  );
  env.executeAndAssert("move ficklebeam 1, move sleeptalk", "move sleeptalk, move sleeptalk");
});
