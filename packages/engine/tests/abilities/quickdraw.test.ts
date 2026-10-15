import { describe, it, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

describe("Ability: Quick Draw", () => {
  it("activates on attacking moves and makes the user act first in the priority bracket even with lower Speed", () => {
    const engine = new Simulator({
      damage_roll: "max",
      crits: "never",
      accuracy: "always",
      secondary: "always", // force Quick Draw to activate deterministically
    });

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "galarian-slowbro",
            type1: "Poison",
            type2: "Psychic",
            hp: 100,
            maxhp: 100,
            speed: 30, // Much slower than P2A
            attack: 100,
            defense: 95,
            sp_attack: 100,
            sp_defense: 70,
            ability: "quickdraw",
            moves: ["sludgebomb"],
          },
          {
            ident: "p1b",
            species: "clefable",
            type1: "Fairy",
            hp: 100,
            maxhp: 100,
            speed: 50,
            attack: 50,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            moves: ["sleeptalk"],
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
            species: "greninja",
            type1: "Water",
            type2: "Dark",
            hp: 100,
            maxhp: 100,
            speed: 122, // Faster than Slowbro
            attack: 95,
            defense: 67,
            sp_attack: 103,
            sp_defense: 71,
            ability: "torrent",
            moves: ["surf"],
          },
          {
            ident: "p2b",
            species: "snorlax",
            type1: "Normal",
            hp: 200,
            maxhp: 200,
            speed: 30,
            attack: 110,
            defense: 65,
            sp_attack: 65,
            sp_defense: 110,
            moves: ["sleeptalk"],
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
      p1a: "sludgebomb",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "surf",
      p2a_target: 0,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const events = logs.events.map((e) => e.event);

    // Quick Draw should activate
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Activate",
          target: { player: 1, slot: 0 },
          effect: "Quick Draw",
        }),
      ]),
    );

    // Sludge Bomb should be used before Surf despite Slowbro having lower speed
    const sludgeBombIndex = events.findIndex(
      (e) => e.type === "MoveUsed" && e.move_id === "sludgebomb",
    );
    const surfIndex = events.findIndex((e) => e.type === "MoveUsed" && e.move_id === "surf");

    expect(sludgeBombIndex).toBeGreaterThan(-1);
    expect(surfIndex).toBeGreaterThan(-1);
    expect(sludgeBombIndex).toBeLessThan(surfIndex);
  });

  it("does not activate on status moves", () => {
    const engine = new Simulator({
      damage_roll: "max",
      crits: "never",
      accuracy: "always",
      secondary: "always",
    });

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "galarian-slowbro",
            type1: "Poison",
            type2: "Psychic",
            hp: 100,
            maxhp: 100,
            speed: 30,
            attack: 100,
            defense: 95,
            sp_attack: 100,
            sp_defense: 70,
            ability: "quickdraw",
            moves: ["sleeptalk"],
          },
          {
            ident: "p1b",
            species: "clefable",
            type1: "Fairy",
            hp: 100,
            maxhp: 100,
            speed: 50,
            attack: 50,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            moves: ["sleeptalk"],
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
            species: "greninja",
            type1: "Water",
            type2: "Dark",
            hp: 100,
            maxhp: 100,
            speed: 122,
            attack: 95,
            defense: 67,
            sp_attack: 103,
            sp_defense: 71,
            moves: ["surf"],
          },
          {
            ident: "p2b",
            species: "snorlax",
            type1: "Normal",
            hp: 200,
            maxhp: 200,
            speed: 30,
            attack: 110,
            defense: 65,
            sp_attack: 65,
            sp_defense: 110,
            moves: ["sleeptalk"],
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
      p1a: "sleeptalk",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "surf",
      p2a_target: 0,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const events = logs.events.map((e) => e.event);

    // Quick Draw should NOT activate on status move Sleep Talk
    const quickDrawEvent = events.find((e) => e.type === "Activate" && e.effect === "Quick Draw");
    expect(quickDrawEvent).toBeUndefined();

    // Greninja moves before Slowbro
    const sleepTalkIndex = events.findIndex(
      (e) => e.type === "MoveUsed" && e.move_id === "sleeptalk",
    );
    const surfIndex = events.findIndex((e) => e.type === "MoveUsed" && e.move_id === "surf");
    expect(surfIndex).toBeLessThan(sleepTalkIndex);
  });
});
