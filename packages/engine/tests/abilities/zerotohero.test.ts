import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Zero to Hero", () => {
  it("allows Palafin-Zero to take actions normally", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "palafin-zero",
          ability: "zerotohero",
          moves: ["jetpunch", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["jetpunch", "sleeptalk"],
      },
    );

    // Turn 1: Palafin-Zero attacks with Jet Punch
    env.executeAndAssert("move jetpunch 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
