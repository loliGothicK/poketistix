//! CTS / OTS 棋譜 (`BattleKifu`) からの不完全情報推定 (`BeliefState`)・確定化サンプリング (`Determinizer`)・
//! 情報集合MCTS (`Ismcts::evaluate_kifu_turn`) の単体テスト群

use crate::sim::pokemon::PokemonIdent;
use crate::solver::BattleKifuSolverExt;
use crate::solver::belief::{BeliefState, calc_pokemon_hp_lv50, calc_pokemon_stat_lv50};
use crate::solver::determinizer::Determinizer;
use crate::solver::ismcts::{Ismcts, IsmctsConfig};
use crate::wasm_api::{InputPokemonData, PlayerActionJs, SlotActionJs};
use kifu::{
    ActionQuality, BattleKifu, ObservedEvent, ObservedHp, OpponentPreviewSlot, SpeedOrderKnowledge,
    TurnRecord,
};
use pkmn_meta::Regulation;
use rand::SeedableRng;

fn make_p1_team() -> Vec<InputPokemonData> {
    vec![
        InputPokemonData {
            ident: "p1a".to_string(),
            species: "charizard".to_string(),
            hp: 153,
            maxhp: 153,
            attack: 93,
            defense: 98,
            sp_attack: 161, // C32
            sp_defense: 105,
            speed: 167, // S32+ (Timid: (100+20+32)*1.1 = 167)
            ability: Some("blaze".to_string()),
            item: Some("charizardite-y".to_string()),
            type1: "Fire".to_string(),
            type2: Some("Flying".to_string()),
            moves: vec![
                "flamethrower".to_string(),
                "air-slash".to_string(),
                "solar-beam".to_string(),
                "protect".to_string(),
            ],
            ..Default::default()
        },
        InputPokemonData {
            ident: "p1b".to_string(),
            species: "dragonite".to_string(),
            hp: 166,
            maxhp: 166,
            attack: 204, // A32+ (Adamant: (134+20+32)*1.1 = 204)
            defense: 115,
            sp_attack: 108,
            sp_defense: 120,
            speed: 132, // S32
            ability: Some("inner-focus".to_string()),
            item: Some("choice-band".to_string()),
            type1: "Dragon".to_string(),
            type2: Some("Flying".to_string()),
            moves: vec![
                "extreme-speed".to_string(),
                "dragon-claw".to_string(),
                "earthquake".to_string(),
                "ice-spinner".to_string(),
            ],
            ..Default::default()
        },
        InputPokemonData {
            ident: "p1c".to_string(),
            species: "rillaboom".to_string(),
            hp: 207, // H32
            maxhp: 207,
            attack: 194, // A32+
            defense: 110,
            sp_attack: 72,
            sp_defense: 92,
            speed: 105,
            ability: Some("grassy-surge".to_string()),
            item: Some("assault-vest".to_string()),
            type1: "Grass".to_string(),
            moves: vec![
                "fake-out".to_string(),
                "wood-hammer".to_string(),
                "grassy-glide".to_string(),
                "high-horsepower".to_string(),
            ],
            ..Default::default()
        },
        InputPokemonData {
            ident: "p1d".to_string(),
            species: "incineroar".to_string(),
            hp: 202,
            maxhp: 202,
            attack: 135,
            defense: 140,
            sp_attack: 90,
            sp_defense: 125,
            speed: 80,
            ability: Some("intimidate".to_string()),
            item: Some("sitrus-berry".to_string()),
            type1: "Fire".to_string(),
            type2: Some("Dark".to_string()),
            moves: vec![
                "fake-out".to_string(),
                "flare-blitz".to_string(),
                "parting-shot".to_string(),
                "protect".to_string(),
            ],
            ..Default::default()
        },
        InputPokemonData {
            ident: "p1e".to_string(),
            species: "pelipper".to_string(),
            hp: 167,
            maxhp: 167,
            attack: 63,
            defense: 120,
            sp_attack: 161,
            sp_defense: 90,
            speed: 85,
            ability: Some("drizzle".to_string()),
            item: Some("focus-sash".to_string()),
            type1: "Water".to_string(),
            type2: Some("Flying".to_string()),
            moves: vec![
                "weather-ball".to_string(),
                "hurricane".to_string(),
                "tailwind".to_string(),
                "protect".to_string(),
            ],
            ..Default::default()
        },
        InputPokemonData {
            ident: "p1f".to_string(),
            species: "archaludon".to_string(),
            hp: 197,
            maxhp: 197,
            attack: 112,
            defense: 150,
            sp_attack: 194,
            sp_defense: 85,
            speed: 105,
            ability: Some("stamina".to_string()),
            item: Some("leftovers".to_string()),
            type1: "Steel".to_string(),
            type2: Some("Dragon".to_string()),
            moves: vec![
                "electro-shot".to_string(),
                "draco-meteor".to_string(),
                "flash-cannon".to_string(),
                "protect".to_string(),
            ],
            ..Default::default()
        },
    ]
}

fn make_cts_preview() -> Vec<OpponentPreviewSlot> {
    vec![
        OpponentPreviewSlot {
            preview_index: 0,
            species: "incineroar".to_string(),
            known_item: None,
            known_ability: None,
            known_moves: vec![],
        },
        OpponentPreviewSlot {
            preview_index: 1,
            species: "pelipper".to_string(),
            known_item: None,
            known_ability: None,
            known_moves: vec![],
        },
        OpponentPreviewSlot {
            preview_index: 2,
            species: "archaludon".to_string(),
            known_item: None,
            known_ability: None,
            known_moves: vec![],
        },
        OpponentPreviewSlot {
            preview_index: 3,
            species: "garchomp".to_string(),
            known_item: None,
            known_ability: None,
            known_moves: vec![],
        },
        OpponentPreviewSlot {
            preview_index: 4,
            species: "rillaboom".to_string(),
            known_item: None,
            known_ability: None,
            known_moves: vec![],
        },
        OpponentPreviewSlot {
            preview_index: 5,
            species: "tyranitar".to_string(),
            known_item: None,
            known_ability: None,
            known_moves: vec![],
        },
    ]
}

