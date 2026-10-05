import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Protean", () => {
  it("changes the user's type to the type of the move it uses", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "meowscarada",
          ability: "protean",
          moves: ["taunt", "sleeptalk"],
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
        deterministicMoves: ["taunt", "sleeptalk"],
      },
    );

    // Meowscarada uses Taunt (Dark); Protean changes Meowscarada's type to Dark
    env.executeAndAssert("move taunt 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
