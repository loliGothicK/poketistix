import { describe, expect, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Blackglasses", () => {
  it("boosts matching type attack", () => {
    // 1. With Black Glasses (Dark-type move crunch boosted by 1.2x)
    const envItem = new TestEnvironment(
      [
        pokemon({ species: "tyranitar", item: "blackglasses", moves: ["crunch"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["crunch", "sleeptalk"],
        engineConfig: { damage_roll: "max", crits: "never" },
      },
    );
    const { engineState: stateItem } = envItem.executeAndAssert(
      "move crunch 1, move sleeptalk",
      "move sleeptalk, move sleeptalk",
    );
    const damageWithItem = stateItem.p2.active[0].maxhp - stateItem.p2.active[0].hp;

    // 2. Without item (baseline damage)
    const envNoItem = new TestEnvironment(
      [
        pokemon({ species: "tyranitar", moves: ["crunch"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["crunch", "sleeptalk"],
        engineConfig: { damage_roll: "max", crits: "never" },
      },
    );
    const { engineState: stateNoItem } = envNoItem.executeAndAssert(
      "move crunch 1, move sleeptalk",
      "move sleeptalk, move sleeptalk",
    );
    const damageWithoutItem = stateNoItem.p2.active[0].maxhp - stateNoItem.p2.active[0].hp;

    // Verify Black Glasses boosted crunch damage by 1.2x
    expect(damageWithItem).toBeGreaterThan(damageWithoutItem);
  });
});