#[test]
fn test_cts_vs_ots_belief_initialization_and_switch_in() {
    // 1. CTS モード: 初期状態では特性・持ち物・技が未確定で、候補特性が pkmn_meta から設定される
    // ただし Turn 0 (lead_events) で incineroar (index 0) が登場し intimidate が不発、pelipper (index 1) が drizzle を発動したとする
    let kifu_cts = BattleKifu {
        regulation: Regulation::MA,
        is_open_team_sheet: false,
        p1_team: make_p1_team(),
        p1_selection: [0, 1, 2, 3],
        p2_preview: make_cts_preview(),
        lead_events: vec![
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 0,
                team_index: 0,
                species: "charizard".to_string(),
                hp: ObservedHp::Exact {
                    current: 153,
                    max: 153,
                },
            },
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 1,
                team_index: 1,
                species: "dragonite".to_string(),
                hp: ObservedHp::Exact {
                    current: 166,
                    max: 166,
                },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 0,
                team_index: 0,
                species: "incineroar".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 1,
                team_index: 1,
                species: "pelipper".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            // pelipper のあめふらしのみ発動し、incineroar のいかくは発動しなかった
            ObservedEvent::AbilityTriggered {
                source: PokemonIdent::from("p2b"),
                ability: "drizzle".to_string(),
            },
            ObservedEvent::WeatherChanged {
                weather: Some("Rain".to_string()),
            },
        ],
        turns: vec![],
        ..Default::default()
    };

    let belief = BeliefState::from_kifu_up_to_turn(&kifu_cts, 0);

    // Incineroar (index 0): 登場時にいかく (intimidate) が発動しなかったため除外され、もう一方の blaze に確定する
    let incin = &belief.opponent_beliefs[0];
    assert!(incin.revealed_in_battle);
    assert_eq!(incin.active_slot, Some(0));
    assert!(
        !incin
            .candidate_abilities
            .contains(&"intimidate".to_string())
    );
    assert_eq!(incin.known_ability.as_deref(), Some("blaze"));

    // Pelipper (index 1): drizzle が発動して確定
    let pelipper = &belief.opponent_beliefs[1];
    assert!(pelipper.revealed_in_battle);
    assert_eq!(pelipper.active_slot, Some(1));
    assert_eq!(pelipper.known_ability.as_deref(), Some("drizzle"));

    // 2. OTS モード: 選出画面の時点で持ち物・特性・技が確定している
    let mut ots_preview = make_cts_preview();
    ots_preview[2].known_ability = Some("stamina".to_string());
    ots_preview[2].known_item = Some("assault-vest".to_string());
    ots_preview[2].known_moves = vec![
        "electro-shot".to_string(),
        "draco-meteor".to_string(),
        "flash-cannon".to_string(),
        "snarl".to_string(),
    ];

    let kifu_ots = BattleKifu {
        is_open_team_sheet: true,
        p2_preview: ots_preview,
        ..kifu_cts
    };
    let belief_ots = BeliefState::from_kifu_up_to_turn(&kifu_ots, 0);
    let arch = &belief_ots.opponent_beliefs[2];
    assert_eq!(arch.known_ability.as_deref(), Some("stamina"));
    assert_eq!(arch.known_item.as_deref(), Some("assault-vest"));
    assert_eq!(arch.known_moves.len(), 4);
}

#[test]
fn test_speed_order_and_choice_scarf_inference() {
    // P1a: charizard (Spe 167)
    // P2a: garchomp (index 3, 種族値102 -> 無補正0振り 122 ～ 陽気32振り 169)
    // P2b: tyranitar (index 5, 種族値61 -> 無補正0振り 81 ～ 陽気32振り 124)
    let dummy_action = PlayerActionJs {
        slot_a: SlotActionJs {
            choice: "air-slash".to_string(),
            target: 1,
            mega: false,
        },
        slot_b: SlotActionJs {
            choice: "protect".to_string(),
            target: 0,
            mega: false,
        },
    };

    let kifu = BattleKifu {
        regulation: Regulation::MA,
        is_open_team_sheet: false,
        p1_team: make_p1_team(),
        p1_selection: [0, 1, 2, 3],
        p2_preview: make_cts_preview(),
        lead_events: vec![
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 0,
                team_index: 0,
                species: "charizard".to_string(),
                hp: ObservedHp::Exact {
                    current: 153,
                    max: 153,
                },
            },
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 1,
                team_index: 1,
                species: "dragonite".to_string(),
                hp: ObservedHp::Exact {
                    current: 166,
                    max: 166,
                },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 0,
                team_index: 3,
                species: "garchomp".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 1,
                team_index: 5,
                species: "tyranitar".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::AbilityTriggered {
                source: PokemonIdent::from("p2b"),
                ability: "sand-stream".to_string(),
            },
        ],
        turns: vec![TurnRecord {
            turn_number: 1,
            p1_action: dummy_action,
            p2_action: None,
            events: vec![
                // 優先度0同士の行動順:
                // 1番手: p2b (tyranitar) が rock-slide -> 本来最大S124なので、p1a (charizard, S167) より先に動くにはこだわりスカーフ必須!
                ObservedEvent::MoveUsed {
                    attacker: PokemonIdent::from("p2b"),
                    move_id: "rock-slide".to_string(),
                    target: Some(PokemonIdent::from("p1a")),
                },
                // 2番手: p1a (charizard, S167) が air-slash
                ObservedEvent::MoveUsed {
                    attacker: PokemonIdent::from("p1a"),
                    move_id: "air-slash".to_string(),
                    target: Some(PokemonIdent::from("p2a")),
                },
                // 3番手: p2a (garchomp) が dragon-claw -> p1a (S167) より後に動いたため、S <= 167 かつスカーフ否定!
                ObservedEvent::MoveUsed {
                    attacker: PokemonIdent::from("p2a"),
                    move_id: "dragon-claw".to_string(),
                    target: Some(PokemonIdent::from("p1b")),
                },
            ],
            ..Default::default()
        }],
        ..Default::default()
    };

    let belief = BeliefState::from_kifu_up_to_turn(&kifu, 1);

    // Tyranitar (index 5): 最速でも124のため、S167のcharizardを抜いたことで choice-scarf が自動確定し、
    // 1.5倍で167以上となる素早さ実数値 (>= 112) に下限が引き上げられる
    let ttar = &belief.opponent_beliefs[5];
    assert_eq!(ttar.known_item.as_deref(), Some("choice-scarf"));
    assert!(
        ttar.spe_stat_range.0 >= 112,
        "Tyranitar min speed should be >= 112 to reach 167 with Choice Scarf, got {:?}",
        ttar.spe_stat_range
    );

    // Garchomp (index 3): S167のcharizardより後に動いたため、上限が 167 以下（最速169の否定）となり、スカーフも除外される
    let chomp = &belief.opponent_beliefs[3];
    assert!(
        chomp.spe_stat_range.1 <= 167,
        "Garchomp max speed should be <= 167 after moving after S167 Charizard, got {:?}",
        chomp.spe_stat_range
    );
    assert!(chomp.excluded_items.contains(&"choice-scarf".to_string()));

    // 可視化スナップショットの素早さ比較でも確定順序として出力されることを検証
    let snapshot = belief.to_snapshot_view();
    let p1a_vs_p2b = snapshot
        .speed_comparisons
        .iter()
        .find(|c| c.p1_slot == 0 && c.p2_slot == 1)
        .expect("Should contain p1a (slot 0) vs p2b (slot 1) speed comparison");
    assert_eq!(p1a_vs_p2b.knowledge, SpeedOrderKnowledge::Slower);
}

