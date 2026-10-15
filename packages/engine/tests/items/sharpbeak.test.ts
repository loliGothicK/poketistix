import { describe, expect, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Sharpbeak", () => {
  it("boosts matching type attack", () => {
    // 1. With Sharp Beak (Flying-type move bravebird boosted by 1.2x)
    const envItem = new TestEnvironment(
      [
        pokemon({ species: "pidgeot", item: "sharpbeak", moves: ["bravebird"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bravebird", "sleeptalk"],
        engineConfig: { damage_roll: "max", crits: "never" },
      },
    );
    const { engineState: stateItem } = envItem.executeAndAssert(
      "move bravebird 1, move sleeptalk",
      "move sleeptalk, move sleeptalk",
    );
    const damageWithItem = stateItem.p2.active[0].maxhp - stateItem.p2.active[0].hp;

    // 2. Without item (baseline damage)
    const envNoItem = new TestEnvironment(
      [
        pokemon({ species: "pidgeot", moves: ["bravebird"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["bravebird", "sleeptalk"],
        engineConfig: { damage_roll: "max", crits: "never" },
      },
    );
    const { engineState: stateNoItem } = envNoItem.executeAndAssert(
      "move bravebird 1, move sleeptalk",
      "move sleeptalk, move sleeptalk",
    );
    const damageWithoutItem = stateNoItem.p2.active[0].maxhp - stateNoItem.p2.active[0].hp;

    // Verify Sharp Beak boosted Brave Bird damage
    expect(damageWithItem).toBeGreaterThan(damageWithoutItem);
  });
});
