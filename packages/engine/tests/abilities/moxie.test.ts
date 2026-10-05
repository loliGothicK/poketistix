import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Moxie", () => {
  it("boosts Attack by 1 stage upon knocking out an opposing Pokémon", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "gyarados",
          ability: "moxie",
          moves: ["waterfall", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          hp: 1,
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["waterfall", "sleeptalk"],
      },
    );

    // Turn 1: Gyarados uses Waterfall on Snorlax (1 HP), knocking it out; Moxie triggers and boosts Attack
    env.executeAndAssert("move waterfall 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
