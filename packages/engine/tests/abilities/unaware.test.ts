import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Unaware", () => {
  it("ignores foe's offensive stat boosts when taking damage", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "raichu",
          ability: "lightningrod",
          moves: ["nastyplot", "thunderbolt", "sleeptalk"],
        }),
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "clefable", ability: "unaware", moves: ["sleeptalk"] }),
        pokemon({ species: "blastoise", ability: "torrent", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["nastyplot", { id: "thunderbolt", accuracy: true }, "sleeptalk"],
      },
    );

    // Turn 1: Raichu boosts Sp. Atk with Nasty Plot (+2)
    env.executeAndAssert("move nastyplot, move sleeptalk", "move sleeptalk, move sleeptalk");

    // Turn 2: Raichu uses Thunderbolt on Clefable; Clefable's Unaware ignores Raichu's +2 Sp. Atk
    env.executeAndAssert("move thunderbolt 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
