import { describe, it, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

describe("Ability: Stance Change", () => {
  it("changes Aegislash from Shield Forme to Blade Forme upon using an attacking move, swapping Atk/Def and SpA/SpD", () => {
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
            species: "aegislash-shield",
            type1: "Steel",
            type2: "Ghost",
            hp: 100,
            maxhp: 100,
            speed: 60,
            attack: 50,
            defense: 140,
            sp_attack: 50,
            sp_defense: 140,
            ability: "stancechange",
            moves: ["shadowclaw", "kingsshield"],
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
            ability: "thickfat",
            moves: ["sleeptalk"],
          },
          {
            ident: "p2b",
            species: "raichu",
            type1: "Electric",
            hp: 100,
            maxhp: 100,
            speed: 100,
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
      weather: undefined,
      weather_turns_left: 0,
      terrain: undefined,
      terrain_turns_left: 0,
      trick_room: false,
    });

    engine.start_battle();

    // Turn 1: Aegislash uses Shadow Claw (attacking move)
    const logs = engine.run_turn({
      p1a: "shadowclaw",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "sleeptalk",
      p2a_target: 0,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const events = logs.events.map((e) => e.event);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "FormeChange",
          target: { player: 1, slot: 0 },
          species: "aegislash-blade",
          from_effect: "ability: Stance Change",
        }),
      ]),
    );

    const stateAfterAttack = engine.get_state();
    const aegislashBlade = stateAfterAttack.p1.active[0];

    // Forme is now blade and stats are swapped
    expect(aegislashBlade.species).toBe("aegislash-blade");
    expect(aegislashBlade.attack).toBe(140);
    expect(aegislashBlade.defense).toBe(50);
    expect(aegislashBlade.sp_attack).toBe(140);
    expect(aegislashBlade.sp_defense).toBe(50);
  });

  it("changes Aegislash from Blade Forme back to Shield Forme upon using King's Shield", () => {
    const engine = new Simulator();

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "aegislash-blade",
            type1: "Steel",
            type2: "Ghost",
            hp: 100,
            maxhp: 100,
            speed: 60,
            attack: 140,
            defense: 50,
            sp_attack: 140,
            sp_defense: 50,
            ability: "stancechange",
            moves: ["kingsshield", "shadowclaw"],
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
            ability: "thickfat",
            moves: ["sleeptalk"],
          },
          {
            ident: "p2b",
            species: "raichu",
            type1: "Electric",
            hp: 100,
            maxhp: 100,
            speed: 100,
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
      weather: undefined,
      weather_turns_left: 0,
      terrain: undefined,
      terrain_turns_left: 0,
      trick_room: false,
    });

    engine.start_battle();

    const logs = engine.run_turn({
      p1a: "kingsshield",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "sleeptalk",
      p2a_target: 0,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const events = logs.events.map((e) => e.event);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "FormeChange",
          target: { player: 1, slot: 0 },
          species: "aegislash-shield",
          from_effect: "ability: Stance Change",
        }),
      ]),
    );

    const state = engine.get_state();
    const aegislashShield = state.p1.active[0];

    expect(aegislashShield.species).toBe("aegislash-shield");
    expect(aegislashShield.attack).toBe(50);
    expect(aegislashShield.defense).toBe(140);
    expect(aegislashShield.sp_attack).toBe(50);
    expect(aegislashShield.sp_defense).toBe(140);
  });

  it("resets Aegislash to Shield Forme when switched out to bench", () => {
    const engine = new Simulator();

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "aegislash-blade",
            type1: "Steel",
            type2: "Ghost",
            hp: 100,
            maxhp: 100,
            speed: 60,
            attack: 140,
            defense: 50,
            sp_attack: 140,
            sp_defense: 50,
            ability: "stancechange",
            moves: ["shadowclaw"],
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
        team: [
          {
            ident: "p1c",
            species: "tauros",
            type1: "Normal",
            hp: 100,
            maxhp: 100,
            speed: 110,
            attack: 100,
            defense: 95,
            sp_attack: 40,
            sp_defense: 70,
            moves: ["sleeptalk"],
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
            hp: 200,
            maxhp: 200,
            speed: 30,
            attack: 110,
            defense: 65,
            sp_attack: 65,
            sp_defense: 110,
            ability: "thickfat",
            moves: ["sleeptalk"],
          },
          {
            ident: "p2b",
            species: "raichu",
            type1: "Electric",
            hp: 100,
            maxhp: 100,
            speed: 100,
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
      weather: undefined,
      weather_turns_left: 0,
      terrain: undefined,
      terrain_turns_left: 0,
      trick_room: false,
    });

    engine.start_battle();

    // Switch Aegislash with Tauros
    engine.run_turn({
      p1a: "switch",
      p1a_target: 2,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "sleeptalk",
      p2a_target: 0,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const state = engine.get_state();
    // In bench, Aegislash has reverted to Shield forme
    const benchedAegislash = state.p1.team[0];
    expect(benchedAegislash.species).toBe("aegislash-shield");
    expect(benchedAegislash.attack).toBe(50);
    expect(benchedAegislash.defense).toBe(140);
  });
});
