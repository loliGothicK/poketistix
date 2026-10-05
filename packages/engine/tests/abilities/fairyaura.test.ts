import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Fairy Aura", () => {
  it("boosts the power of Fairy-type moves for all Pokémon on the battlefield", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "floette-mega",
          ability: "fairyaura",
          moves: ["dazzlinggleam", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "immunity",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["dazzlinggleam", "sleeptalk"],
      },
    );

    // Turn 1: Floette-Mega uses Dazzling Gleam (Fairy move, boosted by 1.33x Fairy Aura)
    env.executeAndAssert("move dazzlinggleam, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
