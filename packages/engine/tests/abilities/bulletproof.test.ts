import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Bulletproof", () => {
  it("grants immunity to bullet and ball moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["shadowball", "protect"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "chesnaught",
          ability: "bulletproof",
          moves: ["woodhammer", "protect"],
        }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["shadowball", "woodhammer", "protect"],
      },
    );

    // Gengar uses Shadow Ball on Chesnaught (p2a)
    // Bulletproof makes Chesnaught immune to ball moves
    env.executeAndAssert("move shadowball 1, move protect", "move protect, move protect");
  });
});
