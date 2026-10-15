import { expect, test } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Knock Off removes target item even if attacker faints from Rough Skin recoil", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "garchomp", ability: "roughskin", item: "choicescarf", moves: ["earthquake"] }),
      pokemon({ species: "pikachu", ability: "static", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "blaziken", ability: "speedboost", item: "focussash", moves: ["knockoff"] }),
      pokemon({ species: "aerodactyl", ability: "unnerve", moves: ["dualwingbeat"] }),
    ],
  );

  // Turn 1 Sequence:
  // 1. Choice Scarf Garchomp attacks first with Earthquake. Blaziken survives with 1 HP via Focus Sash (Sash consumed).
  // 2. Blaziken attacks Garchomp with Knock Off:
  //    - Garchomp takes damage and its Choice Scarf is knocked off.
  //    - Contact with Garchomp triggers Rough Skin recoil (1/8 max HP).
  //    - Blaziken's remaining 1 HP is depleted and Blaziken faints.
  //    - Crucially: Knock Off item removal still succeeds despite the attacker fainting from Rough Skin.
  const { engineState, simLog } = env.executeAndAssert(
    "move earthquake, move sleeptalk",
    "move knockoff 1, move dualwingbeat 1",
  );

  // Garchomp took damage from Knock Off
  expect(engineState.p1.active[0].hp).toBeLessThan(engineState.p1.active[0].maxhp);

  // Garchomp's Choice Scarf was knocked off and removed
  expect(engineState.p1.active[0].item).toBeFalsy();

  // Blaziken's Focus Sash was consumed after surviving Earthquake
  expect(engineState.p2.active[0].item).toBeFalsy();

  // Blaziken fainted from Rough Skin contact recoil damage
  expect(engineState.p2.active[0].hp).toBe(0);

  // Battle log verifies Rough Skin damage was inflicted
  expect(simLog.some((l) => /Rough Skin/i.test(l))).toBe(true);
});
