use std::collections::BTreeMap;

/// 離散的なダメージ確率分布を表す構造体
#[derive(Debug, Clone, PartialEq)]
pub struct DamageDistribution {
    /// 各ダメージ値とその生起確率 (合計はおおよそ 1.0)
    pub distribution: BTreeMap<i32, f64>,
}

impl Default for DamageDistribution {
    fn default() -> Self {
        Self::new()
    }
}

impl DamageDistribution {
    pub fn new() -> Self {
        Self {
            distribution: BTreeMap::new(),
        }
    }

    /// 単一の確定ダメージから分布を作成
    pub fn constant(damage: i32) -> Self {
        let mut map = BTreeMap::new();
        map.insert(damage, 1.0);
        Self { distribution: map }
    }

    /// 16段階のダメージ乱数配列から一様分布を作成
    pub fn from_damage_rolls(rolls: &[i32]) -> Self {
        if rolls.is_empty() {
            return Self::constant(0);
        }
        let p = 1.0 / (rolls.len() as f64);
        let mut map = BTreeMap::new();
        for &d in rolls {
            *map.entry(d).or_insert(0.0) += p;
        }
        Self { distribution: map }
    }

    /// 2つの独立なダメージ事象の畳み込み (X + Y の分布)
    pub fn convolve(&self, other: &Self) -> Self {
        let mut combined = BTreeMap::new();
        for (&d1, &p1) in &self.distribution {
            for (&d2, &p2) in &other.distribution {
                *combined.entry(d1 + d2).or_insert(0.0) += p1 * p2;
            }
        }
        Self {
            distribution: combined,
        }
    }

    /// N回連続で同じ技を受けたときの累積ダメージ分布 (例: 2ターン、連続技など)
    pub fn convolve_n_times(&self, n: usize) -> Self {
        if n == 0 {
            return Self::constant(0);
        }
        let mut result = self.clone();
        for _ in 1..n {
            result = result.convolve(self);
        }
        result
    }

    /// 命中率 (0.0 ..= 1.0) を考慮した分布に合成 (外し = 0ダメージ)
    pub fn with_hit_rate(&self, hit_rate: f64) -> Self {
        let hit_rate = hit_rate.clamp(0.0, 1.0);
        let miss_rate = 1.0 - hit_rate;

        let mut map = BTreeMap::new();
        if miss_rate > 0.0 {
            map.insert(0, miss_rate);
        }

        for (&d, &p) in &self.distribution {
            *map.entry(d).or_insert(0.0) += p * hit_rate;
        }
        Self { distribution: map }
    }

    /// 急所時ダメージ分布と急所率 (例: 1/24) を合成
    pub fn with_crit(&self, crit_dist: &Self, crit_rate: f64) -> Self {
        let crit_rate = crit_rate.clamp(0.0, 1.0);
        let normal_rate = 1.0 - crit_rate;

        let mut map = BTreeMap::new();
        for (&d, &p) in &self.distribution {
            *map.entry(d).or_insert(0.0) += p * normal_rate;
        }
        for (&d, &p) in &crit_dist.distribution {
            *map.entry(d).or_insert(0.0) += p * crit_rate;
        }
        Self { distribution: map }
    }

    /// 指定した残りHPに対して、一撃で倒せる確率 (P(Damage >= hp))
    pub fn ko_chance(&self, hp: i32) -> f64 {
        if hp <= 0 {
            return 1.0;
        }
        self.distribution
            .iter()
            .filter(|&(d, _)| *d >= hp)
            .map(|(_, &p)| p)
            .sum::<f64>()
            .clamp(0.0, 1.0)
    }

    /// ダメージの期待値
    pub fn expected_damage(&self) -> f64 {
        self.distribution
            .iter()
            .map(|(&d, &p)| (d as f64) * p)
            .sum()
    }

    /// 最低ダメージと最大ダメージ
    pub fn range(&self) -> (i32, i32) {
        let min = self.distribution.keys().next().copied().unwrap_or(0);
        let max = self.distribution.keys().next_back().copied().unwrap_or(0);
        (min, max)
    }

    /// ダメージ乱数の「代表値化 (Deterministic Collapse)」
    /// 確定数が動かない局面は乱数分岐を潰して期待値1点とし、
    /// 確定数が動く局面のみ「撃破確率 / 生存確率」の2値ノードに縮約する
    pub fn evaluate_collapse(&self, current_hp: i32) -> DamageCollapse {
        if current_hp <= 0 {
            return DamageCollapse::DefiniteKill {
                expected_damage: self.expected_damage(),
            };
        }

        let (min_d, max_d) = self.range();

        if min_d >= current_hp {
            // 最低乱数でも倒せる -> 確定1発 (100% KO)
            DamageCollapse::DefiniteKill {
                expected_damage: self.expected_damage(),
            }
        } else if max_d < current_hp {
            // 最高乱数でも耐える -> 確定耐え (0% KO)
            DamageCollapse::DefiniteSurvive {
                expected_damage: self.expected_damage(),
            }
        } else {
            // 乱数1発のクリティカル閾値 (min_d < current_hp <= max_d)
            let ko_chance = self.ko_chance(current_hp);

            // 耐えた場合の条件付き期待ダメージ
            let (surviving_dmg_sum, surviving_prob_sum) = self
                .distribution
                .iter()
                .filter(|&(d, _)| *d < current_hp)
                .fold((0.0, 0.0), |(d_acc, p_acc), (&d, &p)| {
                    (d_acc + (d as f64) * p, p_acc + p)
                });

            let surviving_expected_damage = if surviving_prob_sum > 1e-9 {
                surviving_dmg_sum / surviving_prob_sum
            } else {
                0.0
            };

            DamageCollapse::CriticalThreshold {
                ko_chance,
                surviving_expected_damage,
            }
        }
    }
}

