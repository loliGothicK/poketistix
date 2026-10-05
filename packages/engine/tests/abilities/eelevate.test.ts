import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Eelevate", () => {
  it("provides immunity to Ground-type attacks", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "eelektross-mega",
          ability: "eelevate",
          moves: ["discharge", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "immunity",
          moves: ["highhorsepower", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["highhorsepower", "sleeptalk", "discharge"],
      },
    );

    // Turn 1: Snorlax uses High Horsepower on Eelektross -> Immune due to Eelevate
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move highhorsepower 1, move sleeptalk");
  });
});
