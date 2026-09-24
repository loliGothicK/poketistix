import { describe, expect, it } from "vitest";
import { myPokemonStats, tally, teamStats, winRatePercent } from "./analytics";
import type { BattleRecord } from "./battleRecord";
import type { TrainedPokemon } from "@/store/team/team";

const makePokemon = (identifier: string): TrainedPokemon =>
  ({
    identifier,
  }) as unknown as TrainedPokemon;

const makeRecord = (overrides: Partial<BattleRecord>): BattleRecord => ({
  id: "rec-1",
  seasonId: "season-1",
  teamId: null,
  result: "win",
  myTeam: [],
  mySelection: null,
  rating: null,
  notes: null,
  playedAt: new Date().toISOString(),
  opponents: [],
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("tally", () => {
  it("counts wins, losses, draws and calculates winRate", () => {
    const records = [
      makeRecord({ result: "win" }),
      makeRecord({ result: "win" }),
      makeRecord({ result: "loss" }),
      makeRecord({ result: "draw" }),
    ];
    const result = tally(records);
    expect(result.total).toBe(4);
    expect(result.wins).toBe(2);
    expect(result.losses).toBe(1);
    expect(result.draws).toBe(1);
    expect(result.winRate).toBe(0.5);
    expect(winRatePercent(result)).toBe(50);
  });
});

describe("teamStats", () => {
  it("aggregates wins and losses by teamId", () => {
    const teamA = [makePokemon("garchomp"), makePokemon("zapdos")];
    const teamB = [makePokemon("charizard")];

    const records = [
      makeRecord({ teamId: "team-1", myTeam: teamA, result: "win" }),
      makeRecord({ teamId: "team-1", myTeam: teamA, result: "win" }),
      makeRecord({ teamId: "team-1", myTeam: teamA, result: "loss" }),
      makeRecord({ teamId: "team-2", myTeam: teamB, result: "loss" }),
    ];

    const stats = teamStats(records);
    expect(stats).toHaveLength(2);

    const statTeam1 = stats.find((s) => s.teamId === "team-1")!;
    expect(statTeam1.total).toBe(3);
    expect(statTeam1.wins).toBe(2);
    expect(statTeam1.losses).toBe(1);
    expect(statTeam1.winRate).toBeCloseTo(2 / 3);
    expect(statTeam1.members).toEqual(teamA);

    const statTeam2 = stats.find((s) => s.teamId === "team-2")!;
    expect(statTeam2.total).toBe(1);
    expect(statTeam2.wins).toBe(0);
    expect(statTeam2.losses).toBe(1);
  });

  it("handles records with null teamId grouped by pokemon composition", () => {
    const teamA = [makePokemon("garchomp")];
    const records = [
      makeRecord({ teamId: null, myTeam: teamA, result: "win" }),
      makeRecord({ teamId: null, myTeam: teamA, result: "draw" }),
    ];
    const stats = teamStats(records);
    expect(stats).toHaveLength(1);
    expect(stats[0].total).toBe(2);
    expect(stats[0].wins).toBe(1);
    expect(stats[0].draws).toBe(1);
  });
});

describe("myPokemonStats", () => {
  it("aggregates roster total, selection rate, and win rate when selected", () => {
    const garchomp = makePokemon("garchomp");
    const zapdos = makePokemon("zapdos");
    const heatran = makePokemon("heatran");
    const myTeam = [garchomp, zapdos, heatran]; // index 0: garchomp, 1: zapdos, 2: heatran

    const records = [
      // Game 1: Win. Selected garchomp (0) and zapdos (1)
      makeRecord({ myTeam, mySelection: [0, 1], result: "win" }),
      // Game 2: Loss. Selected garchomp (0) and heatran (2)
      makeRecord({ myTeam, mySelection: [0, 2], result: "loss" }),
      // Game 3: Win. Selected zapdos (1) and heatran (2) (garchomp benched)
      makeRecord({ myTeam, mySelection: [1, 2], result: "win" }),
    ];

    const stats = myPokemonStats(records);
    expect(stats).toHaveLength(3);

    // Garchomp: in 3 games, selected in 2 games (games 1 & 2 -> 1 win, 1 loss)
    const garchompStat = stats.find((s) => s.pokemonSlug === "garchomp")!;
    expect(garchompStat.rosterTotal).toBe(3);
    expect(garchompStat.rosterTally.wins).toBe(2); // games 1 & 3 won
    expect(garchompStat.selectedCount).toBe(2);
    expect(garchompStat.selectionRate).toBeCloseTo(2 / 3);
    expect(garchompStat.selectedTally.total).toBe(2);
    expect(garchompStat.selectedTally.wins).toBe(1);
    expect(garchompStat.selectedTally.losses).toBe(1);
    expect(garchompStat.selectedTally.winRate).toBe(0.5);

    // Zapdos: in 3 games, selected in 2 games (games 1 & 3 -> 2 wins, 0 losses)
    const zapdosStat = stats.find((s) => s.pokemonSlug === "zapdos")!;
    expect(zapdosStat.rosterTotal).toBe(3);
    expect(zapdosStat.selectedCount).toBe(2);
    expect(zapdosStat.selectedTally.wins).toBe(2);
    expect(zapdosStat.selectedTally.losses).toBe(0);
    expect(zapdosStat.selectedTally.winRate).toBe(1);
  });
});
