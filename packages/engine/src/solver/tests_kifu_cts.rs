//! CTS / OTS 棋譜 (`BattleKifu`) からの不完全情報推定 (`BeliefState`)・確定化サンプリング (`Determinizer`)・
//! 情報集合MCTS (`Ismcts::evaluate_kifu_turn`) の単体テスト群

use crate::kifu::{
    ActionQuality, BattleKifu, ObservedEvent, ObservedHp, OpponentPreviewSlot, SpeedOrderKnowledge,
    TurnRecord,
};
use crate::sim::pokemon::PokemonIdent;
use crate::solver::belief::{BeliefState, calc_hp_lv50, calc_stat_lv50};
use crate::solver::determinizer::Determinizer;
use crate::solver::ismcts::{Ismcts, IsmctsConfig};
use crate::wasm_api::{InputPokemonData, PlayerActionJs, SlotActionJs};
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
        }],
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
    // いじっぱりA32振り garchomp の攻撃実数値 = calc_stat_lv50(130, 32, 1) = 200
    let chomp_atk = calc_stat_lv50(130, 32, 1);
    assert_eq!(chomp_atk, 200);

    // P1a: charizard (SpA 161) が P2b: rillaboom (index 4, H32振り HP=207, D0振り SpD=90) に air-slash (威力75, 特殊ひこう, STAB 1.5x, 弱点 2.0x)
    let rilla_hp = calc_hp_lv50("rillaboom", 100, 32);
    let rilla_spd = calc_stat_lv50(70, 0, 0);
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
        }],
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
            },
        ],
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
        }],
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
