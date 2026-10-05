import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Scrappy", () => {
  it("allows Normal and Fighting moves to hit Ghost-type Pokemon", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "lopunny-mega",
          ability: "scrappy",
          moves: ["closecombat", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["closecombat", "sleeptalk"],
      },
    );

    // Turn 1: Mega Lopunny hits Ghost-type Gengar with Fighting move Close Combat
    env.executeAndAssert("move closecombat 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
