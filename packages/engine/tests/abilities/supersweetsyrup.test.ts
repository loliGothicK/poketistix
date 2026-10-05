import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Supersweet Syrup", () => {
  it("lowers evasion of opposing pokemon by 1 stage on switch-in", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "hydrapple", ability: "supersweetsyrup", moves: ["sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "blastoise", ability: "torrent", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeptalk"],
      },
    );

    // Both opponents start with evasion -1 from Supersweet Syrup
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
