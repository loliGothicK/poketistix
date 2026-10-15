import { describe, expect, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Air Balloon", () => {
  it("pops when holder takes damage", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "airballoon", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["sludgebomb", "sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    const { engineState, simLog } = env.executeAndAssert(
      "move sleeptalk, move sleeptalk",
      "move sludgebomb 1, move sleeptalk",
    );

    // Snorlax took damage from Sludge Bomb
    expect(engineState.p1.active[0].hp).toBeLessThan(engineState.p1.active[0].maxhp);

    // Air Balloon popped and was removed
    expect(engineState.p1.active[0].item).toBeFalsy();

    // Verify pop message in battle logs
    expect(simLog.some((l) => l.includes("Air Balloon") || l.includes("-enditem"))).toBe(true);
  });
});
