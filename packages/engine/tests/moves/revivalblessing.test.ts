import { test, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

test("Move: Revival Blessing revives fainted party member with 50% HP", () => {
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
          species: "pawmot",
          type1: "Electric",
          type2: "Fighting",
          hp: 100,
          maxhp: 100,
          speed: 100,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "naturalcure",
          status: undefined,
        },
      ],
      team: [
        {
          ident: "p1b",
          species: "snorlax",
          type1: "Normal",
          hp: 0,
          maxhp: 200,
          speed: 50,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "thickfat",
          status: undefined,
        },
      ],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
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
          ability: "thickfat",
          status: undefined,
        },
      ],
      team: [],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
    },
    weather: undefined,
    weather_turns_left: 0,
    terrain: undefined,
    terrain_turns_left: 0,
    trick_room: false,
  });

  engine.start_battle();
  const logs = engine.run_turn({
    p1a: "revivalblessing",
    p1a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2a: "protect",
    p2a_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const state = engine.get_state();
  // Snorlax was revived to 100 HP (50% of 200)
  expect(state.p1.team[0].hp).toBe(100);

  const events = logs.events.map((e) => e.event);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "MoveUsed", move_id: "revivalblessing" }),
      expect.objectContaining({
        type: "Heal",
        amount: 100,
      }),
    ]),
  );
});

test("Move: Revival Blessing fails when no party member is fainted", () => {
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
          species: "pawmot",
          type1: "Electric",
          type2: "Fighting",
          hp: 100,
          maxhp: 100,
          speed: 100,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "naturalcure",
          status: undefined,
        },
      ],
      team: [
        {
          ident: "p1b",
          species: "snorlax",
          type1: "Normal",
          hp: 200,
          maxhp: 200,
          speed: 50,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "thickfat",
          status: undefined,
        },
      ],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
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
          ability: "thickfat",
          status: undefined,
        },
      ],
      team: [],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
    },
    weather: undefined,
    weather_turns_left: 0,
    terrain: undefined,
    terrain_turns_left: 0,
    trick_room: false,
  });

  engine.start_battle();
  const logs = engine.run_turn({
    p1a: "revivalblessing",
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
      expect.objectContaining({ type: "MoveUsed", move_id: "revivalblessing" }),
      expect.objectContaining({
        type: "Fail",
        target: { player: 1, slot: 0 },
      }),
    ]),
  );
});
