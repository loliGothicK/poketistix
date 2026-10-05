import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Vital Spirit", () => {
  it("prevents the Pokémon from falling asleep", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "annihilape",
          ability: "vitalspirit",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "gengar",
          ability: "cursedbody",
          moves: ["hypnosis", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "hypnosis", accuracy: true }, "sleeptalk"],
      },
    );

    // Turn 1: Gengar uses Hypnosis on Annihilape; Vital Spirit prevents sleep
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move hypnosis 1, move sleeptalk");
  });
});
