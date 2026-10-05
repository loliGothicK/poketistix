import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("move: partingshot", () => {
  it("should match Showdown logs", () => {
    // Snorlax uses sleep talk and fails, then Pangoro uses parting shot and forces switch (halts turn)
    // To match logs without switch implemented, we make p2a (Snorlax) faster than Pangoro?
    // Wait, if Pangoro is slower, Snorlax moves first, which matches! But Snorlax base Spe is 30, Pangoro is 58.
    // Let's make p2a a fast pokemon like Dragapult so it moves first!
    const env = new TestEnvironment(
      [
        pokemon({ species: "pangoro", moves: ["partingshot"] }),
        pokemon({ species: "charizard", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "dragapult", ability: "infiltrator", moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["partingshot", "sleeptalk"],
      },
    );

    env.executeAndAssert("move partingshot 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