/// ダメージ乱数の代表値化結果
#[derive(Debug, Clone, PartialEq)]
pub enum DamageCollapse {
    /// 確定耐え: 乱数分岐を潰し、期待値ダメージ1点に集約
    DefiniteSurvive { expected_damage: f64 },
    /// 確定落ち: 乱数分岐を潰し、確定KOとして集約
    DefiniteKill { expected_damage: f64 },
    /// クリティカル閾値 (乱数1発): 乱数16通りを「撃破確率 P_ko / 生存側」の2値に縮約
    CriticalThreshold {
        ko_chance: f64,
        surviving_expected_damage: f64,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_damage_distribution_single_roll() {
        // 16段階の乱数
        let rolls: Vec<i32> = (85..=100).collect();
        let dist = DamageDistribution::from_damage_rolls(&rolls);

        assert_eq!(dist.range(), (85, 100));
        assert!((dist.expected_damage() - 92.5).abs() < 1e-6);

        // HP 85 なら確定1発 (100%)
        assert!((dist.ko_chance(85) - 1.0).abs() < 1e-6);
        // HP 101 なら耐え確定 (0%)
        assert!((dist.ko_chance(101) - 0.0).abs() < 1e-6);
        // HP 93 なら 93..=100 の 8通り -> 50%
        assert!((dist.ko_chance(93) - 0.5).abs() < 1e-6);
    }

    #[test]
    fn test_damage_distribution_convolution() {
        // 2発での撃破確率 (確定2発判定)
        let rolls: Vec<i32> = (85..=100).collect();
        let dist = DamageDistribution::from_damage_rolls(&rolls);
        let two_hits = dist.convolve(&dist);

        assert_eq!(two_hits.range(), (170, 200));
        assert!((two_hits.expected_damage() - 185.0).abs() < 1e-6);

        // HP 170 なら確定2発
        assert!((two_hits.ko_chance(170) - 1.0).abs() < 1e-6);
        // HP 200 なら最高乱数2回引く必要がある: (1/16) * (1/16) = 1/256
        assert!((two_hits.ko_chance(200) - (1.0 / 256.0)).abs() < 1e-6);
    }

    #[test]
    fn test_with_hit_rate_and_crit() {
        let dist = DamageDistribution::constant(100);
        let dist_with_hit = dist.with_hit_rate(0.85);

        assert!((dist_with_hit.expected_damage() - 85.0).abs() < 1e-6);
        assert!((dist_with_hit.ko_chance(100) - 0.85).abs() < 1e-6);

        let crit_dist = DamageDistribution::constant(150);
        let with_crit = dist.with_crit(&crit_dist, 1.0 / 24.0);
        let expected = 100.0 * (23.0 / 24.0) + 150.0 * (1.0 / 24.0);
        assert!((with_crit.expected_damage() - expected).abs() < 1e-6);
    }

    #[test]
    fn test_damage_collapse() {
        let rolls: Vec<i32> = (85..=100).collect();
        let dist = DamageDistribution::from_damage_rolls(&rolls);

        // 1. 確定耐え (HP 120 > 100): 乱数は潰して期待値 92.5
        match dist.evaluate_collapse(120) {
            DamageCollapse::DefiniteSurvive { expected_damage } => {
                assert!((expected_damage - 92.5).abs() < 1e-6);
            }
            _ => panic!("Expected DefiniteSurvive"),
        }

        // 2. 確定落ち (HP 80 <= 85): 乱数は潰して確定キル
        match dist.evaluate_collapse(80) {
            DamageCollapse::DefiniteKill { expected_damage } => {
                assert!((expected_damage - 92.5).abs() < 1e-6);
            }
            _ => panic!("Expected DefiniteKill"),
        }

        // 3. クリティカル閾値 (HP 93): 撃破確率 50%
        match dist.evaluate_collapse(93) {
            DamageCollapse::CriticalThreshold {
                ko_chance,
                surviving_expected_damage,
            } => {
                assert!((ko_chance - 0.5).abs() < 1e-6);
                // 耐えた場合 (85..=92 の8通り) の平均: (85 + 92) / 2 = 88.5
                assert!((surviving_expected_damage - 88.5).abs() < 1e-6);
            }
            _ => panic!("Expected CriticalThreshold"),
        }
    }
}