#[test]
fn test_offensive_and_defensive_damage_inversion() {
    // P2a: garchomp (index 3) が P1b: dragonite (HP 166, Def 115, inner-focus) に dragon-claw (威力80, 物理ドラゴン, STAB 1.5x, 弱点 2.0x)
    // いじっぱりA32振り garchomp の攻撃実数値 (種族値 130 はメタデータから自動取得)
    let chomp_atk = calc_pokemon_stat_lv50("garchomp", 1, 32, 1).expect("garchomp atk");
    assert_eq!(chomp_atk, 200);

    // P1a: charizard (SpA 161) が P2b: rillaboom (index 4, H32振り HP=207, D0振り SpD=90) に air-slash (種族値はメタデータから自動取得)
    let rilla_hp = calc_pokemon_hp_lv50("rillaboom", 32).expect("rillaboom hp");
    let rilla_spd = calc_pokemon_stat_lv50("rillaboom", 4, 0, 0).expect("rillaboom spd");
    assert_eq!(rilla_hp, 207);
    assert_eq!(rilla_spd, 90);

    let dummy_action = PlayerActionJs {
        slot_a: SlotActionJs {
            choice: "air-slash".to_string(),
            target: 2,
            mega: false,
        },
        slot_b: SlotActionJs {
            choice: "extreme-speed".to_string(),
            target: 1,
            mega: false,
        },
    };

    let kifu = BattleKifu {
        regulation: Regulation::MA,
        is_open_team_sheet: false,
        p1_team: make_p1_team(),
        p1_selection: [0, 1, 2, 3],
        p2_preview: make_cts_preview(),
        lead_events: vec![
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 0,
                team_index: 0,
                species: "charizard".to_string(),
                hp: ObservedHp::Exact {
                    current: 153,
                    max: 153,
                },
            },
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 1,
                team_index: 1,
                species: "dragonite".to_string(),
                hp: ObservedHp::Exact {
                    current: 166,
                    max: 166,
                },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 0,
                team_index: 3,
                species: "garchomp".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 1,
                team_index: 4,
                species: "rillaboom".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::AbilityTriggered {
                source: PokemonIdent::from("p2b"),
                ability: "grassy-surge".to_string(),
            },
        ],
        turns: vec![TurnRecord {
            turn_number: 1,
            p1_action: dummy_action,
            p2_action: None,
            events: vec![
                ObservedEvent::MoveUsed {
                    attacker: PokemonIdent::from("p1a"),
                    move_id: "air-slash".to_string(),
                    target: Some(PokemonIdent::from("p2b")),
                },
                ObservedEvent::Damage {
                    target: PokemonIdent::from("p2b"),
                    hp_after: ObservedHp::Percent { percent: 12 },
                    damage_exact: None,
                    is_crit: false,
                    effectiveness: Some(1),
                    from_effect: None,
                    attacker: Some(PokemonIdent::from("p1a")),
                    move_id: Some("air-slash".to_string()),
                    is_spread: false,
                },
                ObservedEvent::MoveUsed {
                    attacker: PokemonIdent::from("p2a"),
                    move_id: "dragon-claw".to_string(),
                    target: Some(PokemonIdent::from("p1b")),
                },
                ObservedEvent::Damage {
                    target: PokemonIdent::from("p1b"),
                    hp_after: ObservedHp::Exact {
                        current: 6,
                        max: 166,
                    },
                    damage_exact: Some(160),
                    is_crit: false,
                    effectiveness: Some(1),
                    from_effect: None,
                    attacker: Some(PokemonIdent::from("p2a")),
                    move_id: Some("dragon-claw".to_string()),
                    is_spread: false,
                },
            ],
            ..Default::default()
        }],
        ..Default::default()
    };

    let belief_before = BeliefState::from_kifu_up_to_turn(&kifu, 0);
    let belief_after = BeliefState::from_kifu_up_to_turn(&kifu, 1);

    // 1. Garchomp (index 3) の攻撃実数値・努力値レンジが被ダメージ 160 から逆算されて絞り込まれていること
    let chomp_before = &belief_before.opponent_beliefs[3];
    let chomp_after = &belief_after.opponent_beliefs[3];
    assert!(
        chomp_after.atk_stat_range.0 > chomp_before.atk_stat_range.0,
        "Garchomp min Attack should be narrowed upward from {:?}, got {:?}",
        chomp_before.atk_stat_range,
        chomp_after.atk_stat_range
    );
    assert!(
        chomp_after.atk_stat_range.0 <= 200 && 200 <= chomp_after.atk_stat_range.1,
        "True Attack stat (200) must remain inside narrowed range {:?}",
        chomp_after.atk_stat_range
    );

    // 2. Rillaboom (index 4) の特殊耐久レンジが 100% -> 12% (88%ダメージ) から逆算され、
    //    D特化のような硬すぎる配分が除外されて上限が絞り込まれていること
    let rilla_before = &belief_before.opponent_beliefs[4];
    let rilla_after = &belief_after.opponent_beliefs[4];
    assert!(
        rilla_after.spd_stat_range.1 < rilla_before.spd_stat_range.1,
        "Rillaboom max SpD should be narrowed downward from {:?}, got {:?}",
        rilla_before.spd_stat_range,
        rilla_after.spd_stat_range
    );
    assert!(
        rilla_after.spd_stat_range.0 <= 90 && 90 <= rilla_after.spd_stat_range.1,
        "True SpD stat (90) must remain inside narrowed range {:?}",
        rilla_after.spd_stat_range
    );
}

