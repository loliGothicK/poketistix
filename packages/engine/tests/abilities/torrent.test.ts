import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Torrent", () => {
  it("powers up Water-type moves by 1.5x when HP is at 1/3 or below", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "blastoise",
          ability: "torrent",
          moves: ["waterpulse", "sleeptalk"],
          hp: 40,
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["waterpulse", "sleeptalk"],
      },
    );

    // Turn 1: Blastoise at low HP uses Water Pulse with Torrent boost
    env.executeAndAssert("move waterpulse 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
