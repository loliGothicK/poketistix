import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Curious Medicine", () => {
  it("clears ally's stat boosts on switch-in", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "charizard", ability: "blaze", moves: ["swordsdance", "sleeptalk"] }),
        pokemon({ species: "pikachu", ability: "static", moves: ["sleeptalk"] }),
        pokemon({ species: "galarian-slowking", ability: "curiousmedicine", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        padTeam: false,
      },
    );

    // Turn 1: Charizard uses Swords Dance to gain +2 Atk
    env.executeAndAssert("move swordsdance, move sleeptalk", "move sleeptalk, move sleeptalk");

    // Turn 2: Pikachu switches to Galarian Slowking -> Curious Medicine clears Charizard's +2 Atk
    env.executeAndAssert("move sleeptalk, switch 3", "move sleeptalk, move sleeptalk");
  });
});
