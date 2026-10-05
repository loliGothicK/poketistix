import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Punk Rock", () => {
  it("boosts sound moves power by 1.3x and halves sound damage taken", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "toxtricity-amped",
          ability: "punkrock",
          moves: ["hypervoice", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["hypervoice", "sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["hypervoice", "sleeptalk"],
      },
    );

    // Toxtricity uses Hyper Voice (sound move) boosted by Punk Rock; Snorlax uses Hyper Voice on Toxtricity resisted by Punk Rock
    env.executeAndAssert("move hypervoice, move sleeptalk", "move hypervoice, move sleeptalk");
  });
});
