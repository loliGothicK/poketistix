import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Overcoat", () => {
  it("blocks powder moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "kommo-o",
          ability: "overcoat",
          moves: ["closecombat", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "venusaur",
          ability: "chlorophyll",
          moves: ["sleeppowder", "sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sleeppowder", "sleeptalk", "closecombat"],
      },
    );

    // Venusaur uses Sleep Powder on Kommo-o; Overcoat makes Kommo-o immune
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sleeppowder 1, move sleeptalk");
  });
});
