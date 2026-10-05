import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Battle Armor", () => {
  it("prevents critical hits from attacks that always crit", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "glaceon", ability: "snowcloak", moves: ["frostbreath", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "falinks", ability: "battlearmor", moves: ["sleeptalk"] }),
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["frostbreath", "sleeptalk"],
      },
    );

    // Glaceon uses Frost Breath on Falinks (p2a)
    // Battle Armor prevents Frost Breath from being a critical hit
    env.executeAndAssert("move frostbreath 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
