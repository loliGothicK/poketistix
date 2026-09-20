import { MAX_EV_PER_STAT, MAX_EV_TOTAL } from "@/store/team/lint";
import { calcHp, calcStatus } from "@/data/utility/training";

export type StatNatureKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export interface BulkOptimizationOptions {
  /**
   * 物理攻撃を受ける確率 (0.0 ~ 1.0)
   * デフォルトは 0.5 (物理 50 : 特殊 50)
   */
  physicalRatio?: number;
  /**
   * すでに振られている努力値の下限リスペクト (これ未満に削らない)
   */
  minEvs?: {
    hp?: number;
    def?: number;
    spd?: number;
  };
  /**
   * 性格補正を自動選択する場合の下方補正 (minus) の候補 ("atk" | "spa" | "spe")
   * デフォルトは "atk"
   */
  defaultMinus?: "atk" | "spa" | "spe";
  /**
   * 性格の上昇補正が未指定の場合に自動で防御または特防に性格補正を割り当てるか
   * デフォルトは true
   */
  optimizeNature?: boolean;
  /**
   * 防御の補正倍率 (1.0 = 通常, 1.5 = 1.5倍, 2.0 = 2倍 など)
   * デフォルトは 1.0
   */
  defMultiplier?: number;
  /**
   * 特防の補正倍率 (1.0 = 通常, 1.5 = 1.5倍, 2.0 = 2倍 など)
   * デフォルトは 1.0
   */
  spdMultiplier?: number;
}

export interface BulkOptimizationResult {
  evs: {
    hp: number;
    def: number;
    spd: number;
  };
  nature?: {
    plus?: string | null;
    minus?: string | null;
  };
  score: number;
}

function searchOptimalEvs(
  baseStats: { hp: number; def: number; spd: number },
  defNatureMultiplier: number,
  spdNatureMultiplier: number,
  defMultiplier: number,
  spdMultiplier: number,
  pool: number,
  minH: number,
  minB: number,
  minD: number,
  p: number,
): { evs: { hp: number; def: number; spd: number }; score: number; totalUsed: number } {
  let bestScore = -1;
  let bestEvs = { hp: minH, def: minB, spd: minD };
  let bestTotalUsed = Infinity;

  // Hの探索: minHからmin(pool - minB - minD, MAX_EV_PER_STAT)まで
  const maxH = Math.min(pool - minB - minD, MAX_EV_PER_STAT);
  for (let evH = minH; evH <= maxH; evH++) {
    const H = calcHp(baseStats.hp, evH);
    const remainingForBD = pool - evH;
    const maxB = Math.min(remainingForBD - minD, MAX_EV_PER_STAT);

    for (let evB = minB; evB <= maxB; evB++) {
      const remainingForD = remainingForBD - evB;
      const maxD = Math.min(remainingForD, MAX_EV_PER_STAT);

      for (let evD = minD; evD <= maxD; evD++) {
        const B = calcStatus(baseStats.def, evB, defNatureMultiplier);
        const D = calcStatus(baseStats.spd, evD, spdNatureMultiplier);
        const effB = Math.floor(B * defMultiplier);
        const effD = Math.floor(D * spdMultiplier);

        let score = 0;
        if (p === 1) {
          score = H * effB;
        } else if (p === 0) {
          score = H * effD;
        } else {
          // (H * effB * effD) / (p * effD + (1 - p) * effB)
          score = (H * effB * effD) / (p * effD + (1 - p) * effB);
        }

        const totalUsed = evH + evB + evD;

        if (score > bestScore + 1e-9) {
          bestScore = score;
          bestEvs = { hp: evH, def: evB, spd: evD };
          bestTotalUsed = totalUsed;
        } else if (Math.abs(score - bestScore) <= 1e-9) {
          if (totalUsed < bestTotalUsed) {
            bestScore = score;
            bestEvs = { hp: evH, def: evB, spd: evD };
            bestTotalUsed = totalUsed;
          }
        }
      }
    }
  }

  return {
    evs: bestEvs,
    score: bestScore,
    totalUsed: bestTotalUsed,
  };
}

