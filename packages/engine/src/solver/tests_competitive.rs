//! 実戦的な対戦環境 (VGCダブルバトル) に基づく AI・アルゴリズム検証テスト

use crate::sim::battle::Battle;
use crate::solver::damage_distribution::{DamageCollapse, DamageDistribution};
use crate::solver::expecti_engine::{ExpectiEngine, ExpectiEngineConfig};
use crate::solver::gto_solver::GtoSolver;
use crate::solver::quasi_random::BattleChanceEvent;
use crate::wasm_api::{InputPokemonData, build_pokemon};
use damage_calc::calculate_input;
use damage_calc::types::{DamageInput, Type};

fn make_pokemon(
    ident: &str,
    species: &str,
    hp: i32,
    maxhp: i32,
    speed: i32,
    moves: Vec<&str>,
    type1: &str,
) -> crate::sim::pokemon::Pokemon {
    build_pokemon(&InputPokemonData {
        ident: ident.to_string(),
        species: species.to_string(),
        hp,
        maxhp,
        speed,
        attack: 100,
        defense: 100,
        sp_attack: 100,
        sp_defense: 100,
        moves: moves.into_iter().map(String::from).collect(),
        type1: type1.to_string(),
        ..Default::default()
    })
}

/// 【実戦テスト1: ダブルバトルの「まもる」集中砲火択におけるナッシュ均衡】
/// 瀕死寸前のアタッカーが「まもる」を押すか攻撃を通すか、相手側が集中するか隣を狙うかの択。
/// ミニマックスだと「相手に全て読まれて100%攻撃が通らない」と判断してしまうが、
/// ナッシュ均衡ソルバーは「まもる」と「攻撃」を適切な混合戦略比率で選ぶことを検証する。
#[test]
fn test_double_battle_protect_mindgame_nash() {
    // 2x2 の択:
    // P1 (自分): 行0 = エースが攻撃, 行1 = エースが「まもる」
    // P2 (相手): 列0 = エースを集中攻撃, 列1 = 隣のサポートを攻撃
    //
    // 利得設定 (P1視点):
    // (攻撃, 集中) -> エースが先制撃破され大損害 (-0.8)
    // (攻撃, 隣狙い) -> エースの攻撃が通り有利 (+0.7)
    // (まもる, 集中) -> 相手の2体の攻撃を完全無効化し大有利 (+0.8)
    // (まもる, 隣狙い) -> エースは無駄まもる、隣が被弾し不利 (-0.3)
    let payoff_matrix = vec![
        vec![-0.8, 0.7], // 攻撃
        vec![0.8, -0.3], // まもる
    ];

    let eq = GtoSolver::solve(&payoff_matrix).expect("Should solve protect mindgame");

    // どちらか一方に100%偏る（純粋戦略）のではなく、
    // まもる（行1）と攻撃（行0）の両方に 0 < P < 1 の確率が割り振られることを検証
    let p_attack = eq.p1_strategy[0];
    let p_protect = eq.p1_strategy[1];

    assert!(
        p_attack > 0.2 && p_attack < 0.8,
        "攻撃の選択確率は実戦的な混合比率になるべき (実際: {p_attack})"
    );
    assert!(
        p_protect > 0.2 && p_protect < 0.8,
        "まもるの選択確率は実戦的な混合比率になるべき (実際: {p_protect})"
    );
    assert!((p_attack + p_protect - 1.0).abs() < 1e-6, "確率合計は1.0");

    // 相手側 (P2) も集中狙いと隣狙いを適切に散らす
    let p2_focus = eq.p2_strategy[0];
    let p2_split = eq.p2_strategy[1];
    assert!(p2_focus > 0.2 && p2_focus < 0.8);
    assert!(p2_split > 0.2 && p2_split < 0.8);
}

