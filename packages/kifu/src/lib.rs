use pkmn_meta::Regulation;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

pub mod types;
pub use types::*;

pub mod pbn;
pub mod pkf_bin;
pub mod wasm_api;

/// HP の観測値（自軍は実数値、相手は『Pokémon Champions』画面表示の百分率 0..=100%）
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "kind")]
pub enum ObservedHp {
    /// 自軍など実数値が確定している場合 (例: 155 / 175)
    Exact { current: u16, max: u16 },
    /// 相手HPの百分率表示 (0..=100%)
    Percent { percent: u8 },
    /// エフェクト重なり等で一時的にOCR読み取り不能だった場合
    Unknown,
}

impl ObservedHp {
    pub fn exact(current: u16, max: u16) -> Self {
        Self::Exact { current, max }
    }

    pub fn percent(percent: u8) -> Self {
        Self::Percent {
            percent: percent.min(100),
        }
    }

    pub fn is_fainted(&self) -> bool {
        match self {
            Self::Exact { current, .. } => *current == 0,
            Self::Percent { percent } => *percent == 0,
            Self::Unknown => false,
        }
    }
}

/// 見せ合い（Team Preview）時点での相手ポケモン1匹分の初期情報
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub struct OpponentPreviewSlot {
    pub preview_index: u8,
    pub species: String,
    #[serde(default)]
    pub known_item: Option<String>,
    #[serde(default)]
    pub known_ability: Option<String>,
    #[serde(default)]
    pub known_moves: Vec<String>,
}

/// 対戦中にプレイヤー視点（または動画OCR）で観測されたイベント
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(tag = "type")]
pub enum ObservedEvent {
    /// ポケモンの繰り出し（先発登場、交代、死に出し）
    SwitchIn {
        player: u8,
        slot: usize,
        team_index: u8,
        species: String,
        hp: ObservedHp,
    },
    /// メガシンカの発動
    MegaEvolve {
        target: PokemonIdent,
        mega_species: String,
        item: String,
    },
    /// 技の使用宣言・発動（行動順の記録を兼ねる）
    MoveUsed {
        attacker: PokemonIdent,
        move_id: String,
        #[serde(default)]
        target: Option<PokemonIdent>,
    },
    /// ダメージ発生（技ダメージまたは定数ダメージ）
    Damage {
        target: PokemonIdent,
        hp_after: ObservedHp,
        #[serde(default)]
        damage_exact: Option<u16>,
        #[serde(default)]
        is_crit: bool,
        #[serde(default)]
        effectiveness: Option<i8>,
        #[serde(default)]
        from_effect: Option<String>,
        #[serde(default)]
        attacker: Option<PokemonIdent>,
        #[serde(default)]
        move_id: Option<String>,
        #[serde(default)]
        is_spread: bool,
    },
    /// HP回復
    Heal {
        target: PokemonIdent,
        hp_after: ObservedHp,
        #[serde(default)]
        from_effect: Option<String>,
    },
    /// 特性の発動表示（発動順そのものが素早さ制約になる）
    AbilityTriggered {
        source: PokemonIdent,
        ability: String,
    },
    /// 持ち物の発動・判明・消費（きあいのタスキ、きのみ、いのちのたま等）
    ItemTriggered {
        source: PokemonIdent,
        item: String,
        #[serde(default)]
        consumed: bool,
    },
    /// ランク補正の変化
    StatStageChanged {
        target: PokemonIdent,
        stat: String,
        delta: i8,
    },
    /// 状態異常・状態変化の付与・回復・解除
    StatusChanged {
        target: PokemonIdent,
        status: Option<String>,
        #[serde(default)]
        is_cure: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        from_effect: Option<String>,
    },
    /// 行動不能（まひ、ねむり、こおり、ひるみ、ちょうはつ等）
    CantMove {
        target: PokemonIdent,
        reason: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        move_id: Option<String>,
    },
    /// 技の対象に対する結果（守る、命中失敗、無効、不発など）
    MoveOutcome {
        target: Option<PokemonIdent>,
        outcome: String,
    },
    /// 天候の変化
    WeatherChanged { weather: Option<String> },
    /// フィールドの変化
    TerrainChanged { terrain: Option<String> },
    /// 全体場の状態変化（トリックルーム等）
    FieldConditionChanged { condition: String, active: bool },
    /// 陣地状態の変化（おいかぜ、リフレクター、ひかりのかべ等）
    SideConditionChanged {
        player: u8,
        condition: String,
        active: bool,
    },
    /// ひんし
    Faint { target: PokemonIdent },
}

/// 対戦の勝敗結果
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub enum MatchOutcome {
    #[default]
    Unknown,
    #[serde(rename = "WIN")]
    P1Win,
    #[serde(rename = "LOSS")]
    P2Win,
    #[serde(rename = "DRAW")]
    Draw,
}

/// 動画OCRからの抽出証跡およびイベント単位の注釈メタデータ
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub struct EventProvenance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp_ms: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<u8>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub needs_review: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

