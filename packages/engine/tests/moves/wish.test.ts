import { test, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

test("Move: wish", () => {
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
          type1: "Psychic",
          type2: "Normal",
          hp: 100,
          maxhp: 100,
          speed: 300,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "synchronize",
          status: undefined,
        },
        {
          ident: "p1b",
          species: "pidgeot",
          type1: "Normal",
          type2: "Flying",
          hp: 100,
          maxhp: 100,
          speed: 200,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "keeneye",
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
          species: "raichu",
          type1: "Electric",
          hp: 100,
          maxhp: 100,
          speed: 250,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "static",
          status: undefined,
        },
        {
          ident: "p2b",
          species: "pidgeot",
          type1: "Normal",
          type2: "Flying",
          hp: 100,
          maxhp: 100,
          speed: 200,
          attack: 10,
          defense: 10,
          sp_attack: 10,
          sp_defense: 10,
          item: undefined,
          ability: "keeneye",
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
    p1a: "wish",
    p1a_target: 0,
    p2a: "tackle",
    p2a_target: 0,
    p1b: "tackle",
    p1b_target: 0,
    p2b: "tackle",
    p2b_target: 0,
  });

  const events1 = logs.events.map((e) => e.event);
  expect(events1).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "MoveUsed",
        move_id: "wish",
        attacker: { player: 1, slot: 0 },
      }),
    ]),
  );

  // Turn 1 end: Wish has not triggered yet
  expect(events1.some((e: any) => e.type === "Activate" && e.effect === "Wish")).toBe(false);

  // Turn 2: Wish should activate at the end of Turn 2 (next turn)
  const logs2 = engine.run_turn({
    p1a: "sleeptalk",
    p1a_target: 0,
    p2a: "sleeptalk",
    p2a_target: 0,
    p1b: "sleeptalk",
    p1b_target: 0,
    p2b: "sleeptalk",
    p2b_target: 0,
  });

  const events2 = logs2.events.map((e) => e.event);
  expect(events2).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "Activate",
        effect: "Wish",
        target: { player: 1, slot: 0 },
      }),
      expect.objectContaining({
        type: "Heal",
        target: { player: 1, slot: 0 },
      }),
    ]),
  );
});
