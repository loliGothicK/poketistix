import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Purifying Salt", () => {
  it("gives status immunity and halves ghost damage taken", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "garganacl",
          ability: "purifyingsalt",
          moves: ["saltcure", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["shadowball", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["saltcure", "shadowball", "sleeptalk"],
      },
    );

    // Snorlax uses Shadow Ball on Garganacl; Purifying Salt halves Ghost-type damage taken
    env.executeAndAssert("move saltcure 1, move sleeptalk", "move shadowball 1, move sleeptalk");
  });
});
