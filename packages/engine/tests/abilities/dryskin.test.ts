import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Dry Skin", () => {
  it("absorbs Water attacks and heals HP", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "blastoise", ability: "torrent", moves: ["waterpulse", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "toxicroak", ability: "dryskin", moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["waterpulse", "sleeptalk"],
      },
    );

    // Blastoise uses Water Pulse on Toxicroak (p2a)
    // Dry Skin absorbs Water Pulse and is immune
    env.executeAndAssert("move waterpulse 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
