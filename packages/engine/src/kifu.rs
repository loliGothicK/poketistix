use crate::sim::pokemon::PokemonIdent;
use crate::wasm_api::{Boosts, InputPokemonData, PlayerActionJs};
use pkmn_meta::Regulation;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

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
/// CTS では `species` のみ、OTS では `known_item`, `known_ability`, `known_moves` も埋まる
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
        /// P1 の場合は `p1_team` 内のインデックス (0..6)、P2 の場合は `p2_preview` 内のインデックス (0..6)
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
    /// 状態異常の付与・回復
    StatusChanged {
        target: PokemonIdent,
        status: Option<String>,
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
    /// 元動画における発生時刻 (ミリ秒)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp_ms: Option<u32>,
    /// OCR / 画像認識の信頼度 (0..=100%)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<u8>,
    /// ユーザーによる目視確認を推奨するフラグ
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub needs_review: bool,
    /// イベント行に付与されたインラインコメント
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

impl EventProvenance {
    pub fn is_empty(&self) -> bool {
        self.timestamp_ms.is_none()
            && self.confidence.is_none()
            && !self.needs_review
            && self.comment.is_none()
    }
}

/// ターン単位のAI評価値キャッシュ・振り返りコメント注釈
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, Tsify)]
pub struct TurnAnnotation {
    /// プレイヤーまたは解析者の振り返りコメント
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// ターン開始時の動画タイムスタンプ (ミリ秒)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp_ms: Option<u32>,
    /// キャッシュされた期待勝率 [0.0, 1.0]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eval_win_rate: Option<f64>,
    /// キャッシュされたAI推奨最善手
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub best_action: Option<PlayerActionJs>,
    /// キャッシュされた実戦手の評価分類
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
    /// P1（自分）がそのターン開始時に選択した行動
    pub p1_action: PlayerActionJs,
    /// P2（相手）の選択行動（リプレイ等で後から判明している場合のみ記録、通常は None でもイベント列から推論可能）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub p2_action: Option<PlayerActionJs>,
    /// そのターン中に発生した観測イベント列（発生順）
    pub events: Vec<ObservedEvent>,
    /// ターン単位の注釈・AI評価値キャッシュ・動画タイムスタンプ
    #[serde(default, skip_serializing_if = "TurnAnnotation::is_empty")]
    pub annotation: TurnAnnotation,
    /// `events` の各要素に対応する動画OCR証跡メタデータ（空または `events.len()` 以下）
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub event_provenance: Vec<EventProvenance>,
    /// ターン開始時に有効な場の状態（天候・フィールド・トリックルーム等、例: `Rain 3/5`, `Grassy 2/5`）
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub field_effects: Vec<String>,
}

/// Showdown 非依存の新しい Ranked Battle 棋譜フォーマット (PKF-JSON AST)
#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct BattleKifu {
    /// レギュレーション ("M-A", "M-B", "M-C")
    pub regulation: Regulation,
    /// OTS (Open Team Sheet) かどうか（false なら CTS）
    #[serde(default)]
    pub is_open_team_sheet: bool,
    /// 対戦の勝敗結果
    #[serde(default)]
    pub result: MatchOutcome,
    /// 自軍の6匹（完全情報）
    pub p1_team: Vec<InputPokemonData>,
    /// 自軍が選出した4匹の `p1_team` インデックス `[lead_a, lead_b, bench_1, bench_2]`
    pub p1_selection: [usize; 4],
    /// 相手の見せ合い6匹
    pub p2_preview: Vec<OpponentPreviewSlot>,
    /// Turn 1 コマンド選択前に発生する繰り出し・入場時特性発動イベント列
    pub lead_events: Vec<ObservedEvent>,
    /// Lead フェーズ開始時の動画タイムスタンプ (ミリ秒)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lead_timestamp_ms: Option<u32>,
    /// `lead_events` の各要素に対応する動画OCR証跡メタデータ
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub lead_provenance: Vec<EventProvenance>,
    /// 各ターンの記録
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

pub mod pbn;
pub mod pkf_bin;
pub mod video_analyzer;

// =========================================================================
// 状況可視化・評価値出力用データ構造 (Goal 1, 2, 3)
// =========================================================================

