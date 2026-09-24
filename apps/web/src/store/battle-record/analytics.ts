import { match } from "ts-pattern";
import type { BattleRecord } from "./battleRecord";
import type { TrainedPokemon } from "@/store/team/team";

/** 勝敗の集計結果 */
export interface RecordTally {
  readonly total: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  /** wins / total（0..1）。total===0 のとき 0 */
  readonly winRate: number;
}

const withWinRate = (wins: number, losses: number, draws: number): RecordTally => {
  const total = wins + losses + draws;
  return { total, wins, losses, draws, winRate: total === 0 ? 0 : wins / total };
};

/** 記録全体の勝敗を集計する */
export const tally = (records: readonly BattleRecord[]): RecordTally => {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const record of records) {
    match(record.result)
      .with("win", () => {
        wins += 1;
      })
      .with("loss", () => {
        losses += 1;
      })
      .with("draw", () => {
        draws += 1;
      })
      .exhaustive();
  }
  return withWinRate(wins, losses, draws);
};

/** 対面したポケモン1種ごとの成績 */
export interface OpponentStat extends RecordTally {
  readonly pokemonSlug: string;
}

/**
 * 対戦相手のポケモンごとに、そのポケモンが相手パーティに含まれていた試合の
 * 勝敗を集計する。登場試合数の多い順、同数なら勝率の高い順に並べる。
 */
export const opponentStats = (records: readonly BattleRecord[]): readonly OpponentStat[] => {
  const acc = new Map<string, { wins: number; losses: number; draws: number }>();

  for (const record of records) {
    // 同一試合内で同じ種が重複しても1回として数える
    const slugs = new Set(record.opponents.map((o) => o.pokemonSlug));
    for (const slug of slugs) {
      const current = acc.get(slug) ?? { wins: 0, losses: 0, draws: 0 };
      match(record.result)
        .with("win", () => {
          current.wins += 1;
        })
        .with("loss", () => {
          current.losses += 1;
        })
        .with("draw", () => {
          current.draws += 1;
        })
        .exhaustive();
      acc.set(slug, current);
    }
  }

  return Array.from(acc.entries())
    .map(([pokemonSlug, { wins, losses, draws }]) => ({
      pokemonSlug,
      ...withWinRate(wins, losses, draws),
    }))
    .sort((a, b) => b.total - a.total || b.winRate - a.winRate);
};

/** パーセント表記（整数）。total===0 のときは null（"—"表示用） */
export const winRatePercent = (t: RecordTally): number | null =>
  t.total === 0 ? null : Math.round(t.winRate * 100);

/** 時系列上の1試合分の累積勝率ポイント */
export interface WinRateTrendPoint {
  readonly recordId: string;
  readonly playedAt: string;
  readonly result: BattleRecord["result"];
  /** その試合までの累積勝率（%、整数）。0試合目は null */
  readonly cumulativeWinRate: number | null;
  readonly gameNumber: number;
}

/**
 * 対戦記録を playedAt 昇順に並べ、試合ごとの累積勝率を計算する。
 * ダッシュボードの推移ウィジェット（winRateTrend）向け。
 */
export const winRateTrend = (records: readonly BattleRecord[]): readonly WinRateTrendPoint[] => {
  const sorted = records
    .slice()
    .sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());

  let wins = 0;
  let total = 0;

  return sorted.map((record, index) => {
    match(record.result)
      .with("win", () => {
        wins += 1;
      })
      .with("loss", () => {})
      .with("draw", () => {})
      .exhaustive();
    total += 1;

    return {
      recordId: record.id,
      playedAt: record.playedAt,
      result: record.result,
      cumulativeWinRate: total === 0 ? null : Math.round((wins / total) * 100),
      gameNumber: index + 1,
    };
  });
};

/** レート推移の1点 */
export interface RatingTrendPoint {
  readonly recordId: string;
  readonly playedAt: string;
  readonly rating: number;
  readonly gameNumber: number;
}

/**
 * rating が記録されている試合だけを playedAt 昇順で抽出する。
 * ダッシュボードのレート推移ウィジェット（ratingTrend）向け。
 */
export const ratingTrend = (records: readonly BattleRecord[]): readonly RatingTrendPoint[] =>
  records
    .filter((r) => r.rating !== null)
    .slice()
    .sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime())
    .map((record, index) => ({
      recordId: record.id,
      playedAt: record.playedAt,
      rating: record.rating as number,
      gameNumber: index + 1,
    }));

/** 使用パーティ（チーム）ごとの成績 */
export interface TeamStat extends RecordTally {
  readonly teamId: string | null;
  readonly members: readonly TrainedPokemon[];
}

