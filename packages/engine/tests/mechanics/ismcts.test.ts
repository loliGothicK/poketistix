import { test, expect } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";
import { Simulator } from "../../pkg-node/engine.js";

test("ISMCTS: generates legal actions and performs search", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "pikachu", moves: ["thunderbolt", "quickattack"] }),
      pokemon({ species: "charizard", moves: ["flamethrower", "airslash"] }),
    ],
    [
      pokemon({ species: "blastoise", moves: ["surf", "icebeam"] }),
      pokemon({ species: "venusaur", moves: ["sludgebomb", "gigadrain"] }),
    ],
  );

  // 1. Legal actions
  const legalP1 = env.engine.get_legal_actions(1);
  expect(legalP1.actions.length).toBeGreaterThan(0);
  const firstAction = legalP1.actions[0];
  expect(firstAction.slot_a).toBeDefined();
  expect(firstAction.slot_b).toBeDefined();

  // 2. State evaluation
  const evalP1 = env.engine.evaluate_state(1);
  expect(evalP1).toBeGreaterThanOrEqual(0);
  expect(evalP1).toBeLessThanOrEqual(1);

  // 3. Search best action with ISMCTS
  const searchResult = env.engine.search_best_action(1, 50);
  expect(searchResult.total_simulations).toBe(50);
  expect(searchResult.win_rate).toBeGreaterThanOrEqual(0);
  expect(searchResult.win_rate).toBeLessThanOrEqual(1);
  expect(searchResult.best_action.slot_a.choice).toBeDefined();
  expect(searchResult.best_action.slot_b.choice).toBeDefined();
});

test("ISMCTS: Rotom-Analysis (ロトム解析) provides candidate rankings, win rates, PV lines, and mate detection", () => {
  const env = new TestEnvironment(
    [
      pokemon({ species: "pikachu", moves: ["thunderbolt", "quickattack"] }),
      pokemon({ species: "charizard", moves: ["flamethrower", "airslash"] }),
    ],
    [
      pokemon({ species: "blastoise", moves: ["surf", "icebeam"] }),
      pokemon({ species: "venusaur", moves: ["sludgebomb", "gigadrain"] }),
    ],
    { padTeam: false },
  );

  // Set opponent's HP to 1 so that attack options lead to an immediate forced win (詰め筋)
  const state = env.engine.get_state();
  state.p2.active[0].hp = 1;
  state.p2.active[1].hp = 1;
  env.engine.set_state(state);

  const analysis = env.engine.analyze_position(1, 100);

  expect(analysis.total_simulations).toBe(100);
  expect(analysis.candidates.length).toBeGreaterThan(0);

  // Top candidate should be evaluated as high win rate
  const topCandidate = analysis.candidates[0];
  expect(topCandidate.rank).toBe(1);
  expect(topCandidate.win_rate).toBeGreaterThanOrEqual(0.65);

  // Mate (詰め筋) should be detected among the top candidate lines
  const mateCandidate = analysis.candidates.find((c) => c.is_mate);
  expect(mateCandidate).toBeDefined();

  // Check that candidate moves have PV (読み筋) steps
  expect(topCandidate.pv).toBeDefined();
  if (topCandidate.pv.length > 0) {
    const step = topCandidate.pv[0];
    expect(step.turn).toBe(1);
    expect(step.p1_action).toBeDefined();
    expect(step.p2_action).toBeDefined();
  }
});

test("ISMCTS: Sucker Punch Mind Games (sucker-punch-mind-games.mdx) 3-turn forced win", () => {
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
          species: "whimsicott",
          hp: 35,
          maxhp: 135,
          speed: 184,
          attack: 80,
          defense: 105,
          sp_attack: 97,
          sp_defense: 95,
          type1: "Grass",
          type2: "Fairy",
          ability: "prankster",
          moves: ["encore", "substitute", "moonblast", "tailwind"],
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
          species: "kangaskhan-mega",
          hp: 40,
          maxhp: 180,
          speed: 167,
          attack: 145,
          defense: 120,
          sp_attack: 60,
          sp_defense: 120,
          type1: "Normal",
          ability: "parentalbond",
          item: "kangaskhanite",
          is_mega: true,
          boosts: { atk: 1, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
          moves: ["suckerpunch", "earthquake", "icepunch", "brickbreak"],
          last_move_used: "suckerpunch",
        },
      ],
      team: [],
      tailwind: false,
      tailwind_turns: 0,
      aurora_veil_turns: 0,
    },
  });

  engine.start_battle();

  const analysis = engine.analyze_position(1, 500);

  expect(analysis.candidates.length).toBeGreaterThan(0);

  // 1. Best move on Turn 1 MUST be Encore (locks Kangaskhan into Sucker Punch)
  const topCandidate = analysis.candidates[0];
  expect(topCandidate.rank).toBe(1);
  expect(topCandidate.action.slot_a.choice).toBe("encore");
  expect(topCandidate.is_mate).toBe(true);

  // 2. Direct Moonblast (attacking into Sucker Punch) must NOT be rank 1
  const moonblastCandidate = analysis.candidates.find(
    (c) => c.action.slot_a.choice === "moonblast",
  );
  if (moonblastCandidate) {
    expect(topCandidate.visits).toBeGreaterThan(moonblastCandidate.visits);
  }

  // 3. The 3-turn PV (Procedural Variation) starting with Encore:
  // Turn 1: encore
  // Turn 2: substitute
  // Turn 3: moonblast
  expect(topCandidate.pv.length).toBeGreaterThanOrEqual(3);
  expect(topCandidate.pv[0].p1_action.slot_a.choice).toBe("encore");
  expect(topCandidate.pv[1].p1_action.slot_a.choice).toBe("substitute");
  expect(topCandidate.pv[2].p1_action.slot_a.choice).toBe("moonblast");
});
