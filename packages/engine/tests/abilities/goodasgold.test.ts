import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Good as Gold", () => {
  it("provides immunity to status moves from other Pokémon", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "gholdengo",
          ability: "goodasgold",
          moves: ["makeitrain", "protect"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "whimsicott",
          ability: "prankster",
          moves: ["taunt", "protect"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["makeitrain", "taunt", "protect"],
      },
    );

    // Turn 1: Whimsicott uses Taunt on Gholdengo -> Immune due to Good as Gold
    env.executeAndAssert("move makeitrain, move protect", "move taunt 1, move protect");
  });
});