/// 【実戦テスト2: 実ダメージ計算ロジックと確定数判定（代表値化）の統合】
/// 実際の damage_calc パッケージの16段階ダメージ計算結果を直接流し込み、
/// 確定耐え・乱数1発・確定落ちの局面判定が厳密に行われるかを検証。
#[test]
fn test_real_damage_calc_integration_and_collapse() {
    // 例: 特攻特化カイオーガの「しおふき」(威力150) vs H振りモロバレル
    let input = DamageInput {
        level: 50,
        base_power: 150,
        bp_modifiers: vec![],
        attack: 222, // 特攻
        attack_boost: 0,
        attack_modifiers: vec![],
        defense: 145, // 特防
        defense_boost: 0,
        defense_modifiers: vec![],
        is_physical: false,
        move_type: Type::Water,
        defender_type1: Type::Grass,
        defender_type2: Some(Type::Poison),
        defender_type3: None,
        effectiveness_override: None,
        immune_override: None,
        spread_modifier: 3072, // ダブル補正 0.75倍
        parental_bond_modifier: 4096,
        weather_modifier: 6144, // 雨 1.5倍
        is_crit: false,
        crit_modifier: 4096,
        stab_modifier: 6144, // タイプ一致 1.5倍
        is_burned: false,
        final_modifiers: vec![],
        protect_modifier: 4096,
        tinted_lens: false,
        neuroforce: false,
        solid_rock: false,
    };

    let damage_result = calculate_input(&input);
    let rolls_i32: Vec<i32> = damage_result.rolls.iter().map(|&d| d as i32).collect();
    assert_eq!(rolls_i32.len(), 16);

    let (min_dmg, max_dmg) = (rolls_i32[0], rolls_i32[15]);
    assert!(min_dmg > 0 && max_dmg >= min_dmg);

    let dist = DamageDistribution::from_damage_rolls(&rolls_i32);

    // 1. 相手HPが max_dmg より高い場合: 確定耐え (DefiniteSurvive)
    let survive_hp = max_dmg + 20;
    match dist.evaluate_collapse(survive_hp) {
        DamageCollapse::DefiniteSurvive { expected_damage } => {
            assert!((expected_damage - dist.expected_damage()).abs() < 1e-6);
        }
        _ => panic!("HP {survive_hp} は確定耐え判定になるべき"),
    }

    // 2. 相手HPが min_dmg 以下の場合: 確定落ち (DefiniteKill)
    let kill_hp = min_dmg - 5;
    match dist.evaluate_collapse(kill_hp) {
        DamageCollapse::DefiniteKill { expected_damage } => {
            assert!((expected_damage - dist.expected_damage()).abs() < 1e-6);
        }
        _ => panic!("HP {kill_hp} は確定落ち判定になるべき"),
    }

    // 3. 相手HPが [min_dmg, max_dmg] の中間にある場合: 乱数1発 (CriticalThreshold)
    let mid_hp = (min_dmg + max_dmg) / 2;
    match dist.evaluate_collapse(mid_hp) {
        DamageCollapse::CriticalThreshold {
            ko_chance,
            surviving_expected_damage,
        } => {
            assert!(
                ko_chance > 0.0 && ko_chance < 1.0,
                "中間HPでは乱数KO確率は 0% と 100% の間になるべき (実際: {ko_chance})"
            );
            assert!(
                surviving_expected_damage < (mid_hp as f64),
                "耐えた場合の平均ダメージは相手の現在HP未満になるべき"
            );
        }
        _ => panic!("HP {mid_hp} はクリティカル閾値判定になるべき"),
    }
}