#[test]
fn test_negative_inference_choice_items_and_life_orb() {
    let dummy_action = PlayerActionJs {
        slot_a: SlotActionJs {
            choice: "protect".to_string(),
            target: 0,
            mega: false,
        },
        slot_b: SlotActionJs {
            choice: "protect".to_string(),
            target: 0,
            mega: false,
        },
    };

    let kifu = BattleKifu {
        regulation: Regulation::MA,
        is_open_team_sheet: false,
        p1_team: make_p1_team(),
        p1_selection: [0, 1, 2, 3],
        p2_preview: make_cts_preview(),
        lead_events: vec![
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 0,
                team_index: 0,
                species: "charizard".to_string(),
                hp: ObservedHp::Exact {
                    current: 153,
                    max: 153,
                },
            },
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 1,
                team_index: 1,
                species: "dragonite".to_string(),
                hp: ObservedHp::Exact {
                    current: 166,
                    max: 166,
                },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 0,
                team_index: 2,
                species: "archaludon".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 1,
                team_index: 1,
                species: "pelipper".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
        ],
        turns: vec![
            TurnRecord {
                turn_number: 1,
                p1_action: dummy_action.clone(),
                p2_action: None,
                events: vec![
                    ObservedEvent::MoveUsed {
                        attacker: PokemonIdent::from("p2a"),
                        move_id: "flash-cannon".to_string(),
                        target: Some(PokemonIdent::from("p1b")),
                    },
                    ObservedEvent::Damage {
                        target: PokemonIdent::from("p1b"),
                        hp_after: ObservedHp::Exact {
                            current: 110,
                            max: 166,
                        },
                        damage_exact: Some(56),
                        is_crit: false,
                        effectiveness: Some(0),
                        from_effect: None,
                        attacker: Some(PokemonIdent::from("p2a")),
                        move_id: Some("flash-cannon".to_string()),
                        is_spread: false,
                    },
                    // いのちのたまの反動ダメージが発生しなかった
                ],
                ..Default::default()
            },
            TurnRecord {
                turn_number: 2,
                p1_action: dummy_action,
                p2_action: None,
                events: vec![
                    // 交代せずに2種類目の技 draco-meteor を使用 -> こだわり系アイテム3種すべて否定
                    ObservedEvent::MoveUsed {
                        attacker: PokemonIdent::from("p2a"),
                        move_id: "draco-meteor".to_string(),
                        target: Some(PokemonIdent::from("p1a")),
                    },
                ],
                ..Default::default()
            },
        ],
        ..Default::default()
    };

    let belief = BeliefState::from_kifu_up_to_turn(&kifu, 2);
    let arch = &belief.opponent_beliefs[2];

    assert!(arch.excluded_items.contains(&"life-orb".to_string()));
    assert!(arch.excluded_items.contains(&"choice-band".to_string()));
    assert!(arch.excluded_items.contains(&"choice-specs".to_string()));
    assert!(arch.excluded_items.contains(&"choice-scarf".to_string()));
    assert_eq!(
        arch.known_moves,
        vec!["flashcannon".to_string(), "dracometeor".to_string()]
    );
}

#[test]
fn test_determinizer_samples_valid_champions_4_of_6_and_bounds() {
    let kifu = BattleKifu {
        regulation: Regulation::MA,
        is_open_team_sheet: false,
        p1_team: make_p1_team(),
        p1_selection: [0, 1, 2, 3],
        p2_preview: make_cts_preview(),
        lead_events: vec![
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 0,
                team_index: 0,
                species: "charizard".to_string(),
                hp: ObservedHp::Exact {
                    current: 153,
                    max: 153,
                },
            },
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 1,
                team_index: 1,
                species: "dragonite".to_string(),
                hp: ObservedHp::Exact {
                    current: 166,
                    max: 166,
                },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 0,
                team_index: 0,
                species: "incineroar".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 1,
                team_index: 3,
                species: "garchomp".to_string(),
                hp: ObservedHp::Percent { percent: 75 },
            },
            ObservedEvent::AbilityTriggered {
                source: PokemonIdent::from("p2a"),
                ability: "intimidate".to_string(),
            },
        ],
        turns: vec![],
        ..Default::default()
    };

    let belief = BeliefState::from_kifu_up_to_turn(&kifu, 0);
    let determinizer = Determinizer::default();
    let mut rng = rand::rngs::SmallRng::seed_from_u64(42);

    for _ in 0..10 {
        let sampled = determinizer.sample_battle(&belief, &mut rng);

        // 相手は6匹見せ合いから「場に出ている2匹 + 未公開からランダム選出された控え2匹」の計4匹になる
        assert_eq!(sampled.p2.active.len(), 2);
        assert_eq!(sampled.p2.team.len(), 2);

        // P2a: incineroar の特性は intimidate に固定されている
        assert_eq!(
            sampled.p2.active[0].ability.as_ref().map(|a| a.as_str()),
            Some("intimidate")
        );

        // P2b: garchomp のHPは 75% に整合している
        let chomp = &sampled.p2.active[1];
        let hp_pct = (chomp.hp.into_inner() * 100) / chomp.maxhp.into_inner();
        assert!(
            (hp_pct - 75).abs() <= 1,
            "Sampled Garchomp HP should match 75%, got {}/{} ({}%)",
            chomp.hp.into_inner(),
            chomp.maxhp.into_inner(),
            hp_pct
        );

        // サンプリングされた全ての相手ポケモンについて、技が Champions レギュレーションで合法であることを確認
        for poke in sampled.p2.active.iter().chain(sampled.p2.team.iter()) {
            assert!(!poke.moves.is_empty() && poke.moves.len() <= 4);
            let legal_slugs =
                pkmn_meta::regulation::get_pokemon_move_slugs(&poke.species, Regulation::MA)
                    .expect("Species should have legal moves in Regulation::MA");
            for mv in &poke.moves {
                assert!(
                    legal_slugs.iter().any(|&s| s == mv),
                    "Sampled move {} is not legal for {} in Regulation::MA",
                    mv,
                    poke.species
                );
            }
        }
    }
}

