import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Analytic", () => {
  it("boosts move power by 1.3x when moving last in the turn", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "starmie", ability: "analytic", moves: ["surf", "protect"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["protect"] }),
      ],
      [
        pokemon({ species: "weavile", ability: "pressure", moves: ["iceshard", "protect"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["surf", "iceshard", "protect"],
      },
    );

    // Weavile uses Ice Shard (priority +1) or is faster, moving before Starmie.
    // Starmie uses Surf moving after Weavile, triggering Analytic boost.
    env.executeAndAssert("move surf, move protect", "move iceshard 1, move protect");
  });
});
