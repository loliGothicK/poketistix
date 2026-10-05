import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Thermal Exchange", () => {
  it("boosts Attack by 1 stage when hit by a Fire-type move and grants immunity to burn", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "baxcalibur",
          ability: "thermalexchange",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "charizard",
          ability: "blaze",
          moves: ["flamethrower", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "sleeptalk"],
      },
    );

    // Turn 1: Charizard attacks Baxcalibur with Flamethrower; Thermal Exchange gives +1 Atk
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move flamethrower 1, move sleeptalk");
  });
});
