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

// =========================================================================
// 仕様書 v3 必須検証テストケース (1〜6)
// =========================================================================

#[allow(clippy::too_many_arguments)]
fn make_full_pokemon(
    ident: &str,
    species: &str,
    hp: i32,
    maxhp: i32,
    speed: i32,
    attack: i32,
    defense: i32,
    sp_attack: i32,
    sp_defense: i32,
    moves: Vec<&str>,
    type1: &str,
    type2: Option<&str>,
    ability: Option<&str>,
    item: Option<&str>,
) -> crate::sim::pokemon::Pokemon {
    build_pokemon(&InputPokemonData {
        ident: ident.to_string(),
        species: species.to_string(),
        hp,
        maxhp,
        speed,
        attack,
        defense,
        sp_attack,
        sp_defense,
        moves: moves.into_iter().map(String::from).collect(),
        type1: type1.to_string(),
        type2: type2.map(String::from),
        ability: ability.map(String::from),
        item: item.map(String::from),
        ..Default::default()
    })
}

/// 1. 『ふんか』トリル制圧 vs 無意味なまもる・交代・このゆびテスト (`test_eval_eruption_trick_room_checkmate`)
/// トリックルーム下。P2コータスの『ふんか』でP1が上から全滅縛り。全体技のため指でも吸えず、P1の勝率が0.15以下。
#[test]
fn test_eval_eruption_trick_room_checkmate() {
    let mut battle = Battle::new();
    battle.trick_room = true;
    battle.trick_room_turns_left = 3;

    // P1: エース + 指サポーター + 控え (全員ふんかで確定1発、トリル下でコータスより遅い)
    battle.p1.active.push(make_full_pokemon(
        "p1a",
        "venusaur",
        155,
        155,
        100,
        90,
        90,
        120,
        120,
        vec!["protect", "sludgebomb"],
        "Grass",
        Some("Poison"),
        Some("chlorophyll"),
        None,
    ));
    battle.p1.active.push(make_full_pokemon(
        "p1b",
        "clefable",
        170,
        170,
        80,
        80,
        80,
        100,
        100,
        vec!["followme", "protect"],
        "Fairy",
        None,
        Some("magicguard"),
        None,
    ));
    battle.p1.team.push(make_full_pokemon(
        "p1c",
        "chesnaught",
        160,
        160,
        84,
        110,
        130,
        80,
        90,
        vec!["spikyshield"],
        "Grass",
        Some("Fighting"),
        Some("overcoat"),
        None,
    ));

    // P2: コータス (S30、ふんかで上からP1全員をワンパン)
    battle.p2.active.push(make_full_pokemon(
        "p2a",
        "torkoal",
        177,
        177,
        30,
        90,
        160,
        150,
        90,
        vec!["eruption", "heatwave", "protect"],
        "Fire",
        None,
        Some("drought"),
        Some("charcoal"),
    ));
    battle.p2.active.push(make_full_pokemon(
        "p2b",
        "volcarona",
        160,
        160,
        120,
        70,
        85,
        155,
        125,
        vec!["protect"],
        "Bug",
        Some("Fire"),
        Some("flamebody"),
        None,
    ));

    let score = crate::solver::evaluator::evaluate_for_player(&battle, 1);
    assert!(
        score <= 0.15,
        "ふんかトリル詰み盤面ではP1勝率が0.15以下（実質敗北）となるべき (実際: {score})"
    );
}

/// 2. 『このゆびとまれ』による単体脅威吸寄せ＆エース反撃成立テスト (`test_eval_follow_me_redirection_saves_ace`)
/// P1エースが相手の高速単体技で上から縛られているが、相方の指で吸ってエースが返しの攻撃でワンパンできる盤面。
#[test]
fn test_eval_follow_me_redirection_saves_ace() {
    // 盤面A: 指サポーターあり
    let mut battle_with_followme = Battle::new();
    battle_with_followme.p1.active.push(make_full_pokemon(
        "p1a",
        "charizard",
        150,
        150,
        90,
        100,
        90,
        160,
        100,
        vec!["flamethrower"],
        "Fire",
        Some("Flying"),
        Some("blaze"),
        None,
    ));
    battle_with_followme.p1.active.push(make_full_pokemon(
        "p1b",
        "clefable",
        190,
        190,
        70,
        80,
        120,
        100,
        120,
        vec!["followme", "protect"],
        "Fairy",
        None,
        Some("magicguard"),
        None,
    ));
    battle_with_followme.p2.active.push(make_full_pokemon(
        "p2a",
        "cinderace",
        150,
        150,
        140,
        150,
        85,
        75,
        85,
        vec!["pyroball", "ironhead"],
        "Fire",
        None,
        Some("libero"),
        None,
    ));
    battle_with_followme.p2.active.push(make_full_pokemon(
        "p2b",
        "forretress",
        150,
        150,
        40,
        100,
        160,
        70,
        70,
        vec!["protect"],
        "Bug",
        Some("Steel"),
        Some("sturdy"),
        None,
    ));

    // 盤面B: 指サポーターなし (ただの置き物)
    let mut battle_without_followme = battle_with_followme.clone();
    battle_without_followme.p1.active[1].moves = vec!["pound".to_string()];

    let score_with = crate::solver::evaluator::evaluate_for_player(&battle_with_followme, 1);
    let score_without = crate::solver::evaluator::evaluate_for_player(&battle_without_followme, 1);

    assert!(
        score_with > score_without,
        "このゆびとまれによる吸寄せが成立する場合、評価値が高くなるべき (with: {score_with}, without: {score_without})"
    );
    assert!(
        score_with >= 0.50,
        "エースを守って打開できる盤面は対等以上の高評価になるべき (実際: {score_with})"
    );
}

