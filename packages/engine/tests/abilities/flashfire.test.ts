import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Flash Fire", () => {
  it("absorbs Fire attacks and activates Flash Fire", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "charizard", ability: "blaze", moves: ["flamethrower", "sleeptalk"] }),
        pokemon({ species: "pikachu", ability: "static", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "arcanine",
          ability: "flashfire",
          moves: ["flamethrower", "sleeptalk"],
        }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "sleeptalk"],
      },
    );

    // Charizard uses Flamethrower on Arcanine (p2a)
    // Flash Fire absorbs Flamethrower and activates
    env.executeAndAssert("move flamethrower 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
