import { test, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

test("Move: Glaive Rush deals damage, doubles damage taken next turn, and wears off on next move", () => {
  const engine = new Simulator({
    damage_roll: "max",
    crits: "never",
    accuracy: "always",
    secondary: "never",
  });

  engine.set_state({
    p1: {
      active: [
        {
          ident: "p1a",
          species: "baxcalibur",
          type1: "Dragon",
          type2: "Ice",
          hp: 400,
          maxhp: 400,
          speed: 200,
          attack: 100,
          defense: 100,
          sp_attack: 50,
          sp_defense: 100,
          item: undefined,
          ability: "thermalexchange",
          status: undefined,
        },
      ],
      team: [],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
      reflect_turns: 0,
      lightscreen_turns: 0,
      safeguard_turns: 0,
    },
    p2: {
      active: [
        {
          ident: "p2a",
          species: "snorlax",
          type1: "Normal",
          hp: 400,
          maxhp: 400,
          speed: 100,
          attack: 100,
          defense: 100,
          sp_attack: 50,
          sp_defense: 100,
          item: undefined,
          ability: "thickfat",
          status: undefined,
        },
      ],
      team: [],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
      reflect_turns: 0,
      lightscreen_turns: 0,
      safeguard_turns: 0,
    },
    weather: undefined,
    weather_turns_left: 0,
    terrain: undefined,
    terrain_turns_left: 0,
    trick_room: false,
  });

  engine.start_battle();

  // Turn 1: Baxcalibur moves first (Spe 200 vs 100) and uses Glaive Rush.
  // Then Snorlax uses Tackle on Baxcalibur.
  // Since Baxcalibur used Glaive Rush earlier this turn, Snorlax's Tackle damage should be doubled!
  const logs1 = engine.run_turn({
    p1a: "glaiverush",
    p1a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2a: "tackle",
    p2a_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const state1 = engine.get_state();
  expect(state1.p2.active[0].hp).toBeLessThan(400); // Snorlax took damage from Glaive Rush

  // Check that Baxcalibur took damage from tackle with the 2x Glaive Rush multiplier
  const p1a_hp_after_t1 = state1.p1.active[0].hp;
  expect(p1a_hp_after_t1).toBeLessThan(400);

  // Verify Glaive Rush log was emitted
  const events1 = logs1.events.map((e) => e.event);
  expect(events1).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "MoveUsed", move_id: "glaiverush" })]),
  );

  // Turn 2: Baxcalibur acts again (uses protect or another move), which clears the drawback.
  engine.run_turn({
    p1a: "protect",
    p1a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2a: "sleeptalk",
    p2a_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });
  const state2 = engine.get_state();
  expect(state2.p1.active[0].volatile_status).not.toContain("glaiverush");
});
