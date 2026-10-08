import { test, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

test("Move: Court Change swaps side conditions between teams", () => {
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
          species: "cinderace",
          type1: "Fire",
          hp: 100,
          maxhp: 100,
          speed: 300,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "blaze",
          status: undefined,
        },
      ],
      team: [],
      stealth_rock: true,
      spikes: 2,
      toxic_spikes: 1,
      sticky_web: true,
      tailwind: true,
      tailwind_turns: 3,
      aurora_veil_turns: 0,
      reflect_turns: 4,
      lightscreen_turns: 0,
      safeguard_turns: 0,
    },
    p2: {
      active: [
        {
          ident: "p2a",
          species: "snorlax",
          type1: "Normal",
          hp: 100,
          maxhp: 100,
          speed: 50,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "immunity",
          status: undefined,
        },
      ],
      team: [],
      stealth_rock: false,
      spikes: 0,
      toxic_spikes: 0,
      sticky_web: false,
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 5,
      reflect_turns: 0,
      lightscreen_turns: 3,
      safeguard_turns: 0,
    },
    weather: undefined,
    weather_turns_left: 0,
    terrain: undefined,
    terrain_turns_left: 0,
    trick_room: false,
  });

  engine.start_battle();
  const logs = engine.run_turn({
    p1a: "courtchange",
    p1a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2a: "protect",
    p2a_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const state = engine.get_state();
  // P1 now has P2's former conditions
  expect(state.p1.stealth_rock).toBe(false);
  expect(state.p1.spikes).toBe(0);
  expect(state.p1.toxic_spikes).toBe(0);
  expect(state.p1.sticky_web).toBe(false);
  expect(state.p1.tailwind).toBe(false);
  expect(state.p1.tailwind_turns).toBe(0);
  expect(state.p1.reflect_turns).toBe(0);
  expect(state.p1.aurora_veil_turns).toBe(5);
  expect(state.p1.lightscreen_turns).toBe(3);

  // P2 now has P1's former conditions
  expect(state.p2.stealth_rock).toBe(true);
  expect(state.p2.spikes).toBe(2);
  expect(state.p2.toxic_spikes).toBe(1);
  expect(state.p2.sticky_web).toBe(true);
  expect(state.p2.tailwind).toBe(true);
  expect(state.p2.tailwind_turns).toBe(2);
  expect(state.p2.reflect_turns).toBe(4);
  expect(state.p2.aurora_veil_turns).toBe(0);
  expect(state.p2.lightscreen_turns).toBe(0);

  const events = logs.events.map((e) => e.event);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "MoveUsed", move_id: "courtchange" }),
      expect.objectContaining({
        type: "Text",
        message: "|-swapsideconditions",
      }),
      expect.objectContaining({
        type: "Activate",
        effect: "move: Court Change",
      }),
    ]),
  );
});

test("Move: Court Change fails when no side conditions are active", () => {
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
          species: "cinderace",
          type1: "Fire",
          hp: 100,
          maxhp: 100,
          speed: 300,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "blaze",
          status: undefined,
        },
      ],
      team: [],
      stealth_rock: false,
      spikes: 0,
      toxic_spikes: 0,
      sticky_web: false,
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
          hp: 100,
          maxhp: 100,
          speed: 50,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "immunity",
          status: undefined,
        },
      ],
      team: [],
      stealth_rock: false,
      spikes: 0,
      toxic_spikes: 0,
      sticky_web: false,
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
  const logs = engine.run_turn({
    p1a: "courtchange",
    p1a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2a: "protect",
    p2a_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const events = logs.events.map((e) => e.event);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "MoveUsed", move_id: "courtchange" }),
      expect.objectContaining({
        type: "Fail",
        target: { player: 1, slot: 0 },
      }),
    ]),
  );
});
