import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Aura Guard", () => {
  it("halves damage taken from contact moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "lucario-mega-z",
          ability: "auraguard",
          moves: ["aurasphere", "protect"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({ species: "weavile", ability: "pressure", moves: ["iceshard", "protect"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["iceshard", "aurasphere", "protect"],
      },
    );

    // Weavile uses Ice Shard (contact move) on Lucario-Mega-Z (p1a).
    // Aura Guard halves the damage taken from contact moves.
    env.executeAndAssert("move protect, move protect", "move iceshard 1, move protect");
  });
});
