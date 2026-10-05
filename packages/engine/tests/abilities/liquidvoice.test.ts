import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Liquid Voice", () => {
  it("converts sound-based moves into Water-type moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "primarina",
          ability: "liquidvoice",
          moves: ["hypervoice", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "arcanine",
          ability: "intimidate",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["hypervoice", "sleeptalk"],
      },
    );

    // Turn 1: Primarina uses Hyper Voice; Liquid Voice converts it to Water-type, dealing super-effective damage to Arcanine
    env.executeAndAssert("move hypervoice, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