/// 【実戦テスト3: 準モンテカルロ法 (LHS) vs 通常擬似乱数 (PRNG) の分散低減比較】
/// 命中85% (ハイドロポンプ) のダメージ期待値を 16サンプルで推定したときの
/// 試行間分散を比較し、準モンテカルロ法 (LHS) の方が圧倒的にブレが小さいことを実証。
#[test]
fn test_qmc_variance_reduction_vs_prng() {
    let true_hit_rate = 0.85;
    let base_damage = 110.0;
    // 理論期待値 = 110 * 0.85 = 93.5
    let true_expected = base_damage * true_hit_rate;

    // 16サンプルのバッチを 100回実行して、それぞれの推定値の分散を計算
    let trials = 100;
    let sample_size = 16;

    // 1. 通常擬似乱数 (PRNG / LCG)
    let mut prng_estimates = Vec::with_capacity(trials);
    let mut rng_state: u64 = 123456789;
    for _ in 0..trials {
        let mut sum = 0.0;
        for _ in 0..sample_size {
            rng_state = rng_state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let u = (rng_state as f64) / (u64::MAX as f64);
            let hit = if u < true_hit_rate { 1.0 } else { 0.0 };
            sum += base_damage * hit;
        }
        prng_estimates.push(sum / (sample_size as f64));
    }

    // 2. ラテン超方格サンプラー (LHS)
    let mut lhs_estimates = Vec::with_capacity(trials);
    for _ in 0..trials {
        let events = BattleChanceEvent::generate_stratified_events(sample_size);
        let mut sum = 0.0;
        for e in events {
            let hit = if e.hit_roll < true_hit_rate { 1.0 } else { 0.0 };
            sum += base_damage * hit;
        }
        lhs_estimates.push(sum / (sample_size as f64));
    }

    let prng_var: f64 = prng_estimates
        .iter()
        .map(|&v| (v - true_expected).powi(2))
        .sum::<f64>()
        / (trials as f64);

    let lhs_var: f64 = lhs_estimates
        .iter()
        .map(|&v| (v - true_expected).powi(2))
        .sum::<f64>()
        / (trials as f64);

    // LHS の方が分散（誤差の二乗平均）が小さくなっていること
    assert!(
        lhs_var < prng_var,
        "LHSの分散 ({lhs_var}) はPRNGの分散 ({prng_var}) より小さくなければならない"
    );
}

/// 【実戦テスト4: ExpectiEngine による実戦局面の先読み評価】
/// ダブルバトルの2v2盤面で、合法手の全ペアに対する期待利得行列を構築し、
/// 最適手とその行動確率が正しく計算されることの結合テスト。
#[test]
fn test_expecti_engine_full_battle_integration() {
    let mut battle = Battle::new();
    battle.p1.active.push(make_pokemon(
        "p1a",
        "charizard",
        150,
        150,
        120,
        vec!["flamethrower", "airslash"],
        "Fire",
    ));
    battle.p1.active.push(make_pokemon(
        "p1b",
        "pikachu",
        80,
        80,
        110,
        vec!["thunderbolt", "quickattack"],
        "Electric",
    ));
    battle.p1.team.push(make_pokemon(
        "p1c",
        "raichu",
        100,
        100,
        115,
        vec!["thunderbolt"],
        "Electric",
    ));

    battle.p2.active.push(make_pokemon(
        "p2a",
        "blastoise",
        160,
        160,
        90,
        vec!["surf", "icebeam"],
        "Water",
    ));
    battle.p2.active.push(make_pokemon(
        "p2b",
        "venusaur",
        150,
        150,
        95,
        vec!["sludgebomb", "gigadrain"],
        "Grass",
    ));
    battle.p2.team.push(make_pokemon(
        "p2c",
        "wartortle",
        100,
        100,
        70,
        vec!["surf"],
        "Water",
    ));

    let engine = ExpectiEngine::new(ExpectiEngineConfig {
        chance_samples_per_pair: 2,
        depth: 1,
    });

    let result = engine.search(&battle, 1).expect("Search should succeed");

    // 利得行列の次元が P1手番数 x P2手番数 と一致している
    assert_eq!(result.payoff_matrix.len(), result.p1_candidates.len());
    if !result.payoff_matrix.is_empty() {
        assert_eq!(result.payoff_matrix[0].len(), result.p2_candidates.len());
    }

    // 最適手の確率が最大であること
    let best_prob = result.p1_candidates[0].probability;
    assert!(best_prob > 0.0);
    assert!(
        result
            .p1_candidates
            .iter()
            .all(|c| c.probability <= best_prob + 1e-6)
    );
}
