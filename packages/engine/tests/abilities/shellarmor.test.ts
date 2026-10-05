import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Shell Armor", () => {
  it("prevents critical hits", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "torkoal",
          ability: "shellarmor",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gallade", ability: "sharpness", moves: ["psychocut", "sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["psychocut", "sleeptalk"],
      },
    );

    // Turn 1: Psycho Cut cannot crit against Shell Armor
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move psychocut 1, move sleeptalk");
  });
});
