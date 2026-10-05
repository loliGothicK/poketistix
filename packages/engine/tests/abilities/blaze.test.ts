import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Blaze", () => {
  it("boosts Fire moves by 1.5x when HP is at or below 1/3 max HP", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "charizard",
          ability: "blaze",
          moves: ["flamethrower", "protect"],
          hp: 40,
        }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["protect"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["protect"] }),
        pokemon({ species: "pidgeot", ability: "bigpecks", moves: ["protect"] }),
      ],
      {
        deterministicMoves: ["flamethrower", "protect"],
      },
    );

    // Charizard at <= 1/3 HP uses Flamethrower on Snorlax (p2a)
    // Blaze triggers and boosts Flamethrower
    env.executeAndAssert("move flamethrower 1, move protect", "move protect, move protect");
  });
});
