import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Disguise", () => {
  it("protects Mimikyu from the first damaging hit and deals 1/8 max HP damage", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "mimikyu-disguised", ability: "disguise", moves: ["sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["shadowball", "sleeptalk"] }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["shadowball", "sleeptalk"],
      },
    );

    // Turn 1: Snorlax uses Shadow Ball on Mimikyu -> Disguise breaks (0 damage from attack, takes 1/8 HP bust recoil)
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move shadowball 1, move sleeptalk");

    // Turn 2: Snorlax uses Shadow Ball again -> Disguise is already busted, takes normal damage
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move shadowball 1, move sleeptalk");
  });
});