/**
 * firefly1987氏の理論に基づく耐久指数最大化配分を算出する
 *
 * 総合耐久指数(p):
 *   p = 1.0 (物理特化): H * B
 *   p = 0.0 (特殊特化): H * D
 *   0 < p < 1: H / (p / B + (1 - p) / D) = (H * B * D) / (p * D + (1 - p) * B)
 */
export function optimizeBulk(
  baseStats: { hp: number; def: number; spd: number },
  nature: { plus?: string | null; minus?: string | null },
  availableEvPool: number,
  options?: BulkOptimizationOptions,
): BulkOptimizationResult {
  const p = Math.max(0, Math.min(1, options?.physicalRatio ?? 0.5));
  const pool = Math.max(0, Math.min(MAX_EV_TOTAL, availableEvPool));

  const minH = Math.max(0, Math.min(MAX_EV_PER_STAT, options?.minEvs?.hp ?? 0));
  const minB = Math.max(0, Math.min(MAX_EV_PER_STAT, options?.minEvs?.def ?? 0));
  const minD = Math.max(0, Math.min(MAX_EV_PER_STAT, options?.minEvs?.spd ?? 0));

  const defMult = options?.defMultiplier && options.defMultiplier > 0 ? options.defMultiplier : 1.0;
  const spdMult = options?.spdMultiplier && options.spdMultiplier > 0 ? options.spdMultiplier : 1.0;

  const isNaturePlusSpecified = Boolean(nature.plus);
  const shouldOptimizeNature = !isNaturePlusSpecified && (options?.optimizeNature ?? true);

  if (!shouldOptimizeNature) {
    const defNatureMultiplier = nature.plus === "def" ? 1.1 : nature.minus === "def" ? 0.9 : 1.0;
    const spdNatureMultiplier = nature.plus === "spd" ? 1.1 : nature.minus === "spd" ? 0.9 : 1.0;

    const result = searchOptimalEvs(
      baseStats,
      defNatureMultiplier,
      spdNatureMultiplier,
      defMult,
      spdMult,
      pool,
      minH,
      minB,
      minD,
      p,
    );
    return {
      evs: result.evs,
      nature: {
        plus: nature.plus ?? null,
        minus: nature.minus ?? null,
      },
      score: result.score,
    };
  }

  // 性格の上昇補正が未指定の場合、防御 (def) または特防 (spd) のどちらに補正をかけるべきかを評価
  const effectiveMinus: string =
    nature.minus && nature.minus !== "def" && nature.minus !== "spd" && nature.minus !== "hp"
      ? nature.minus
      : (options?.defaultMinus ?? "atk");

  // Def+ 候補
  const candDef = searchOptimalEvs(
    baseStats,
    1.1,
    1.0,
    defMult,
    spdMult,
    pool,
    minH,
    minB,
    minD,
    p,
  );
  const natureDef = { plus: "def", minus: effectiveMinus };

  // SpD+ 候補
  const candSpd = searchOptimalEvs(
    baseStats,
    1.0,
    1.1,
    defMult,
    spdMult,
    pool,
    minH,
    minB,
    minD,
    p,
  );
  const natureSpd = { plus: "spd", minus: effectiveMinus };

  let chosen = candDef;
  let chosenNature: { plus: string; minus: string | null } = natureDef;

  if (candSpd.score > candDef.score + 1e-9) {
    chosen = candSpd;
    chosenNature = natureSpd;
  } else if (Math.abs(candSpd.score - candDef.score) <= 1e-9) {
    if (candSpd.totalUsed < candDef.totalUsed) {
      chosen = candSpd;
      chosenNature = natureSpd;
    } else if (candDef.totalUsed < candSpd.totalUsed) {
      chosen = candDef;
      chosenNature = natureDef;
    } else if (p < 0.5) {
      chosen = candSpd;
      chosenNature = natureSpd;
    } else {
      chosen = candDef;
      chosenNature = natureDef;
    }
  }

  return {
    evs: chosen.evs,
    nature: chosenNature,
    score: chosen.score,
  };
}
