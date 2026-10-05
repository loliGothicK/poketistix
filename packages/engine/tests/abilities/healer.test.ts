import { describe, it, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

describe("Ability: Healer", () => {
  it("cures status of ally at end of turn", () => {
    const engine = new Simulator({
      secondary: "always",
    });

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "audino",
            type1: "Normal",
            hp: 200,
            maxhp: 200,
            speed: 50,
            attack: 50,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            ability: "healer",
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
            status: "brn",
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
            attack: 50,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            ability: "thickfat",
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

    const logs = engine.run_turn({
      p1a: "sleeptalk",
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
          type: "Activate",
          target: { player: 1, slot: 0 },
          effect: "ability: Healer",
        }),
      ]),
    );

    const state = engine.get_state();
    expect(state.p1.active[1].status).toBeUndefined();
  });
});
