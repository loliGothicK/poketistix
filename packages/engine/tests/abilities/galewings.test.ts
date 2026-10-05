import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Gale Wings", () => {
  it("gives +1 priority to Flying-type moves when at full HP", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "talonflame",
          ability: "galewings",
          moves: ["bravebird", "protect"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({
          species: "dragapult",
          ability: "infiltrator",
          moves: ["shadowball", "protect"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["bravebird", "shadowball", "protect"],
      },
    );

    // Turn 1: Talonflame is at full HP, so Brave Bird gets +1 priority and executes before faster Dragapult
    env.executeAndAssert("move bravebird 1, move protect", "move shadowball 1, move protect");
  });
});
