import { describe, expect, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Sablenite", () => {
  it("allows Sableye to Mega Evolve in battle", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "sableye", item: "sablenite", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
      ],
    );

    const { engineState } = env.executeAndAssert(
      "move sleeptalk mega, move sleeptalk",
      "move sleeptalk, move sleeptalk",
    );

    const p1a = engineState.p1.active[0];
    expect(p1a.is_mega).toBe(true);
    expect(p1a.species).toBe("sableye-mega");
    expect(engineState.p1.mega_used).toBe(true);
  });
});