#[test]
fn test_ismcts_evaluate_kifu_turn_produces_visualization_and_evaluation_report() {
    let actual_action = PlayerActionJs {
        slot_a: SlotActionJs {
            choice: "air-slash".to_string(),
            target: 1,
            mega: true,
        },
        slot_b: SlotActionJs {
            choice: "earthquake".to_string(),
            target: 0,
            mega: false,
        },
    };

    let kifu = BattleKifu {
        regulation: Regulation::MA,
        is_open_team_sheet: false,
        p1_team: make_p1_team(),
        p1_selection: [0, 1, 2, 3],
        p2_preview: make_cts_preview(),
        lead_events: vec![
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 0,
                team_index: 0,
                species: "charizard".to_string(),
                hp: ObservedHp::Exact {
                    current: 153,
                    max: 153,
                },
            },
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 1,
                team_index: 1,
                species: "dragonite".to_string(),
                hp: ObservedHp::Exact {
                    current: 166,
                    max: 166,
                },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 0,
                team_index: 0,
                species: "incineroar".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 1,
                team_index: 4,
                species: "rillaboom".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::AbilityTriggered {
                source: PokemonIdent::from("p2a"),
                ability: "intimidate".to_string(),
            },
            ObservedEvent::AbilityTriggered {
                source: PokemonIdent::from("p2b"),
                ability: "grassy-surge".to_string(),
            },
        ],
        turns: vec![TurnRecord {
            turn_number: 1,
            p1_action: actual_action,
            p2_action: None,
            events: vec![],
            ..Default::default()
        }],
        ..Default::default()
    };

    let ismcts = Ismcts::new(IsmctsConfig {
        iterations: 30,
        max_depth: 2,
        exploration_c: 0.7,
        rollout_depth: 2,
    });

    let report = ismcts.evaluate_kifu_turn(&kifu, 0);

    // 1. 盤面可視化スナップショットの検証
    assert_eq!(report.snapshot.opponent_beliefs.len(), 6);
    assert_eq!(report.snapshot.unrevealed_opponent_bench_slots, 2);
    assert!(!report.snapshot.speed_comparisons.is_empty());

    // 2. 期待勝率と候補手・悪手判定の検証
    assert!(report.expected_win_rate >= 0.0 && report.expected_win_rate <= 1.0);
    assert!(report.best_action_win_rate >= 0.0 && report.best_action_win_rate <= 1.0);
    assert!(!report.candidates.is_empty());
    assert!(matches!(
        report.action_quality,
        Some(ActionQuality::Best)
            | Some(ActionQuality::Good)
            | Some(ActionQuality::Inaccuracy)
            | Some(ActionQuality::Blunder)
            | None
    ));
}

