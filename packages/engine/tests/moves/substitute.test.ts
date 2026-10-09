import { test, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

test("Move: substitute consumes 25% max HP and absorbs damage", () => {
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
          species: "pidgeot",
          type1: "Normal",
          type2: "Flying",
          hp: 100,
          maxhp: 100,
          speed: 300,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          moves: ["substitute", "pass"],
        },
        {
          ident: "p1b",
          species: "pidgeot",
          type1: "Normal",
          type2: "Flying",
          hp: 100,
          maxhp: 100,
          speed: 10,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          moves: ["pass"],
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
          species: "raichu",
          type1: "Electric",
          hp: 100,
          maxhp: 100,
          speed: 250,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          moves: ["tackle"],
        },
        {
          ident: "p2b",
          species: "pidgeot",
          type1: "Normal",
          type2: "Flying",
          hp: 100,
          maxhp: 100,
          speed: 10,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          moves: ["pass"],
        },
      ],
      team: [],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
    },
  });

  engine.start_battle();

  // Turn 1: P1 uses substitute (consumes 25 HP -> 75 HP, substitute_hp = 25)
  // P2 uses tackle on P1 (deals 19 damage -> absorbed by substitute, leaving substitute_hp = 6)
  const logs1 = engine.run_turn({
    p1a: "substitute",
    p1a_target: 0,
    p2a: "tackle",
    p2a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const state1 = engine.get_state().p1.active[0];
  expect(state1.hp).toBe(75);
  expect(state1.substitute_hp).toBe(6);
  expect(state1.volatile_status).toContain("substitute");

  // Verify MoveUsed, Start: Substitute, and absorbed Damage events
  const events1 = logs1.events.map((e) => e.event);
  expect(events1).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "MoveUsed",
        move_id: "substitute",
        attacker: { player: 1, slot: 0 },
      }),
      expect.objectContaining({
        type: "Start",
        target: { player: 1, slot: 0 },
        effect: "Substitute",
      }),
      expect.objectContaining({
        type: "Damage",
        target: { player: 1, slot: 0 },
        absorbed: true,
      }),
    ]),
  );

  // Turn 2: P2 tackles again (19 damage >= 6 remaining substitute HP -> breaks substitute)
  // P1's HP must remain 75 (absorbs full damage with no breakthrough)
  const logs2 = engine.run_turn({
    p1a: "pass",
    p1a_target: 0,
    p2a: "tackle",
    p2a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const state2 = engine.get_state().p1.active[0];
  expect(state2.hp).toBe(75);
  expect(state2.substitute_hp).toBe(0);
  expect(state2.volatile_status).not.toContain("substitute");

  const events2 = logs2.events.map((e) => e.event);
  expect(events2).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "Damage",
        target: { player: 1, slot: 0 },
        absorbed: true,
      }),
      expect.objectContaining({
        type: "VolatileStatusEnd",
        target: { player: 1, slot: 0 },
        volatile_status: "Substitute",
      }),
    ]),
  );
});

test("Move: substitute fails if user has 25% HP or less", () => {
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
          species: "pidgeot",
          type1: "Normal",
          type2: "Flying",
          hp: 25,
          maxhp: 100,
          speed: 300,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          moves: ["substitute"],
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
          species: "raichu",
          type1: "Electric",
          hp: 100,
          maxhp: 100,
          speed: 100,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          moves: ["pass"],
        },
      ],
      team: [],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
    },
  });

  engine.start_battle();
  const logs = engine.run_turn({
    p1a: "substitute",
    p1a_target: 0,
    p2a: "pass",
    p2a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const state = engine.get_state().p1.active[0];
  expect(state.hp).toBe(25);
  expect(state.substitute_hp).toBe(0);
  expect(state.volatile_status).not.toContain("substitute");

  const events = logs.events.map((e) => e.event);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "Fail",
        target: { player: 1, slot: 0 },
      }),
    ]),
  );
});

test("Move: substitute fails if user already has an active substitute", () => {
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
          species: "pidgeot",
          type1: "Normal",
          type2: "Flying",
          hp: 100,
          maxhp: 100,
          speed: 300,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          moves: ["substitute"],
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
          species: "raichu",
          type1: "Electric",
          hp: 100,
          maxhp: 100,
          speed: 100,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          moves: ["pass"],
        },
      ],
      team: [],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
    },
  });

  engine.start_battle();

  // Turn 1: Creates substitute
  engine.run_turn({
    p1a: "substitute",
    p1a_target: 0,
    p2a: "pass",
    p2a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  expect(engine.get_state().p1.active[0].hp).toBe(75);
  expect(engine.get_state().p1.active[0].substitute_hp).toBe(25);

  // Turn 2: Attempt to use substitute again -> Fails
  const logs2 = engine.run_turn({
    p1a: "substitute",
    p1a_target: 0,
    p2a: "pass",
    p2a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const state2 = engine.get_state().p1.active[0];
  expect(state2.hp).toBe(75); // HP not deducted again
  expect(state2.substitute_hp).toBe(25); // Substitute remains intact

  const events2 = logs2.events.map((e) => e.event);
  expect(events2).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "Fail",
        target: { player: 1, slot: 0 },
      }),
    ]),
  );
});

test("Move: multi-hit moves break substitute on early hits and subsequent hits penetrate to damage user directly", () => {
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
          species: "pidgeot",
          type1: "Normal",
          type2: "Flying",
          hp: 100,
          maxhp: 100,
          speed: 300,
          attack: 10,
          defense: 60,
          sp_attack: 10,
          sp_defense: 60,
          moves: ["substitute", "pass"],
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
          species: "venusaur",
          type1: "Grass",
          type2: "Poison",
          hp: 100,
          maxhp: 100,
          speed: 100,
          attack: 100,
          defense: 50,
          sp_attack: 10,
          sp_defense: 50,
          moves: ["bulletseed"],
        },
      ],
      team: [],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
    },
  });

  engine.start_battle();

  // P1 uses substitute: consumes 25 HP (100 -> 75 HP, substitute_hp = 25)
  // P2 uses Bullet Seed (5 hits, each deals ~15 damage)
  // Hits 1, 2: absorbed by Substitute and break it (15 + 15 >= 25)
  // Hits 3, 4, 5: penetrate to P1 directly (each dealing 15 damage: 75 -> 60 -> 45 -> 30)
  const logs = engine.run_turn({
    p1a: "substitute",
    p1a_target: 0,
    p2a: "bulletseed",
    p2a_target: 0,
    p1b: "pass",
    p1b_target: 0,
    p2b: "pass",
    p2b_target: 0,
  });

  const state = engine.get_state().p1.active[0];
  expect(state.hp).toBe(30); // 75 - 3 * 15 = 30
  expect(state.substitute_hp).toBe(0);
  expect(state.volatile_status).not.toContain("substitute");

  // Verify that Substitute ended during the turn
  const events = logs.events.map((e) => e.event);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "VolatileStatusEnd",
        target: { player: 1, slot: 0 },
        volatile_status: "Substitute",
      }),
    ]),
  );
});
