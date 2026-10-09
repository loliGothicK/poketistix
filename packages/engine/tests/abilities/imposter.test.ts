import { describe, it, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

describe("Ability: Imposter", () => {
  it("automatically transforms into the opposing slot Pokemon on switch-in", () => {
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
            speed: 100,
            attack: 48,
            defense: 48,
            sp_attack: 48,
            sp_defense: 48,
            ability: "imposter",
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
            ability: "thickfat",
            moves: ["bodyslam", "rest"],
          },
          {
            ident: "p2b",
            species: "umbreon",
            type1: "Dark",
            hp: 195,
            maxhp: 195,
            speed: 65,
            attack: 65,
            defense: 110,
            sp_attack: 60,
            sp_defense: 130,
            ability: "synchronize",
            moves: ["foulplay"],
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

    // On start_battle, run_switch_in triggers Imposter on p1a -> transforms into p2a (Snorlax)
    engine.start_battle();

    const state = engine.get_state();
    const ditto = state.p1.active[0];

    // Ditto in p1a should have transformed into p2a (snorlax)
    expect(ditto.species).toBe("snorlax");
    expect(ditto.attack).toBe(110);
    expect(ditto.defense).toBe(65);
    expect(ditto.hp).toBe(60); // Ditto's own HP preserved
    expect(ditto.ability).toBe("thickfat");
    expect(ditto.moves).toEqual(["bodyslam", "rest"]);
    expect(ditto.volatile_status).toContain("transform");
  });

  it("copies Libero/Protean without copying the activated flag, allowing transformed Ditto to activate Libero", () => {
    const engine = new Simulator();

    // Set p2a as Cinderace who already has Libero activated and changed type to Fighting
    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "ditto",
            type1: "Normal",
            hp: 60,
            maxhp: 60,
            speed: 200,
            attack: 48,
            defense: 48,
            sp_attack: 48,
            sp_defense: 48,
            ability: "imposter",
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
            species: "cinderace",
            type1: "Fighting", // Type changed by Libero previously
            hp: 150,
            maxhp: 150,
            speed: 119,
            attack: 116,
            defense: 75,
            sp_attack: 65,
            sp_defense: 75,
            ability: "libero",
            moves: ["highjumpkick", "pyroball"],
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

    const state = engine.get_state();
    const ditto = state.p1.active[0];

    // Ditto copies current changed type of target (Fighting)
    expect(ditto.type1).toBe("Fighting");
    expect(ditto.ability).toBe("libero");

    // Transformed Ditto uses Pyro Ball -> Libero should activate and change Ditto to Fire!
    engine.run_turn({
      p1a: "pyroball",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "highjumpkick",
      p2a_target: 1,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const afterTurnState = engine.get_state();
    const dittoAfterTurn = afterTurnState.p1.active[0];
    expect(dittoAfterTurn.type1).toBe("Fire");
  });
});