#[test]
fn test_pbn_and_pkf_binary_base64url_lossless_roundtrip() {
    use kifu::{EventProvenance, MatchOutcome, TurnAnnotation};

    let p1_action = PlayerActionJs {
        slot_a: SlotActionJs {
            choice: "air-slash".to_string(),
            target: 1,
            mega: true,
        },
        slot_b: SlotActionJs {
            choice: "earthquake".to_string(),
            target: 0,
            mega: false,
        },
    };

    let best_action = PlayerActionJs {
        slot_a: SlotActionJs {
            choice: "flamethrower".to_string(),
            target: 2,
            mega: true,
        },
        slot_b: SlotActionJs {
            choice: "extreme-speed".to_string(),
            target: 1,
            mega: false,
        },
    };

    let kifu = BattleKifu {
        regulation: Regulation::MA,
        is_open_team_sheet: false,
        result: MatchOutcome::P1Win,
        p1_team: make_p1_team(),
        p1_selection: [0, 1, 2, 3],
        p2_preview: make_cts_preview(),
        lead_timestamp_ms: Some(4200),
        lead_events: vec![
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 0,
                team_index: 0,
                species: "charizard".to_string(),
                hp: ObservedHp::Exact {
                    current: 153,
                    max: 153,
                },
            },
            ObservedEvent::SwitchIn {
                player: 1,
                slot: 1,
                team_index: 1,
                species: "dragonite".to_string(),
                hp: ObservedHp::Exact {
                    current: 166,
                    max: 166,
                },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 0,
                team_index: 0,
                species: "incineroar".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::SwitchIn {
                player: 2,
                slot: 1,
                team_index: 4,
                species: "rillaboom".to_string(),
                hp: ObservedHp::Percent { percent: 100 },
            },
            ObservedEvent::AbilityTriggered {
                source: PokemonIdent::from("p2a"),
                ability: "intimidate".to_string(),
            },
            ObservedEvent::StatStageChanged {
                target: PokemonIdent::from("p1a"),
                stat: "atk".to_string(),
                delta: -1,
            },
            ObservedEvent::AbilityTriggered {
                source: PokemonIdent::from("p1b"),
                ability: "inner-focus".to_string(),
            },
        ],
        lead_provenance: vec![
            EventProvenance {
                timestamp_ms: Some(4300),
                confidence: Some(99),
                needs_review: false,
                comment: None,
                note: None,
            },
            EventProvenance::default(),
            EventProvenance::default(),
            EventProvenance::default(),
            EventProvenance {
                timestamp_ms: Some(5800),
                confidence: Some(95),
                needs_review: false,
                comment: Some("いかく発動".to_string()),
                note: None,
            },
            EventProvenance::default(),
            EventProvenance::default(),
        ],
        turns: vec![TurnRecord {
            turn_number: 1,
            p1_action: p1_action.clone(),
            p2_action: None,
            annotation: TurnAnnotation {
                comment: Some("相手のねこだましをケアしつつメガシンカ".to_string()),
                timestamp_ms: Some(12500),
                eval_win_rate: Some(0.642),
                best_action: Some(best_action.clone()),
                action_quality: Some(ActionQuality::Good),
            },
            events: vec![
                ObservedEvent::MegaEvolve {
                    target: PokemonIdent::from("p1a"),
                    mega_species: "charizard-mega-y".to_string(),
                    item: "-".to_string(),
                },
                ObservedEvent::AbilityTriggered {
                    source: PokemonIdent::from("p1a"),
                    ability: "drought".to_string(),
                },
                ObservedEvent::WeatherChanged {
                    weather: Some("Sun".to_string()),
                },
                ObservedEvent::MoveUsed {
                    attacker: PokemonIdent::from("p2b"),
                    move_id: "fake-out".to_string(),
                    target: Some(PokemonIdent::from("p1a")),
                },
                ObservedEvent::Damage {
                    target: PokemonIdent::from("p1a"),
                    hp_after: ObservedHp::Exact {
                        current: 121,
                        max: 153,
                    },
                    damage_exact: Some(32),
                    is_crit: false,
                    effectiveness: Some(0),
                    from_effect: None,
                    attacker: Some(PokemonIdent::from("p2b")),
                    move_id: Some("fake-out".to_string()),
                    is_spread: false,
                },
            ],
            event_provenance: vec![
                EventProvenance::default(),
                EventProvenance::default(),
                EventProvenance::default(),
                EventProvenance::default(),
                EventProvenance {
                    timestamp_ms: Some(18400),
                    confidence: Some(82),
                    needs_review: true,
                    comment: Some("エフェクト重なりでHPバー要確認".to_string()),
                    note: None,
                },
            ],
            field_effects: vec!["Sun 1/5".to_string()],
            state_effects: vec![
                "p1:".to_string(),
                "active: raichu 183/183".to_string(),
                "bench: incineroar 234/234".to_string(),
                "p2:".to_string(),
                "active: garchomp 100%".to_string(),
                "bench: 2 alive".to_string(),
            ],
        }],
    };

    // 1. PBN テキスト双方向変換の検証
    let pbn_text = kifu.to_pbn();
    assert!(pbn_text.contains("[PBN \"1.0\"]"));
    assert!(pbn_text.contains("[Sheet \"CTS\"]"));
    assert!(pbn_text.contains("[Result \"WIN\"]"));
    assert!(pbn_text.contains("@turn 1 @t=12500ms @eval=64.2%"));
    assert!(pbn_text.contains("@field Sun 1/5"));
    assert!(pbn_text.contains("@state"));
    assert!(pbn_text.contains("  p1:"));
    assert!(pbn_text.contains("| active: raichu 183/183"));
    assert!(pbn_text.contains("| bench: incineroar 234/234"));
    assert!(pbn_text.contains("  p2:"));
    assert!(pbn_text.contains("| active: garchomp 100%"));
    assert!(pbn_text.contains("| bench: 2 alive"));
    assert!(pbn_text.contains("@review"));

    let from_pbn = BattleKifu::from_pbn(&pbn_text).expect("Should parse generated PBN cleanly");
    assert_eq!(from_pbn.regulation, kifu.regulation);
    assert_eq!(from_pbn.is_open_team_sheet, kifu.is_open_team_sheet);
    assert_eq!(from_pbn.result, kifu.result);
    assert_eq!(from_pbn.p1_selection, kifu.p1_selection);
    assert_eq!(from_pbn.lead_timestamp_ms, Some(4200));
    assert_eq!(from_pbn.lead_events, kifu.lead_events);
    assert_eq!(from_pbn.turns.len(), 1);
    assert_eq!(from_pbn.turns[0].p1_action, p1_action);
    assert_eq!(from_pbn.turns[0].field_effects, vec!["Sun 1/5".to_string()]);
    assert_eq!(
        from_pbn.turns[0].state_effects,
        vec![
            "p1:".to_string(),
            "active: raichu 183/183".to_string(),
            "bench: incineroar 234/234".to_string(),
            "p2:".to_string(),
            "active: garchomp 100%".to_string(),
            "bench: 2 alive".to_string(),
        ]
    );
    assert_eq!(from_pbn.turns[0].events, kifu.turns[0].events);
    assert_eq!(
        from_pbn.turns[0].annotation.comment.as_deref(),
        Some("相手のねこだましをケアしつつメガシンカ")
    );
    assert_eq!(
        from_pbn.turns[0].annotation.action_quality,
        Some(ActionQuality::Good)
    );
    assert_eq!(from_pbn.turns[0].annotation.best_action, Some(best_action));
    assert!(from_pbn.turns[0].event_provenance[4].needs_review);

    // 2. PKF バイナリおよび Base64URL 双方向変換の検証
    let pkf_bytes = kifu.to_pkf_bytes();
    assert_eq!(&pkf_bytes[0..4], b"PKF\x01");
    // PBNテキストよりもさらにコンパクトであること
    assert!(
        pkf_bytes.len() < pbn_text.len(),
        "PKF binary ({} bytes) should be smaller than PBN text ({} bytes)",
        pkf_bytes.len(),
        pbn_text.len()
    );

    let from_pkf =
        BattleKifu::from_pkf_bytes(&pkf_bytes).expect("Should decode PKF binary cleanly");
    assert_eq!(from_pkf.regulation, kifu.regulation);
    assert_eq!(from_pkf.result, kifu.result);
    assert_eq!(from_pkf.lead_events, kifu.lead_events);
    assert_eq!(from_pkf.lead_provenance, kifu.lead_provenance);
    assert_eq!(from_pkf.turns[0].events, kifu.turns[0].events);
    assert_eq!(
        from_pkf.turns[0].event_provenance,
        kifu.turns[0].event_provenance
    );
    assert_eq!(from_pkf.turns[0].annotation, kifu.turns[0].annotation);

    let b64 = kifu.to_pkf_base64url();
    let from_b64 =
        BattleKifu::from_pkf_base64url(&b64).expect("Should decode Base64URL PKF cleanly");
    assert_eq!(from_b64.turns[0].events, kifu.turns[0].events);
}

#[test]
fn test_parse_target_outcome_lines_under_spread_move() {
    let pbn = r#"
[PBN "1.0"]
[Regulation "M-C"]
[Sheet "CTS"]
[Result "WIN"]

@p1 0 incineroar @ sitrus-berry | intimidate | Careful H32 D32+ | 200,135,110,90,150,80 | snarl, fake-out
@select 0, 1, 2, 3
@p2 0 garchomp
@p2 1 farigiraf

@lead
  switch p1a incineroar 200/200
  switch p2a garchomp 100%
  switch p2b farigiraf 100%

@turn 1
  @cmd p1a: snarl | p1b: pass
  mega p2a garchomp-mega-z
  move p1a snarl {
    target p2a: 100% -> 88%, spa -1
    target p2b: 100% -> 80%, spa -1
  }
"#;

    let kifu = BattleKifu::from_pbn(pbn).expect("Should parse target outcome lines");
    assert_eq!(kifu.turns.len(), 1);
    let events = &kifu.turns[0].events;
    assert_eq!(events.len(), 6);
    match &events[2] {
        ObservedEvent::Damage {
            target,
            hp_after,
            damage_exact,
            attacker,
            move_id,
            ..
        } => {
            assert_eq!(target.to_string(), "p2a");
            assert_eq!(*hp_after, ObservedHp::Percent { percent: 88 });
            assert_eq!(*damage_exact, Some(12));
            assert_eq!(attacker.map(|a| a.to_string()), Some("p1a".to_string()));
            assert_eq!(move_id.as_deref(), Some("snarl"));
        }
        _ => panic!("Expected damage event for p2a"),
    }
    match &events[3] {
        ObservedEvent::StatStageChanged {
            target,
            stat,
            delta,
        } => {
            assert_eq!(target.to_string(), "p2a");
            assert_eq!(stat, "spa");
            assert_eq!(*delta, -1);
        }
        _ => panic!("Expected stat stage event for p2a"),
    }
}

