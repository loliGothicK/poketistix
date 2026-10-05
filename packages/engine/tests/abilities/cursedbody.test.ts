import { describe, it, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

describe("Ability: Cursed Body", () => {
  it("disables a damaging move used against the Pokémon", () => {
    const engine = new Simulator({
      damage_roll: "max",
      secondary: "always",
    });

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "gengar",
            type1: "Ghost",
            type2: "Poison",
            hp: 200,
            maxhp: 200,
            speed: 100,
            attack: 50,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            ability: "cursedbody",
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
            speed: 200,
            attack: 50,
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
            speed: 50,
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

    // Turn 1: Snorlax uses Bite on Gengar -> Cursed Body activates
    const logs1 = engine.run_turn({
      p1a: "sleeptalk",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "bite",
      p2a_target: 0, // Snorlax hits Gengar (p1a is slot 0)
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const events1 = logs1.events.map((e) => e.event);
    expect(events1).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Ability",
          ability: "Cursed Body",
        }),
        expect.objectContaining({
          type: "Start",
          effect: "Disable|bite",
        }),
      ]),
    );

    // Turn 2: Snorlax tries to use Bite again -> fails with Cant (Disable)
    const logs2 = engine.run_turn({
      p1a: "sleeptalk",
      p1a_target: 0,
      p1b: "sleeptalk",
      p1b_target: 0,
      p2a: "bite",
      p2a_target: 0,
      p2b: "sleeptalk",
      p2b_target: 0,
    });

    const events2 = logs2.events.map((e) => e.event);
    expect(events2).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Cant",
          reason: "Disable",
          move_id: "bite",
        }),
      ]),
    );
  });
});
