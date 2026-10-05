import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Libero", () => {
  it("changes the user's type to the type of the move it uses", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "cinderace",
          ability: "libero",
          moves: ["shadowball", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["shadowball", "sleeptalk"],
      },
    );

    // Turn 1: Cinderace uses Shadow Ball; Libero changes Cinderace's type to Ghost
    env.executeAndAssert("move shadowball 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
