import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Solid Rock", () => {
  it("reduces damage taken from super-effective attacks by 25%", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "rhyperior",
          ability: "solidrock",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "gallade",
          ability: "sharpness",
          moves: ["sacredsword", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sacredsword", "sleeptalk"],
      },
    );

    // Turn 1: Gallade hits Rhyperior with super-effective Sacred Sword, damage is reduced by 0.75x
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move sacredsword 1, move sleeptalk");
  });
});
