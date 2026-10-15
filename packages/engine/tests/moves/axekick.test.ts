import { describe, expect, test } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Move: Axe Kick (かかとおとし)", () => {
  test("Crash damage when immune", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "medicham", ability: "purepower", moves: ["axekick"] }),
        pokemon({ species: "pikachu", ability: "static", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", ability: "cursedbody", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
      ],
    );

    const { engineState } = env.executeAndAssert(
      "move axekick 1, move sleeptalk",
      "move sleeptalk, move sleeptalk",
    );
    const medicham = engineState.p1.active[0];

    // Axe Kick fails against Ghost type (Gengar), user takes crash recoil damage (50% max HP)
    expect(medicham.hp).toBeLessThan(medicham.maxhp);
    expect(medicham.maxhp - medicham.hp).toBe(Math.floor(medicham.maxhp / 2));
  });

  test("Crash damage when protected", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "medicham", ability: "purepower", moves: ["axekick"] }),
        pokemon({ species: "pikachu", ability: "static", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["protect"] }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
    );

    const { engineState } = env.executeAndAssert(
      "move axekick 1, move sleeptalk",
      "move protect, move sleeptalk",
    );
    const medicham = engineState.p1.active[0];

    // Axe Kick blocked by Protect, user takes crash recoil damage (50% max HP)
    expect(medicham.hp).toBeLessThan(medicham.maxhp);
    expect(medicham.maxhp - medicham.hp).toBe(Math.floor(medicham.maxhp / 2));
  });

  test("Secondary effect causes confusion", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "medicham", ability: "purepower", moves: ["axekick"] }),
        pokemon({ species: "pikachu", ability: "static", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: [{ id: "axekick", secondary: "inherit" }, "sleeptalk"],
      },
    );

    const { engineState, engineLogs } = env.executeAndAssert(
      "move axekick 1, move sleeptalk",
      "move sleeptalk, move sleeptalk",
      {
        secondary: "always",
      },
    );

    const snorlax = engineState.p2.active[0];
    // Snorlax took damage and received confusion volatile status
    expect(snorlax.hp).toBeLessThan(snorlax.maxhp);
    expect(
      snorlax.volatile_status.includes("confusion") ||
        engineLogs.some((l) => l.showdown?.includes("-start") && l.showdown?.includes("confusion")),
    ).toBe(true);
  });
});
