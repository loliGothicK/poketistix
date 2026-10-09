import { describe, it, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

describe("Move: Transform", () => {
  it("copies target species, types, stats (except HP), stat stages, moves (with 5 PP), and ability", () => {
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
            species: "ditto",
            type1: "Normal",
            hp: 60,
            maxhp: 60,
            speed: 300,
            attack: 48,
            defense: 48,
            sp_attack: 48,
            sp_defense: 48,
            item: undefined,
            ability: "limber",
            moves: ["transform"],
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
            species: "charizard",
            type1: "Fire",
            type2: "Flying",
            hp: 120,
            maxhp: 150,
            speed: 200,
            attack: 84,
            defense: 78,
            sp_attack: 109,
            sp_defense: 85,
            item: undefined,
            ability: "blaze",
            boosts: {
              atk: 2,
              def: -1,
              spa: 1,
              spd: 0,
              spe: 1,
              accuracy: 0,
              evasion: 0,
            },
            moves: ["flamethrower", "airslash", "roost"],
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
      p1a: "transform",
      p1a_target: 0, // targets p2a (Charizard)
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "roost",
      p2a_target: 0,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const events = logs.events.map((e) => e.event);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Activate",
          target: { player: 1, slot: 0 },
          effect: "Transform",
        }),
      ]),
    );

    const state = engine.get_state();
    const transformedDitto = state.p1.active[0];

    // Species copied
    expect(transformedDitto.species).toBe("charizard");
    // Types copied
    expect(transformedDitto.type1).toBe("Fire");
    expect(transformedDitto.type2).toBe("Flying");
    // Stats copied except HP
    expect(transformedDitto.hp).toBe(60);
    expect(transformedDitto.maxhp).toBe(60);
    expect(transformedDitto.attack).toBe(84);
    expect(transformedDitto.defense).toBe(78);
    expect(transformedDitto.sp_attack).toBe(109);
    expect(transformedDitto.sp_defense).toBe(85);
    expect(transformedDitto.speed).toBe(200);
    // Stat boosts copied
    expect(transformedDitto.boosts.atk).toBe(2);
    expect(transformedDitto.boosts.def).toBe(-1);
    expect(transformedDitto.boosts.spa).toBe(1);
    expect(transformedDitto.boosts.spe).toBe(1);
    // Ability copied
    expect(transformedDitto.ability).toBe("blaze");
    // Moves copied
    expect(transformedDitto.moves).toEqual(["flamethrower", "airslash", "roost"]);
    // Volatile status includes transform
    expect(transformedDitto.volatile_status).toContain("transform");
  });

  it("fails when targeting a Pokemon behind a Substitute", () => {
    const engine = new Simulator();

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "ditto",
            type1: "Normal",
            hp: 60,
            maxhp: 60,
            speed: 300,
            attack: 48,
            defense: 48,
            sp_attack: 48,
            sp_defense: 48,
            ability: "limber",
            moves: ["transform"],
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
            species: "charizard",
            type1: "Fire",
            type2: "Flying",
            hp: 150,
            maxhp: 150,
            speed: 100,
            attack: 84,
            defense: 78,
            sp_attack: 109,
            sp_defense: 85,
            substitute_hp: 37,
            volatile_status: ["substitute"],
            moves: ["flamethrower"],
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
      p1a: "transform",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "flamethrower",
      p2a_target: 1,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const events = logs.events.map((e) => e.event);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Fail",
          target: { player: 1, slot: 0 },
        }),
      ]),
    );

    const state = engine.get_state();
    // Should NOT have transformed
    expect(state.p1.active[0].species).toBe("ditto");
  });

  it("fails if user is already transformed", () => {
    const engine = new Simulator();

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "charizard",
            type1: "Fire",
            type2: "Flying",
            hp: 60,
            maxhp: 60,
            speed: 300,
            attack: 84,
            defense: 78,
            sp_attack: 109,
            sp_defense: 85,
            volatile_status: ["transform"],
            moves: ["transform"],
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
          {
            ident: "p2b",
            species: "pikachu",
            type1: "Electric",
            hp: 100,
            maxhp: 100,
            speed: 100,
            attack: 55,
            defense: 40,
            sp_attack: 50,
            sp_defense: 50,
            moves: ["thunderbolt"],
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
      p1a: "transform",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "sleeptalk",
      p2a_target: 0,
      p2b: "thunderbolt",
      p2b_target: 0,
    });

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
});
