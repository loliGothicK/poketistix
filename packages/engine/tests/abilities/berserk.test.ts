import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Berserk", () => {
  it("raises Special Attack by 1 when HP falls below 50%", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "falinks",
          ability: "battlearmor",
          moves: ["closecombat", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "drampa", ability: "berserk", moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["closecombat", "sleeptalk"],
      },
    );

    // Falinks uses Close Combat on Drampa (p2a)
    // Drampa's HP drops below 50% and Berserk raises Special Attack by 1
    env.executeAndAssert("move closecombat 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