/**
 * 使用したチームごとの勝敗を集計する。
 * teamId がある場合は teamId ごと、null の場合はメンバー構成ごとに集計。
 * 試合数の多い順、同数なら勝率の高い順に並べる。
 */
export const teamStats = (records: readonly BattleRecord[]): readonly TeamStat[] => {
  const acc = new Map<
    string,
    {
      teamId: string | null;
      members: readonly TrainedPokemon[];
      wins: number;
      losses: number;
      draws: number;
    }
  >();

  for (const record of records) {
    const key =
      record.teamId ??
      (record.myTeam && record.myTeam.length > 0
        ? `custom:${record.myTeam
            .map((p) => p.identifier)
            .slice()
            .sort()
            .join(",")}`
        : "unassigned");

    const current = acc.get(key) ?? {
      teamId: record.teamId,
      members: record.myTeam ?? [],
      wins: 0,
      losses: 0,
      draws: 0,
    };

    if (current.members.length === 0 && record.myTeam && record.myTeam.length > 0) {
      current.members = record.myTeam;
    }

    match(record.result)
      .with("win", () => {
        current.wins += 1;
      })
      .with("loss", () => {
        current.losses += 1;
      })
      .with("draw", () => {
        current.draws += 1;
      })
      .exhaustive();

    acc.set(key, current);
  }

  return Array.from(acc.values())
    .map((item) => ({
      teamId: item.teamId,
      members: item.members,
      ...withWinRate(item.wins, item.losses, item.draws),
    }))
    .sort((a, b) => b.total - a.total || b.winRate - a.winRate);
};

/** 自チームの使用ポケモンごとの成績 */
export interface MyPokemonStat {
  readonly pokemonSlug: string;
  /** パーティ帯同試合数 */
  readonly rosterTotal: number;
  /** 帯同時の勝敗集計 */
  readonly rosterTally: RecordTally;
  /** 選出回数 */
  readonly selectedCount: number;
  /** 選出率 (selectedCount / rosterTotal)。rosterTotal===0 のとき 0 */
  readonly selectionRate: number;
  /** 選出時の勝敗集計 */
  readonly selectedTally: RecordTally;
}

/**
 * 自チームのポケモンごとに、帯同時および選出時の勝率を集計する。
 * 帯同試合数の多い順、同数なら選出率の高い順、勝率の高い順に並べる。
 */
export const myPokemonStats = (records: readonly BattleRecord[]): readonly MyPokemonStat[] => {
  const acc = new Map<
    string,
    {
      rosterWins: number;
      rosterLosses: number;
      rosterDraws: number;
      selectedWins: number;
      selectedLosses: number;
      selectedDraws: number;
      selectedCount: number;
    }
  >();

  for (const record of records) {
    if (!record.myTeam || record.myTeam.length === 0) continue;

    const selectedSet = new Set(
      record.mySelection && record.mySelection.length > 0 ? record.mySelection : [],
    );

    const seenInRecord = new Set<string>();

    record.myTeam.forEach((pokemon, index) => {
      const slug = pokemon.identifier;
      if (seenInRecord.has(slug)) return;
      seenInRecord.add(slug);

      const current = acc.get(slug) ?? {
        rosterWins: 0,
        rosterLosses: 0,
        rosterDraws: 0,
        selectedWins: 0,
        selectedLosses: 0,
        selectedDraws: 0,
        selectedCount: 0,
      };

      // 帯同時
      match(record.result)
        .with("win", () => {
          current.rosterWins += 1;
        })
        .with("loss", () => {
          current.rosterLosses += 1;
        })
        .with("draw", () => {
          current.rosterDraws += 1;
        })
        .exhaustive();

      // 選出時
      if (selectedSet.has(index)) {
        current.selectedCount += 1;
        match(record.result)
          .with("win", () => {
            current.selectedWins += 1;
          })
          .with("loss", () => {
            current.selectedLosses += 1;
          })
          .with("draw", () => {
            current.selectedDraws += 1;
          })
          .exhaustive();
      }

      acc.set(slug, current);
    });
  }

  return Array.from(acc.entries())
    .map(([pokemonSlug, data]) => {
      const rosterTally = withWinRate(data.rosterWins, data.rosterLosses, data.rosterDraws);
      const selectedTally = withWinRate(data.selectedWins, data.selectedLosses, data.selectedDraws);
      const selectionRate = rosterTally.total === 0 ? 0 : data.selectedCount / rosterTally.total;

      return {
        pokemonSlug,
        rosterTotal: rosterTally.total,
        rosterTally,
        selectedCount: data.selectedCount,
        selectionRate,
        selectedTally,
      };
    })
    .sort(
      (a, b) =>
        b.rosterTotal - a.rosterTotal ||
        b.selectionRate - a.selectionRate ||
        b.selectedTally.winRate - a.selectedTally.winRate,
    );
};