/// 2匹間の実効素早さ関係の推論結果
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub enum SpeedOrderKnowledge {
    /// 主体側が確定で速い（トリル下なら先に行動する意味ではなく素の実効S比較）
    Faster,
    /// 主体側が確定で遅い
    Slower,
    /// 同速または相手のS振り次第で逆転しうる不確定領域
    Ambiguous,
}

/// 相手ポケモン1匹の推論状態ビュー（可視化用）
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
    /// 推論された HP 実数値レンジ `(min, max)`
    pub hp_stat_range: (u16, u16),
    /// 推論された攻撃実数値レンジ `(min, max)`
    pub atk_stat_range: (u16, u16),
    /// 推論された防御実数値レンジ `(min, max)`
    pub def_stat_range: (u16, u16),
    /// 推論された特攻実数値レンジ `(min, max)`
    pub spa_stat_range: (u16, u16),
    /// 推論された特防実数値レンジ `(min, max)`
    pub spd_stat_range: (u16, u16),
    /// 推論された素早さ実数値レンジ `(min, max)`
    pub spe_stat_range: (u16, u16),
}

/// 場の4匹の素早さ関係エントリ
#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct ActiveSpeedComparison {
    pub p1_slot: usize,
    pub p2_slot: usize,
    pub p1_effective_speed: u16,
    pub p2_effective_speed_range: (u16, u16),
    pub knowledge: SpeedOrderKnowledge,
}

/// 特定ターン時点での盤面可視化スナップショット (Goal 2: 状況を可視化できる)
#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct TurnSnapshotView {
    pub turn_number: u16,
    pub weather: Option<String>,
    pub terrain: Option<String>,
    pub trick_room: bool,
    pub p1_tailwind: bool,
    pub p2_tailwind: bool,
    /// P1 の場のポケモン評価値（縛り・まもる・このゆび考慮後）
    pub p1_board_values: [f64; 2],
    /// P2 の場のポケモン評価値（代表値での推定）
    pub p2_board_values: [f64; 2],
    /// P1 アクティブ vs P2 アクティブの実効素早さ比較
    pub speed_comparisons: Vec<ActiveSpeedComparison>,
    /// 相手6匹それぞれの推論状態（選出判明・技・持ち物・実数値レンジ）
    pub opponent_beliefs: Vec<OpponentPokemonBeliefView>,
    /// 相手の残り選出枠数（まだ割れていない控えの数: 0..=2）
    pub unrevealed_opponent_bench_slots: usize,
}

/// 実戦手の評価分類
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub enum ActionQuality {
    /// 最善手または最善手とほぼ同等の勝率 (乖離 <= 2%)
    Best,
    /// 好手・有力手 (乖離 <= 6%)
    Good,
    /// 疑問手 (乖離 <= 15%)
    Inaccuracy,
    /// 悪手・敗着級 (乖離 > 15%)
    Blunder,
}

/// 棋譜の1ターンに対する AI 解析・評価値レポート (Goal 1 & Goal 3)
#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct TurnEvaluationReport {
    pub turn_number: u16,
    /// そのターン開始時点の盤面可視化スナップショット
    pub snapshot: TurnSnapshotView,
    /// 不完全情報の分布平均による現在局面の期待勝率 [0.0, 1.0]
    pub expected_win_rate: f64,
    /// AI が推奨する最善手
    pub best_action: PlayerActionJs,
    /// 最善手を選んだ場合の期待勝率 [0.0, 1.0]
    pub best_action_win_rate: f64,
    /// 実戦でプレイヤーが選んだ手
    pub actual_action: PlayerActionJs,
    /// 実戦手の期待勝率 [0.0, 1.0]
    pub actual_action_win_rate: Option<f64>,
    /// 最善手との勝率差分 (actual - best, <= 0.0)
    pub win_rate_delta: Option<f64>,
    /// 実戦手の評価分類
    pub action_quality: Option<ActionQuality>,
    /// 上位候補手のリスト（訪問数・勝率・読み筋 PV 付き）
    pub candidates: Vec<crate::wasm_api::CandidateAnalysisJs>,
}
