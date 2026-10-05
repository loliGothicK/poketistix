import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Aroma Veil", () => {
  it("protects user and ally from taunt", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "aromatisse", ability: "aromaveil", moves: ["moonblast", "protect"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["flamethrower", "protect"] }),
      ],
      [
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["taunt", "protect"] }),
        pokemon({ species: "weavile", ability: "pressure", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["taunt", "moonblast", "flamethrower", "protect"],
      },
    );

    // Gengar attempts Taunt on Charizard (p1b).
    // Aroma Veil on Aromatisse protects Charizard and blocks the Taunt.
    env.executeAndAssert("move protect, move protect", "move taunt 2, move protect");
  });
});
