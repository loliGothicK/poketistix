/// 低不一致列 (Low-Discrepancy Sequence) を用いた準モンテカルロ法 (Quasi-Monte Carlo) サンプラー
/// 擬似乱数 (PRNG) と異なり、多次元の確率空間 (命中・急所・ダメージ乱数・追加効果) を
/// 偏りなく均等に散布することで、O(1/N) に迫る高速収束を実現します。

/// 基数 b に対する Van der Corput 根数逆変換 (Radical Inverse)
pub fn radical_inverse(mut n: usize, base: usize) -> f64 {
    let mut val = 0.0;
    let mut factor = 1.0 / (base as f64);
    let inv_base = factor;

    while n > 0 {
        let remainder = n % base;
        val += (remainder as f64) * factor;
        factor *= inv_base;
        n /= base;
    }
    val
}

/// 素数基数リスト (多次元 Halton 列用)
const PRIMES: [usize; 16] = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53];

/// 多次元 Halton 列生成器
#[derive(Debug, Clone)]
pub struct HaltonSequence {
    dim: usize,
    index: usize,
}

impl HaltonSequence {
    pub fn new(dim: usize) -> Self {
        assert!(
            dim <= PRIMES.len(),
            "Dimension exceeds maximum supported primes"
        );
        Self { dim, index: 1 }
    }

    /// 次の多次元低不一致点 [u_0, u_1, ..., u_{dim-1}] を取得 (各要素は [0, 1) の範囲)
    pub fn next_point(&mut self) -> Vec<f64> {
        let pt: Vec<f64> = (0..self.dim)
            .map(|d| radical_inverse(self.index, PRIMES[d]))
            .collect();
        self.index += 1;
        pt
    }

    /// n 番目の多次元点を直接計算 (1-indexed)
    pub fn point_at(n: usize, dim: usize) -> Vec<f64> {
        assert!(dim <= PRIMES.len());
        (0..dim).map(|d| radical_inverse(n, PRIMES[d])).collect()
    }
}

/// ラテン超方格法 (Latin Hypercube Sampling: LHS)
/// 与えられたサンプル数 N と次元数 D に対し、各軸の区間 [k/N, (k+1)/N) から
/// ちょうど1回ずつ直交するように均等サンプル点を配置する
pub struct LatinHypercubeSampler;

impl LatinHypercubeSampler {
    /// N 個の D 次元均等サンプル点列を生成する
    /// `permute_seed` を用いて決定論的または層化シャッフルを行う
    pub fn sample(samples: usize, dim: usize) -> Vec<Vec<f64>> {
        if samples == 0 || dim == 0 {
            return Vec::new();
        }

        let mut result = vec![vec![0.0; dim]; samples];
        let step = 1.0 / (samples as f64);

        for d in 0..dim {
            // 各区間の中央値 (グリッドセンター) を配置
            let intervals: Vec<f64> = (0..samples).map(|i| (i as f64 + 0.5) * step).collect();

            // 次元ごとに異なる決定論的置換 (Fisher-Yates shuffle with deterministic LCG)
            let mut perm: Vec<usize> = (0..samples).collect();
            let mut rng_state = (d as u64 + 1)
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            for i in (1..samples).rev() {
                rng_state = rng_state
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                let j = (rng_state as usize) % (i + 1);
                perm.swap(i, j);
            }

            for i in 0..samples {
                result[i][d] = intervals[perm[i]];
            }
        }

        result
    }
}

/// ポケモン1ターンの確率要素を低不一致点からマッピングする構造体
#[derive(Debug, Clone, PartialEq)]
pub struct BattleChanceEvent {
    /// 命中判定用乱数 [0, 1) (技の命中率 P_hit >= hit_roll なら命中)
    pub hit_roll: f64,
    /// 急所判定用乱数 [0, 1) (急所率 P_crit >= crit_roll なら急所)
    pub crit_roll: f64,
    /// ダメージ乱数インデックス (0..=15: 0.85 〜 1.00 の16段階)
    pub damage_roll_index: usize,
    /// 追加効果・状態異常判定用乱数 [0, 1)
    pub secondary_effect_roll: f64,
}

impl BattleChanceEvent {
    /// 4次元の低不一致点 [u0, u1, u2, u3] から事象へマッピング
    pub fn from_point(pt: &[f64]) -> Self {
        let hit_roll = pt.first().copied().unwrap_or(0.5);
        let crit_roll = pt.get(1).copied().unwrap_or(0.5);
        let dmg_u = pt.get(2).copied().unwrap_or(0.5);
        let secondary_roll = pt.get(3).copied().unwrap_or(0.5);

        // [0, 1) を 16段階 (0..=15) の離散一様インデックスへ均等マップ
        let damage_roll_index = ((dmg_u * 16.0).floor() as usize).min(15);

        Self {
            hit_roll,
            crit_roll,
            damage_roll_index,
            secondary_effect_roll: secondary_roll,
        }
    }

    /// ラテン超方格法で N 個の均等バトル事象サンプルを生成
    pub fn generate_stratified_events(count: usize) -> Vec<Self> {
        let points = LatinHypercubeSampler::sample(count, 4);
        points.into_iter().map(|pt| Self::from_point(&pt)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_radical_inverse_base2() {
        // 1 = 0b1 => 0.1_2 = 0.5
        assert_eq!(radical_inverse(1, 2), 0.5);
        // 2 = 0b10 => 0.01_2 = 0.25
        assert_eq!(radical_inverse(2, 2), 0.25);
        // 3 = 0b11 => 0.11_2 = 0.75
        assert_eq!(radical_inverse(3, 2), 0.75);
    }

    #[test]
    fn test_halton_sequence_spread() {
        let mut halton = HaltonSequence::new(2);
        let mut pts = Vec::new();
        for _ in 0..8 {
            pts.push(halton.next_point());
        }

        // 全ての点が [0, 1) に収まり、重なり（不一致）がない
        for pt in &pts {
            assert!(pt[0] >= 0.0 && pt[0] < 1.0);
            assert!(pt[1] >= 0.0 && pt[1] < 1.0);
        }
    }

    #[test]
    fn test_latin_hypercube_sample() {
        let n = 16;
        let dim = 4;
        let samples = LatinHypercubeSampler::sample(n, dim);
        assert_eq!(samples.len(), n);

        // 各次元について、16個の区間 [k/16, (k+1)/16) にちょうど1点ずつ入っていることを確認
        for d in 0..dim {
            let mut bucket_counts = vec![0; n];
            for row in &samples {
                let bucket = ((row[d] * n as f64).floor() as usize).min(n - 1);
                bucket_counts[bucket] += 1;
            }
            for count in bucket_counts {
                assert_eq!(
                    count, 1,
                    "Dimension {d} should have exactly 1 sample per stratum"
                );
            }
        }
    }

    #[test]
    fn test_stratified_battle_events() {
        let events = BattleChanceEvent::generate_stratified_events(16);
        assert_eq!(events.len(), 16);

        // 16個のサンプルで、16段階のダメージ乱数インデックス (0..15) が網羅的に分散されていること
        let mut damage_indices: Vec<usize> = events.iter().map(|e| e.damage_roll_index).collect();
        damage_indices.sort_unstable();
        // 重複なく 0..15 が全カバーされる
        let expected: Vec<usize> = (0..16).collect();
        assert_eq!(damage_indices, expected);
    }
}