/// 3. 『いかりのこな』の草タイプ・防塵ゴーグル貫通テスト (`test_eval_rage_powder_grass_immunity`)
/// 相方の技が『いかりのこな』で、敵アタッカーが草タイプ（または防塵ゴーグル）の場合、粉が無効化されて低評価になること。
#[test]
fn test_eval_rage_powder_grass_immunity() {
    // 盤面A: 敵アタッカーが草タイプ (フシギバナ) -> 粉無効
    let mut battle_grass_foe = Battle::new();
    battle_grass_foe.p1.active.push(make_full_pokemon(
        "p1a",
        "swampert",
        160,
        160,
        70,
        130,
        100,
        95,
        100,
        vec!["waterfall"],
        "Water",
        Some("Ground"),
        Some("torrent"),
        None,
    ));
    battle_grass_foe.p1.active.push(make_full_pokemon(
        "p1b",
        "volcarona",
        170,
        170,
        80,
        70,
        85,
        135,
        105,
        vec!["ragepowder", "protect"],
        "Bug",
        Some("Fire"),
        Some("flamebody"),
        None,
    ));
    battle_grass_foe.p2.active.push(make_full_pokemon(
        "p2a",
        "venusaur",
        160,
        160,
        110,
        90,
        95,
        130,
        110,
        vec!["gigadrain", "sludgebomb"],
        "Grass",
        Some("Poison"),
        Some("overgrow"),
        None,
    ));
    battle_grass_foe.p2.active.push(make_full_pokemon(
        "p2b",
        "forretress",
        150,
        150,
        40,
        90,
        140,
        60,
        60,
        vec!["protect"],
        "Bug",
        Some("Steel"),
        Some("sturdy"),
        None,
    ));

    // 盤面B: 相方が『このゆびとまれ』を持つピッピ（草タイプでも吸える）
    let mut battle_follow_me = battle_grass_foe.clone();
    battle_follow_me.p1.active[1] = make_full_pokemon(
        "p1b",
        "clefable",
        170,
        170,
        80,
        70,
        85,
        95,
        105,
        vec!["followme", "protect"],
        "Fairy",
        None,
        Some("magicguard"),
        None,
    );

    let score_rage_powder = crate::solver::evaluator::evaluate_for_player(&battle_grass_foe, 1);
    let score_follow_me = crate::solver::evaluator::evaluate_for_player(&battle_follow_me, 1);

    assert!(
        score_follow_me > score_rage_powder,
        "草タイプに対して『このゆびとまれ』は有効だが『いかりのこな』は貫通されるため、後者の方が低評価になるべき (粉: {score_rage_powder}, 指: {score_follow_me})"
    );
}

/// 4. 『まもる』＋隣の先制技/高打点による『ふんか』打開テスト (`test_eval_protect_and_partner_counter`)
/// テスト1と似た盤面だが、P1の隣が耐えて返しの水技でコータスを倒せる/大幅削りできる盤面。
#[test]
fn test_eval_protect_and_partner_counter() {
    let mut battle = Battle::new();
    battle.trick_room = true;
    battle.trick_room_turns_left = 3;

    // P1: まもる持ちエース + 高耐久水アタッカー (ふんかを耐えて水技で返り討ち)
    battle.p1.active.push(make_full_pokemon(
        "p1a",
        "venusaur",
        155,
        155,
        100,
        90,
        90,
        120,
        120,
        vec!["protect", "sludgebomb"],
        "Grass",
        Some("Poison"),
        Some("chlorophyll"),
        None,
    ));
    battle.p1.active.push(make_full_pokemon(
        "p1b",
        "vaporeon",
        220,
        220,
        75,
        75,
        80,
        130,
        120,
        vec!["surf", "protect"],
        "Water",
        None,
        Some("waterabsorb"),
        None,
    ));

    // P2: コータス + 置き物
    battle.p2.active.push(make_full_pokemon(
        "p2a",
        "torkoal",
        150,
        150,
        30,
        90,
        160,
        120,
        90,
        vec!["eruption", "protect"],
        "Fire",
        None,
        Some("drought"),
        None,
    ));
    battle.p2.active.push(make_full_pokemon(
        "p2b",
        "volcarona",
        160,
        160,
        120,
        70,
        85,
        155,
        125,
        vec!["protect"],
        "Bug",
        Some("Fire"),
        Some("flamebody"),
        None,
    ));

    let score = crate::solver::evaluator::evaluate_for_player(&battle, 1);
    assert!(
        score >= 0.55,
        "相方が打開できる場合はテスト1と比べて大幅に高い評価（0.55以上）になるべき (実際: {score})"
    );
}

