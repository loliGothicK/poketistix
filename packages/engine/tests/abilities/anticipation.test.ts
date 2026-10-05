import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Anticipation", () => {
  it("triggers on start if an opposing Pokémon knows a super-effective move", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "toxicroak", ability: "anticipation", moves: ["poisonjab", "protect"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({ species: "alakazam", ability: "innerfocus", moves: ["psychic", "protect"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["poisonjab", "psychic", "protect"],
      },
    );

    env.executeAndAssert("move poisonjab 1, move protect", "move psychic 1, move protect");
  });
});
