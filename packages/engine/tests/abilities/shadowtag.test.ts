import { describe, it, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

describe("Ability: Shadow Tag", () => {
  it("prevents non-Ghost opposing Pokemon from switching out", () => {
    const engine = new Simulator();

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "gengar-mega",
            type1: "Ghost",
            type2: "Poison",
            hp: 100,
            maxhp: 100,
            speed: 100,
            attack: 55,
            defense: 95,
            sp_attack: 95,
            sp_defense: 110,
            ability: "shadowtag",
            moves: ["sleeptalk"],
          },
          {
            ident: "p1b",
            species: "clefable",
            type1: "Fairy",
            hp: 100,
            maxhp: 100,
            speed: 60,
            attack: 50,
            defense: 70,
            sp_attack: 95,
            sp_defense: 90,
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
            species: "snorlax", // Normal type, not Ghost, does not have Shadow Tag
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
            speed: 110,
            attack: 90,
            defense: 55,
            sp_attack: 90,
            sp_defense: 80,
            moves: ["sleeptalk"],
          },
        ],
        team: [
          {
            ident: "p2c",
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
      weather: undefined,
      weather_turns_left: 0,
      terrain: undefined,
      terrain_turns_left: 0,
      trick_room: false,
    });

    engine.start_battle();

    // Check legal actions for p2: p2a cannot switch to bench (index 2)
    const p2Legal = engine.get_legal_actions(2);
    const p2aSwitchAction = p2Legal.actions.some((act) => act.slot_a.choice === "switch");
    expect(p2aSwitchAction).toBe(false);

    // Attempting to switch p2a anyway should fail with Cant (trapped)
    const logs = engine.run_turn({
      p1a: "sleeptalk",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "switch",
      p2a_target: 2, // attempt switch with team[0]
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const events = logs.events.map((e) => e.event);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Cant",
          target: { player: 2, slot: 0 },
          reason: "trapped",
        }),
      ]),
    );

    // Snorlax is still on field
    const state = engine.get_state();
    expect(state.p2.active[0].species).toBe("snorlax");
  });

  it("allows Ghost-type opposing Pokemon to switch out despite Shadow Tag", () => {
    const engine = new Simulator();

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "gengar-mega",
            type1: "Ghost",
            type2: "Poison",
            hp: 100,
            maxhp: 100,
            speed: 100,
            attack: 55,
            defense: 95,
            sp_attack: 95,
            sp_defense: 110,
            ability: "shadowtag",
            moves: ["sleeptalk"],
          },
          {
            ident: "p1b",
            species: "clefable",
            type1: "Fairy",
            hp: 100,
            maxhp: 100,
            speed: 60,
            attack: 50,
            defense: 70,
            sp_attack: 95,
            sp_defense: 90,
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
            species: "gengar", // Ghost-type immune to Shadow Tag
            type1: "Ghost",
            type2: "Poison",
            hp: 100,
            maxhp: 100,
            speed: 110,
            attack: 65,
            defense: 60,
            sp_attack: 130,
            sp_defense: 75,
            ability: "cursedbody",
            moves: ["sleeptalk"],
          },
          {
            ident: "p2b",
            species: "raichu",
            type1: "Electric",
            hp: 100,
            maxhp: 100,
            speed: 110,
            attack: 90,
            defense: 55,
            sp_attack: 90,
            sp_defense: 80,
            moves: ["sleeptalk"],
          },
        ],
        team: [
          {
            ident: "p2c",
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

    // Check legal actions: Gengar has switch options
    const p2Legal = engine.get_legal_actions(2);
    const p2aCanSwitch = p2Legal.actions.some((act) => act.slot_a.choice === "switch");
    expect(p2aCanSwitch).toBe(true);

    // Gengar switches out successfully
    engine.run_turn({
      p1a: "sleeptalk",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "switch",
      p2a_target: 2,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const state = engine.get_state();
    expect(state.p2.active[0].species).toBe("snorlax");
  });

  it("allows opposing Pokemon that also have Shadow Tag to switch out", () => {
    const engine = new Simulator();

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "gengar-mega",
            type1: "Ghost",
            type2: "Poison",
            hp: 100,
            maxhp: 100,
            speed: 100,
            attack: 55,
            defense: 95,
            sp_attack: 95,
            sp_defense: 110,
            ability: "shadowtag",
            moves: ["sleeptalk"],
          },
          {
            ident: "p1b",
            species: "clefable",
            type1: "Fairy",
            hp: 100,
            maxhp: 100,
            speed: 60,
            attack: 50,
            defense: 70,
            sp_attack: 95,
            sp_defense: 90,
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
            species: "gengar-mega", // Mega Gengar also has Shadow Tag!
            type1: "Ghost",
            type2: "Poison",
            hp: 200,
            maxhp: 200,
            speed: 130,
            attack: 65,
            defense: 80,
            sp_attack: 170,
            sp_defense: 95,
            ability: "shadowtag",
            moves: ["sleeptalk"],
          },
          {
            ident: "p2b",
            species: "raichu",
            type1: "Electric",
            hp: 100,
            maxhp: 100,
            speed: 110,
            attack: 90,
            defense: 55,
            sp_attack: 90,
            sp_defense: 80,
            moves: ["sleeptalk"],
          },
        ],
        team: [
          {
            ident: "p2c",
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

    const p2Legal = engine.get_legal_actions(2);
    // Wobbuffet can switch because both sides have Shadow Tag
    const wobbuffetCanSwitch = p2Legal.actions.some((act) => act.slot_a.choice === "switch");
    expect(wobbuffetCanSwitch).toBe(true);

    // But Raichu (no Shadow Tag, not Ghost) CANNOT switch
    const raichuCanSwitch = p2Legal.actions.some((act) => act.slot_b.choice === "switch");
    expect(raichuCanSwitch).toBe(false);
  });
});
