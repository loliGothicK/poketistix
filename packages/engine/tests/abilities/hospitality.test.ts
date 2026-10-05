import { describe, it, expect } from "vitest";
import { Simulator } from "../../pkg-node/engine.js";

describe("Ability: Hospitality", () => {
  it("restores 25% of ally's maximum HP on switch-in", () => {
    const engine = new Simulator();

    engine.set_state({
      p1: {
        active: [
          {
            ident: "p1a",
            species: "charizard",
            type1: "Fire",
            hp: 100,
            maxhp: 200,
            speed: 100,
            attack: 50,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            ability: "blaze",
          },
          {
            ident: "p1b",
            species: "sinistcha",
            type1: "Grass",
            type2: "Ghost",
            hp: 200,
            maxhp: 200,
            speed: 50,
            attack: 50,
            defense: 50,
            sp_attack: 50,
            sp_defense: 50,
            ability: "hospitality",
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

    const state = engine.get_state();
    // Charizard healed from 100 by 50 (200 / 4) to 150 HP
    expect(state.p1.active[0].hp).toBe(150);
  });
});