#[test]
fn test_parse_inline_move_target_outcomes_under_spread_move() {
    let pbn = r#"
[PBN "1.0"]
@turn 1
  @cmd p1a: snarl | p1b: pass
  mega p2a garchomp-mega-z
  move p1a snarl -> p2a: 100% -> 88% (-12%), spa -1 | p2b: 100% -> 80% (-20%), spa -1
"#;

    let kifu = BattleKifu::from_pbn(pbn).expect("Should parse inline move target outcomes");
    assert_eq!(kifu.turns.len(), 1);
    let events = &kifu.turns[0].events;
    assert_eq!(events.len(), 6);
    match &events[2] {
        ObservedEvent::Damage {
            target,
            hp_after,
            damage_exact,
            attacker,
            move_id,
            ..
        } => {
            assert_eq!(target.to_string(), "p2a");
            assert_eq!(*hp_after, ObservedHp::Percent { percent: 88 });
            assert_eq!(*damage_exact, Some(12));
            assert_eq!(attacker.map(|a| a.to_string()), Some("p1a".to_string()));
            assert_eq!(move_id.as_deref(), Some("snarl"));
        }
        _ => panic!("Expected damage event for p2a"),
    }
    match &events[3] {
        ObservedEvent::StatStageChanged {
            target,
            stat,
            delta,
        } => {
            assert_eq!(target.to_string(), "p2a");
            assert_eq!(stat, "spa");
            assert_eq!(*delta, -1);
        }
        _ => panic!("Expected stat stage event for p2a"),
    }
}

#[test]
fn test_pbn_roundtrip_sample_walkthrough() {
    let pbn = r#"[PBN "1.0"]
[Regulation "M-C"]
[Sheet "CTS"]
[Result "WIN"]

# ==============================================================================
# P1（自軍）パーティ登録情報 (6匹)
# ==============================================================================
@p1 0 raichu @ raichunite-y | lightning-rod | Timid H24 B10 S32+ | 183,99,95,110,100,213 | zap-cannon, focus-blast, encore, protect
@p1 1 incineroar @ sitrus-berry | intimidate | Impish H32 A3 B10+ D11 S10 | 234,141,143,90,132,100 | flare-blitz, snarl, parting-shot, fake-out
@p1 2 rillaboom @ miracle-seed | grassy-surge | Adamant H17 A26+ S23 | 209,216,110,72,90,151 | grassy-glide, wood-hammer, high-horsepower, fake-out
@p1 3 basculegion-male @ choice-scarf | adaptability | Jolly H1 A32 B1 S32+ | 197,196,87,90,95,178 | last-respects, wave-crash, flip-turn, icy-wind
@p1 4 volcarona @ grassy-seed | flame-body | Modest H32 B29 C5+ | 224,72,143,181,125,120 | overheat, struggle-bug, rage-powder, tailwind
@p1 5 salamence @ salamencite | intimidate | Mild H1 C32+ D1 S32 | 172,155,90,213,102,184 | hyper-voice, double-edge, tailwind, protect

# 選出4匹: 先発(ボーマンダ#5, ガオガエン#1), 後発(ゴリランダー#2, ウルガモス#4)
@select 5, 1, 2, 4

# ==============================================================================
# P2（相手）見せ合い情報 (6匹)
# ==============================================================================
@p2 0 golisopod
@p2 1 rillaboom
@p2 2 farigiraf
@p2 3 pelipper
@p2 4 garchomp
@p2 5 archaludon

# ==============================================================================
# リード（Turn 0）: 先発の繰り出しと入場時特性の発動順序
# ==============================================================================
@lead @t=106000ms
  switch p2b farigiraf 100%
  switch p2a garchomp 100%
  switch p1a salamence 172/172
  switch p1b incineroar 234/234
  ability p1a intimidate {
    target p2a: atk -1
    target p2b: atk -1
  }
  ability p1b intimidate {
    target p2a: atk -1
    target p2b: atk -1
  }

# ==============================================================================
# Turn 1: 相手メガシンカ + てだすけ + まもる（竜の波動遮断）+ バークアウト
# ==============================================================================
@turn 1 @t=120000ms
  @cmd p1a: protect | p1b: snarl
  mega p2a garchomp-mega-z
  move p2b helping-hand -> p2a
  move p1a protect
  move p2a dragon-pulse -> p1a { protected }
  move p1b snarl {
    target p2a: 100% -> 88%, spa -1
    target p2b: 100% -> 80%, spa -1
  }

# ==============================================================================
# Turn 2: 交代 + グラスメイカー + トリックルーム始動
# ==============================================================================
@turn 2 @t=174000ms
  @cmd p1a: switch rillaboom | p1b: snarl
  switch p2a archaludon 100%
  switch p1a rillaboom 209/209 {
    ability p1a grassy-surge
    terrain Grassy
  }
  move p1b snarl {
    target p2a: 100% -> 92%, spa -1 {
      ability p2a stamina
      boost p2a def +1
    }
    target p2b: 80% -> 62%, spa -1
  }
  move p2b trick-room {
    field trick-room on
  }

# ==============================================================================
# Turn 3: ターン開始時にグラスフィールドとトリックルームが有効 (2/5ターン目)
# ==============================================================================
@turn 3 @t=391000ms
  @field
    | entire: Grassy 2/5, Trick Room 2/5
    | p1: Tailwind 2/4
  @state
  p1:
    | active: rillaboom 209/209, incineroar 234/234
    | bench: volcarona 224/224, salamence fnt
  p2:
    | active: archaludon 92% (def +1, spa -1), farigiraf 62% [par] (spa -1)
    | bench: golisopod 100%, ? 100%
  @cmd p1a: wood-hammer -> p2b | p1b: flare-blitz -> p2b
  move p2b electro-shot {
    target p1b: 234/234 -> 126/234
  }
"#;

    let kifu = BattleKifu::from_pbn(pbn).expect("Should parse sample walkthrough PBN");
    assert_eq!(kifu.p1_team.len(), 6);
    assert_eq!(kifu.p2_preview.len(), 6);
    assert_eq!(kifu.p1_selection, [5, 1, 2, 4]);
    assert_eq!(kifu.turns.len(), 3);

    // Turn 1 check
    let t1 = &kifu.turns[0];
    assert_eq!(t1.turn_number, 1);
    assert_eq!(t1.annotation.timestamp_ms, Some(120000));
    assert_eq!(t1.p1_action.slot_a.choice, "protect");
    assert_eq!(t1.p1_action.slot_b.choice, "snarl");

    // Turn 2 check
    let t2 = &kifu.turns[1];
    assert_eq!(t2.turn_number, 2);
    assert_eq!(t2.annotation.timestamp_ms, Some(174000));

    // Turn 3 check
    let t3 = &kifu.turns[2];
    assert_eq!(t3.turn_number, 3);
    assert_eq!(t3.annotation.timestamp_ms, Some(391000));
    assert_eq!(t3.field_effects.len(), 2);
    assert_eq!(t3.field_effects[0], "entire: Grassy 2/5, Trick Room 2/5");
    assert_eq!(t3.field_effects[1], "p1: Tailwind 2/4");
    assert_eq!(t3.state_effects.len(), 6);
    assert_eq!(t3.state_effects[0], "p1:");
    assert_eq!(
        t3.state_effects[1],
        "active: rillaboom 209/209, incineroar 234/234"
    );
    assert_eq!(
        t3.state_effects[2],
        "bench: volcarona 224/224, salamence fnt"
    );
    assert_eq!(t3.state_effects[3], "p2:");
    assert_eq!(
        t3.state_effects[4],
        "active: archaludon 92% (def +1, spa -1), farigiraf 62% [par] (spa -1)"
    );
    assert_eq!(t3.state_effects[5], "bench: golisopod 100%, ? 100%");

    // Roundtrip to PBN and parse back
    let serialized = kifu.to_pbn();
    let reparsed = BattleKifu::from_pbn(&serialized).expect("Should parse back serialized PBN");
    assert_eq!(reparsed.turns.len(), 3);
    assert_eq!(reparsed.p1_team.len(), 6);
    assert_eq!(reparsed.p1_selection, [5, 1, 2, 4]);
    assert_eq!(
        reparsed.turns[2].field_effects,
        vec![
            "entire: Grassy 2/5, Trick Room 2/5".to_string(),
            "p1: Tailwind 2/4".to_string()
        ]
    );
    assert_eq!(
        reparsed.turns[2].state_effects,
        vec![
            "p1:".to_string(),
            "active: rillaboom 209/209, incineroar 234/234".to_string(),
            "bench: volcarona 224/224, salamence fnt".to_string(),
            "p2:".to_string(),
            "active: archaludon 92% (def +1, spa -1), farigiraf 62% [par] (spa -1)".to_string(),
            "bench: golisopod 100%, ? 100%".to_string()
        ]
    );
}

