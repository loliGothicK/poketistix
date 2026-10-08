import { test, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

test("Move: Jaw Lock traps both user and target when neither is Ghost", () => {
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
          species: "mabosstiff",
          type1: "Dark",
          hp: 100,
          maxhp: 100,
          speed: 100,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "intimidate",
          status: undefined,
        },
      ],
      team: [],
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
    p1a: "jawlock",
    p1a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2a: "sleeptalk",
    p2a_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const events = logs.events.map((e) => e.event);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "MoveUsed", move_id: "jawlock" }),
      expect.objectContaining({
        type: "Activate",
        target: { player: 1, slot: 0 },
        effect: "trapped",
      }),
      expect.objectContaining({
        type: "Activate",
        target: { player: 2, slot: 0 },
        effect: "trapped",
      }),
    ]),
  );
});

test("Move: Jaw Lock does not trap Ghost-type target", () => {
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
          species: "mabosstiff",
          type1: "Dark",
          hp: 100,
          maxhp: 100,
          speed: 100,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "intimidate",
          status: undefined,
        },
      ],
      team: [],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
    },
    p2: {
      active: [
        {
          ident: "p2a",
          species: "gengar",
          type1: "Ghost",
          type2: "Poison",
          hp: 500, // high HP so it doesn't faint
          maxhp: 500,
          speed: 50,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "cursedbody",
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
    p1a: "jawlock",
    p1a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2a: "sleeptalk",
    p2a_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const events = logs.events.map((e) => e.event);
  // Mabosstiff is trapped
  expect(events).toContainEqual(
    expect.objectContaining({
      type: "Activate",
      target: { player: 1, slot: 0 },
      effect: "trapped",
    }),
  );
  // Gengar is Ghost, so not trapped
  expect(events).not.toContainEqual(
    expect.objectContaining({
      type: "Activate",
      target: { player: 2, slot: 0 },
      effect: "trapped",
    }),
  );
});