/// 5. トリル残り1ターンの『まもる』枯らし成立テスト (`test_eval_trick_room_last_turn_stall`)
/// トリル下でコータスに先手を取られているが、素の素早さはP1の方が速く、
/// 追い風・トリルの枯らしが成立する盤面。
#[test]
fn test_eval_trick_room_last_turn_stall() {
    let mut battle = Battle::new();
    battle.trick_room = true;
    battle.trick_room_turns_left = 1;

    // P1: 素早さで勝る2体がまもる所持
    battle.p1.active.push(make_full_pokemon(
        "p1a",
        "charizard",
        160,
        160,
        120,
        100,
        90,
        130,
        100,
        vec!["protect", "airslash"],
        "Fire",
        Some("Flying"),
        Some("blaze"),
        None,
    ));
    battle.p1.active.push(make_full_pokemon(
        "p1b",
        "blastoise",
        160,
        160,
        95,
        95,
        115,
        100,
        115,
        vec!["protect", "surf"],
        "Water",
        None,
        Some("torrent"),
        None,
    ));

    // P2: トリルコータス
    battle.p2.active.push(make_full_pokemon(
        "p2a",
        "torkoal",
        170,
        170,
        30,
        90,
        160,
        120,
        90,
        vec!["eruption", "protect"],
        "Fire",
        None,
        Some("drought"),
        None,
    ));
    battle.p2.active.push(make_full_pokemon(
        "p2b",
        "forretress",
        160,
        160,
        40,
        90,
        140,
        60,
        60,
        vec!["protect"],
        "Bug",
        Some("Steel"),
        Some("sturdy"),
        None,
    ));

    let score = crate::solver::evaluator::evaluate_for_player(&battle, 1);
    assert!(
        score > 0.40,
        "トリル下でも守れば素のSで逆転できる盤面は詰み判定にならず評価されるべき (実際: {score})"
    );
}

/// 6. 受け出し成立（もらいび / 高耐久耐性）テスト (`test_eval_viable_switch_in`)
/// P1の場が単体炎技で縛られているが、控えにもらいび（ウインディ）がいる盤面 vs 控えが炎弱点で受け出し即死する盤面。
#[test]
fn test_eval_viable_switch_in() {
    // 盤面A: 控えにもらいびウインディ（炎無効）
    let mut battle_viable = Battle::new();
    battle_viable.p1.active.push(make_full_pokemon(
        "p1a",
        "forretress",
        150,
        150,
        40,
        90,
        140,
        60,
        60,
        vec!["gyroball"],
        "Bug",
        Some("Steel"),
        Some("sturdy"),
        None,
    ));
    battle_viable.p1.team.push(make_full_pokemon(
        "p1b",
        "arcanine",
        180,
        180,
        110,
        120,
        90,
        110,
        90,
        vec!["flareblitz"],
        "Fire",
        None,
        Some("flashfire"),
        None,
    ));
    battle_viable.p2.active.push(make_full_pokemon(
        "p2a",
        "charizard",
        150,
        150,
        120,
        100,
        90,
        130,
        100,
        vec!["flamethrower"],
        "Fire",
        Some("Flying"),
        Some("blaze"),
        None,
    ));

    // 盤面B: 控えが草・虫タイプで受け出し即死
    let mut battle_collapse = battle_viable.clone();
    battle_collapse.p1.team[0] = make_full_pokemon(
        "p1b",
        "venusaur",
        120,
        120,
        70,
        80,
        70,
        90,
        80,
        vec!["sludgebomb"],
        "Grass",
        Some("Poison"),
        Some("overgrow"),
        None,
    );

    let score_viable = crate::solver::evaluator::evaluate_for_player(&battle_viable, 1);
    let score_collapse = crate::solver::evaluator::evaluate_for_player(&battle_collapse, 1);

    assert!(
        score_viable > score_collapse,
        "受け出し成立（もらいび）の盤面評価は受け出し崩壊の盤面より明確に高くなるべき (viable: {score_viable}, collapse: {score_collapse})"
    );
}
