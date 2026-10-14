use crate::sim::battle::Battle;
use crate::solver::evaluator::evaluate_for_player;
use crate::solver::gto_solver::GtoSolver;
use crate::solver::ismcts::step_turn;
use crate::solver::legal_actions::{PlayerAction, get_player_actions};

/// ハイブリッド同時手番探索エンジンの設定
#[derive(Clone, Debug)]
pub struct ExpectiEngineConfig {
    /// 確率分岐（命中・急所など）に対する決定論的サンプリング数 (1〜5程度で十分)
    pub chance_samples_per_pair: usize,
    /// 探索する先読みターン数 (デフォルト: 1ターン＝局所ナッシュ均衡)
    pub depth: usize,
}

impl Default for ExpectiEngineConfig {
    fn default() -> Self {
        Self {
            chance_samples_per_pair: 3,
            depth: 1,
        }
    }
}

/// 各行動候補の評価結果
#[derive(Clone, Debug)]
pub struct EvaluatedAction {
    pub action: PlayerAction,
    /// ナッシュ均衡における最適選択確率 (0.0 ..= 1.0)
    pub probability: f64,
}

/// ハイブリッド探索エンジンの出力結果
#[derive(Clone, Debug)]
pub struct ExpectiResult {
    /// 最適選択確率が最も高い最善手
    pub best_action: PlayerAction,
    /// 盤面の期待勝率 / 利得評価 (0.0 ..= 1.0)
    pub expected_value: f64,
    /// P1 (自分) の全合法手とその混合戦略確率
    pub p1_candidates: Vec<EvaluatedAction>,
    /// P2 (相手) の予測戦略
    pub p2_candidates: Vec<EvaluatedAction>,
    /// 計算された利得行列
    pub payoff_matrix: Vec<Vec<f64>>,
}

pub struct ExpectiEngine {
    pub config: ExpectiEngineConfig,
}

impl ExpectiEngine {
    pub fn new(config: ExpectiEngineConfig) -> Self {
        Self { config }
    }

    /// 現在のバトル状態から、同時手番ナッシュ均衡に基づいた最適行動を計算する
    pub fn search(&self, battle: &Battle, player: usize) -> Option<ExpectiResult> {
        let p1_actions = get_player_actions(battle, 1);
        let p2_actions = get_player_actions(battle, 2);

        if p1_actions.is_empty() || p2_actions.is_empty() {
            return None;
        }

        let m = p1_actions.len();
        let n = p2_actions.len();
        let mut payoff_matrix = vec![vec![0.0; n]; m];

        // 各行動ペア (p1_act, p2_act) について、期待利得を評価
        for (i, p1_act) in p1_actions.iter().enumerate() {
            for (j, p2_act) in p2_actions.iter().enumerate() {
                let mut sum_score = 0.0;
                let samples = self.config.chance_samples_per_pair.max(1);

                for _ in 0..samples {
                    let mut sim_battle = battle.clone();
                    if step_turn(&mut sim_battle, p1_act, p2_act).is_ok() {
                        // P1 (最大化側) 視点の評価スコア [0.0, 1.0]
                        let score = evaluate_for_player(&sim_battle, 1);
                        sum_score += score;
                    } else {
                        // 進行エラー等のペナルティ
                        sum_score += 0.5;
                    }
                }

                payoff_matrix[i][j] = sum_score / (samples as f64);
            }
        }

        // 線形計画法 (LP) で同時手番 GTO / ナッシュ均衡を解く
        let eq = GtoSolver::solve(&payoff_matrix)?;

        // P1 の各候補手の確率
        let mut p1_candidates: Vec<EvaluatedAction> = p1_actions
            .into_iter()
            .zip(eq.p1_strategy.iter())
            .map(|(action, &prob)| EvaluatedAction {
                action,
                probability: prob,
            })
            .collect();

        // P2 の各候補手の確率
        let mut p2_candidates: Vec<EvaluatedAction> = p2_actions
            .into_iter()
            .zip(eq.p2_strategy.iter())
            .map(|(action, &prob)| EvaluatedAction {
                action,
                probability: prob,
            })
            .collect();

        // 確率の降順でソート
        p1_candidates.sort_by(|a, b| {
            b.probability
                .partial_cmp(&a.probability)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        p2_candidates.sort_by(|a, b| {
            b.probability
                .partial_cmp(&a.probability)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // プレイヤー視点に応じた最善手
        let best_action = if player == 1 {
            p1_candidates.first()?.action.clone()
        } else {
            p2_candidates.first()?.action.clone()
        };

        let expected_value = if player == 1 {
            eq.game_value
        } else {
            1.0 - eq.game_value
        };

        Some(ExpectiResult {
            best_action,
            expected_value,
            p1_candidates,
            p2_candidates,
            payoff_matrix,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::battle::Battle;
    use crate::wasm_api::{InputPokemonData, build_pokemon};

    fn make_test_pokemon(
        ident: &str,
        species: &str,
        moves: Vec<&str>,
    ) -> crate::sim::pokemon::Pokemon {
        build_pokemon(&InputPokemonData {
            ident: ident.to_string(),
            species: species.to_string(),
            hp: 100,
            maxhp: 100,
            speed: 100,
            attack: 100,
            defense: 100,
            sp_attack: 100,
            sp_defense: 100,
            moves: moves.into_iter().map(String::from).collect(),
            type1: "Normal".to_string(),
            ..Default::default()
        })
    }

    fn make_test_battle() -> Battle {
        let mut battle = Battle::new();
        battle.p1.active.push(make_test_pokemon(
            "p1a",
            "pikachu",
            vec!["thunderbolt", "quickattack"],
        ));
        battle.p1.active.push(make_test_pokemon(
            "p1b",
            "charizard",
            vec!["flamethrower", "airslash"],
        ));
        battle
            .p1
            .team
            .push(make_test_pokemon("p1c", "raichu", vec!["thunderbolt"]));

        battle.p2.active.push(make_test_pokemon(
            "p2a",
            "blastoise",
            vec!["surf", "icebeam"],
        ));
        battle.p2.active.push(make_test_pokemon(
            "p2b",
            "venusaur",
            vec!["sludgebomb", "gigadrain"],
        ));
        battle
            .p2
            .team
            .push(make_test_pokemon("p2c", "wartortle", vec!["surf"]));
        battle
    }

    #[test]
    fn test_expecti_engine_search() {
        let battle = make_test_battle();
        let engine = ExpectiEngine::new(ExpectiEngineConfig {
            chance_samples_per_pair: 2,
            depth: 1,
        });

        let result = engine
            .search(&battle, 1)
            .expect("Should compute expecti search");

        assert!(!result.p1_candidates.is_empty());
        assert!(!result.p2_candidates.is_empty());
        assert!(result.expected_value >= 0.0 && result.expected_value <= 1.0);

        // 確率の合計は 1.0
        let p1_prob_sum: f64 = result.p1_candidates.iter().map(|c| c.probability).sum();
        let p2_prob_sum: f64 = result.p2_candidates.iter().map(|c| c.probability).sum();
        assert!((p1_prob_sum - 1.0).abs() < 1e-3);
        assert!((p2_prob_sum - 1.0).abs() < 1e-3);

        // 最善手の選択確率が最も高い
        assert!(
            result.p1_candidates[0].probability >= result.p1_candidates.last().unwrap().probability
        );
    }
}