#[test]
fn test_annotate_pbn_with_evaluation_and_kifu_methods() {
    let raw_pbn = r#"[PBN "1.0"]
[Regulation "Champions"]
[Sheet "CTS"]
[Result "WIN"]

@p1 0 rillaboom @ miracle-seed | grassy-surge | Adamant A32 S32 | 205,194,110,72,90,137 | wood-hammer, grassy-glide, high-horsepower, fake-out
@p1 1 incineroar @ sitrus-berry | intimidate | Careful H32 D32 | 200,135,110,90,154,80 | flare-blitz, knock-off, parting-shot, fake-out
@p1 2 flutter-mane @ booster-energy | protosynthesis | Timid C32 S32 | 130,67,75,187,155,205 | moonblast, shadow-ball, dazzling-gleam, protect
@p1 3 urshifu-rapid-strike @ choice-scarf | unseen-fist | Jolly A32 S32 | 175,182,120,74,80,163 | surging-strikes, close-combat, aqua-jet, u-turn
@p1 4 archaludon @ assault-vest | stamina | Modest H32 C32 | 195,112,150,192,85,105 | flash-cannon, draco-meteor, body-press, electro-shot
@p1 5 ogerpon-hearthflame @ hearthflame-mask | mold-breaker | Jolly A32 S32 | 155,172,104,72,116,178 | ivy-cudgel, horn-leech, follow-me, spiky-shield
@select 0, 1, 2, 3

@p2 0 archaludon
@p2 1 farigiraf
@p2 2 urshifu-rapid-strike
@p2 3 incineroar
@p2 4 flutter-mane
@p2 5 rillaboom

@lead @t=0ms
  switch p1a rillaboom 205/205
  switch p1b incineroar 200/200
  switch p2a archaludon 100%
  switch p2b farigiraf 100%

@turn 1 @t=10000ms
  @field Grassy 1/5
  @state
  p1:
    | active: rillaboom 205/205, incineroar 200/200
    | bench: flutter-mane 130/130, urshifu-rapid-strike 175/175
  p2:
    | active: archaludon 100%, farigiraf 100%
    | bench: ? 100%, ? 100%
  @cmd p1a: fake-out -> p2a | p1b: knock-off -> p2b
  move p1a fake-out p2a
  damage p2a 100% -> 92%
  move p1b knock-off p2b
  damage p2b 100% -> 58%
"#;

    // 1. BattleKifu::annotate_turn_with_evaluation
    let mut kifu = BattleKifu::from_pbn(raw_pbn).expect("PBN should parse cleanly");
    assert!(kifu.turns[0].annotation.eval_win_rate.is_none());

    let ann = kifu
        .annotate_turn_with_evaluation(0, Some(25))
        .expect("annotate_turn_with_evaluation should succeed");
    assert!(ann.eval_win_rate.is_some());
    assert!(ann.best_action.is_some());

    let pbn_turn0 = kifu.to_pbn();
    assert!(pbn_turn0.contains("@turn 1"));
    assert!(pbn_turn0.contains("@eval="));
    assert!(pbn_turn0.contains("@best="));

    // 2. wasm_api::annotate_pbn_with_evaluation directly on full PBN
    let annotated_pbn = crate::wasm_api::annotate_pbn_with_evaluation(raw_pbn, None, Some(20))
        .expect("annotate_pbn_with_evaluation should succeed");
    assert!(annotated_pbn.contains("@turn 1"));
    assert!(annotated_pbn.contains("@eval="));
    assert!(annotated_pbn.contains("@best="));
    assert!(annotated_pbn.contains("@state"));

    // 3. Ensure annotated PBN can be roundtrip parsed back into BattleKifu losslessly
    let reparsed = BattleKifu::from_pbn(&annotated_pbn).expect("Annotated PBN must parse back");
    assert_eq!(reparsed.turns.len(), 1);
    assert!(reparsed.turns[0].annotation.eval_win_rate.is_some());
    assert!(reparsed.turns[0].annotation.best_action.is_some());
}
