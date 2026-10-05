import { describe, it, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

describe("Ability: Emergency Exit", () => {
  it("forces the Pokémon to switch out when its HP drops to 50% or below", () => {
    const engine = new Simulator({
      damage_roll: "max",
    });

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "golisopod",
            type1: "Bug",
            type2: "Water",
            hp: 170,
            maxhp: 200,
            speed: 40,
            attack: 100,
            defense: 100,
            sp_attack: 50,
            sp_defense: 100,
            ability: "emergencyexit",
          },
          {
            ident: "p1b",
            species: "charizard",
            type1: "Fire",
            hp: 200,
            maxhp: 200,
            speed: 100,
            attack: 50,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            ability: "blaze",
          },
        ],
        team: [
          {
            ident: "p1c",
            species: "pikachu",
            type1: "Electric",
            hp: 150,
            maxhp: 150,
            speed: 90,
            attack: 50,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            ability: "static",
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
            speed: 200,
            attack: 150,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            ability: "immunity",
          },
          {
            ident: "p2b",
            species: "umbreon",
            type1: "Dark",
            hp: 200,
            maxhp: 200,
            speed: 30,
            attack: 50,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            ability: "synchronize",
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

    // Turn 1: Snorlax uses a strong attack on Golisopod -> HP drops below 50% -> Emergency Exit triggers
    const logs1 = engine.run_turn({
      p1a: "sleeptalk",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "bodyslam",
      p2a_target: 0,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const events1 = logs1.events.map((e) => e.event);
    expect(events1).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Activate",
          effect: "ability: Emergency Exit",
        }),
        expect.objectContaining({
          type: "Drag",
        }),
      ]),
    );

    // Golisopod switched out and Pikachu is now in slot 0
    const state = engine.get_state();
    expect(state.p1.active[0].species).toBe("pikachu");
  });
});