impl EventProvenance {
    pub fn is_empty(&self) -> bool {
        self.timestamp_ms.is_none()
            && self.confidence.is_none()
            && !self.needs_review
            && self.comment.is_none()
            && self.note.is_none()
    }
}

/// ターン単位のAI評価値キャッシュ・振り返りコメント注釈
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, Tsify)]
pub struct TurnAnnotation {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp_ms: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eval_win_rate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub best_action: Option<PlayerActionJs>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action_quality: Option<ActionQuality>,
}

impl TurnAnnotation {
    pub fn is_empty(&self) -> bool {
        self.comment.is_none()
            && self.timestamp_ms.is_none()
            && self.eval_win_rate.is_none()
            && self.best_action.is_none()
            && self.action_quality.is_none()
    }
}

/// 1ターンの記録
#[derive(Clone, Debug, Default, Serialize, Deserialize, Tsify)]
#[serde(default)]
pub struct TurnRecord {
    pub turn_number: u16,
    pub p1_action: PlayerActionJs,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub p2_action: Option<PlayerActionJs>,
    pub events: Vec<ObservedEvent>,
    #[serde(default, skip_serializing_if = "TurnAnnotation::is_empty")]
    pub annotation: TurnAnnotation,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub event_provenance: Vec<EventProvenance>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub field_effects: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub state_effects: Vec<String>,
}

/// 完全な1試合の対戦棋譜データ構造
#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
#[serde(default)]
pub struct BattleKifu {
    pub regulation: Regulation,
    pub is_open_team_sheet: bool,
    pub result: MatchOutcome,
    pub p1_team: Vec<InputPokemonData>,
    pub p1_selection: [usize; 4],
    pub p2_preview: Vec<OpponentPreviewSlot>,
    pub lead_events: Vec<ObservedEvent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lead_timestamp_ms: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub lead_provenance: Vec<EventProvenance>,
    pub turns: Vec<TurnRecord>,
}

impl Default for BattleKifu {
    fn default() -> Self {
        Self {
            regulation: Regulation::MA,
            is_open_team_sheet: false,
            result: MatchOutcome::Unknown,
            p1_team: Vec::new(),
            p1_selection: [0, 1, 2, 3],
            p2_preview: Vec::new(),
            lead_events: Vec::new(),
            lead_timestamp_ms: None,
            lead_provenance: Vec::new(),
            turns: Vec::new(),
        }
    }
}

// =========================================================================
// 状況可視化・評価値出力用データ構造
// =========================================================================

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub enum SpeedOrderKnowledge {
    Faster,
    Slower,
    Ambiguous,
}

#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct OpponentPokemonBeliefView {
    pub preview_index: u8,
    pub species: String,
    pub revealed_in_battle: bool,
    pub is_active: bool,
    pub active_slot: Option<usize>,
    pub hp_percent: u8,
    pub status: Option<String>,
    pub boosts: Boosts,
    pub known_ability: Option<String>,
    pub candidate_abilities: Vec<String>,
    pub known_item: Option<String>,
    pub item_consumed: bool,
    pub excluded_items: Vec<String>,
    pub known_moves: Vec<String>,
    pub hp_stat_range: (u16, u16),
    pub atk_stat_range: (u16, u16),
    pub def_stat_range: (u16, u16),
    pub spa_stat_range: (u16, u16),
    pub spd_stat_range: (u16, u16),
    pub spe_stat_range: (u16, u16),
}

#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct ActiveSpeedComparison {
    pub p1_slot: usize,
    pub p2_slot: usize,
    pub p1_effective_speed: u16,
    pub p2_effective_speed_range: (u16, u16),
    pub knowledge: SpeedOrderKnowledge,
}

#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct TurnSnapshotView {
    pub turn_number: u16,
    pub weather: Option<String>,
    pub terrain: Option<String>,
    pub trick_room: bool,
    pub p1_tailwind: bool,
    pub p2_tailwind: bool,
    pub p1_board_values: [f64; 2],
    pub p2_board_values: [f64; 2],
    pub speed_comparisons: Vec<ActiveSpeedComparison>,
    pub opponent_beliefs: Vec<OpponentPokemonBeliefView>,
    pub unrevealed_opponent_bench_slots: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub enum ActionQuality {
    Best,
    Good,
    Inaccuracy,
    Blunder,
}

#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct TurnEvaluationReport {
    pub turn_number: u16,
    pub snapshot: TurnSnapshotView,
    pub expected_win_rate: f64,
    pub best_action: PlayerActionJs,
    pub best_action_win_rate: f64,
    pub actual_action: PlayerActionJs,
    pub actual_action_win_rate: Option<f64>,
    pub win_rate_delta: Option<f64>,
    pub action_quality: Option<ActionQuality>,
    pub candidates: Vec<CandidateAnalysisJs>,
}
