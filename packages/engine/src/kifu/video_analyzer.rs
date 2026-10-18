use crate::kifu::{
    BattleKifu, EventProvenance, MatchOutcome, ObservedEvent, ObservedHp, OpponentPreviewSlot,
    TurnAnnotation, TurnRecord,
};
use crate::sim::pokemon::PokemonIdent;
use crate::wasm_api::{InputPokemonData, PlayerActionJs, SlotActionJs};
use pkmn_meta::Regulation;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

/// 『Pokémon Champions』 (16:9 / 1920×1080 基準) の正規化 ROI 矩形 `[0.0, 1.0]`
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, Tsify)]
pub struct NormalizedRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl NormalizedRect {
    pub const fn from_1080p(x: u32, y: u32, width: u32, height: u32) -> Self {
        Self {
            x: x as f32 / 1920.0,
            y: y as f32 / 1080.0,
            width: width as f32 / 1920.0,
            height: height as f32 / 1080.0,
        }
    }

    pub fn to_pixel_bounds(&self, frame_width: u32, frame_height: u32) -> (u32, u32, u32, u32) {
        let x0 = ((self.x.clamp(0.0, 1.0)) * frame_width as f32).round() as u32;
        let y0 = ((self.y.clamp(0.0, 1.0)) * frame_height as f32).round() as u32;
        let x1 = (((self.x + self.width).clamp(0.0, 1.0)) * frame_width as f32).round() as u32;
        let y1 = (((self.y + self.height).clamp(0.0, 1.0)) * frame_height as f32).round() as u32;
        (
            x0.min(frame_width),
            y0.min(frame_height),
            x1.min(frame_width).max(x0.min(frame_width)),
            y1.min(frame_height).max(y0.min(frame_height)),
        )
    }
}

/// 実機キャプチャ (`1920x1080`) からキャリブレーションした標準 ROI レイアウト
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Tsify)]
pub struct ChampionsRoiLayout {
    /// 見せ合い画面：自軍6匹カード (x=80..605, y=156 + i*126, h=112)
    pub p1_preview_cards: [NormalizedRect; 6],
    /// 見せ合い画面：相手6匹カード (x=1555..1855, y=156 + i*126, h=112)
    pub p2_preview_cards: [NormalizedRect; 6],
    /// 場に出ている4匹の HUD ボックス `[P1A, P1B, P2A, P2B]`
    pub battle_huds: [NormalizedRect; 4],
    /// 4匹の HP バー走査ライン `[P1A, P1B, P2A, P2B]`
    pub hp_bars: [NormalizedRect; 4],
    /// P1A / P1B の HP 実数値テキスト領域 (`170/170` など)
    pub p1_hp_numbers: [NormalizedRect; 2],
    /// 画面下部のバトルメッセージ枠 (`x=280..1500, y=725..795`)
    pub message_box: NormalizedRect,
    /// 左側（自軍側）の特性発動ポップアップ (`x=40..380, y=360..445`)
    pub p1_ability_banner: NormalizedRect,
    /// 右側（相手側）の特性発動ポップアップ (`x=1540..1880, y=260..345`)
    pub p2_ability_banner: NormalizedRect,
    /// 左上の天候・フィールド表示 (`x=320..860, y=45..95`)
    pub weather_field_badge: NormalizedRect,
    /// 技選択メニューの4つの技カード (`x=1365..1885, y=500..960`)
    pub move_menu_slots: [NormalizedRect; 4],
    /// ターン開始時の「通信待機中 / Communicating...」ボックス (`x=840..1080, y=275..320`)
    pub communicating_box: NormalizedRect,
    /// コマンド選択時のターンタイマー表示領域 (`x=1550..1860, y=295..355`)
    pub command_timer_box: NormalizedRect,
}

impl Default for ChampionsRoiLayout {
    fn default() -> Self {
        Self {
            p1_preview_cards: [
                NormalizedRect::from_1080p(80, 156, 525, 112),
                NormalizedRect::from_1080p(80, 282, 525, 112),
                NormalizedRect::from_1080p(80, 408, 525, 112),
                NormalizedRect::from_1080p(80, 534, 525, 112),
                NormalizedRect::from_1080p(80, 660, 525, 112),
                NormalizedRect::from_1080p(80, 786, 525, 112),
            ],
            p2_preview_cards: [
                NormalizedRect::from_1080p(1555, 156, 300, 112),
                NormalizedRect::from_1080p(1555, 282, 300, 112),
                NormalizedRect::from_1080p(1555, 408, 300, 112),
                NormalizedRect::from_1080p(1555, 534, 300, 112),
                NormalizedRect::from_1080p(1555, 660, 300, 112),
                NormalizedRect::from_1080p(1555, 786, 300, 112),
            ],
            battle_huds: [
                // P1 Slot A (bottom-left)
                NormalizedRect::from_1080p(165, 928, 370, 120),
                // P1 Slot B (bottom-center-left)
                NormalizedRect::from_1080p(561, 928, 370, 120),
                // P2 Slot A (top-center-right)
                NormalizedRect::from_1080p(1208, 42, 370, 100),
                // P2 Slot B (top-right)
                NormalizedRect::from_1080p(1604, 42, 310, 100),
            ],
            hp_bars: [
                // P1 Slot A HP bar: y=1002, x=181..405 (width=224, unoccluded by 171/171)
                NormalizedRect::from_1080p(181, 1002, 224, 6),
                // P1 Slot B HP bar: y=1002, x=577..801 (width=224, unoccluded by 202/202)
                NormalizedRect::from_1080p(577, 1002, 224, 6),
                // P2 Slot A HP bar: y=118, x=1225..1449 (width=224, unoccluded by 100%)
                NormalizedRect::from_1080p(1225, 118, 224, 6),
                // P2 Slot B HP bar: y=118, x=1621..1845 (width=224, unoccluded by 100%)
                NormalizedRect::from_1080p(1621, 118, 224, 6),
            ],
            p1_hp_numbers: [
                NormalizedRect::from_1080p(260, 968, 155, 36),
                NormalizedRect::from_1080p(656, 968, 155, 36),
            ],
            message_box: NormalizedRect::from_1080p(120, 785, 1400, 80),
            p1_ability_banner: NormalizedRect::from_1080p(40, 360, 340, 85),
            p2_ability_banner: NormalizedRect::from_1080p(1540, 260, 340, 85),
            weather_field_badge: NormalizedRect::from_1080p(320, 45, 540, 50),
            move_menu_slots: [
                NormalizedRect::from_1080p(1365, 510, 515, 95),
                NormalizedRect::from_1080p(1365, 620, 515, 95),
                NormalizedRect::from_1080p(1365, 730, 515, 95),
                NormalizedRect::from_1080p(1365, 840, 515, 95),
            ],
            communicating_box: NormalizedRect::from_1080p(840, 275, 240, 45),
            command_timer_box: NormalizedRect::from_1080p(1550, 295, 310, 60),
        }
    }
}

/// 動画フレームの画面フェーズ分類
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub enum VideoScreenPhase {
    /// 見せ合い・選出フェーズ（左右に6匹ずつのカードが表示）
    TeamPreview,
    /// 対戦開始前の VS スプラッシュ画面
    VsSplash,
    /// コマンド選択フェーズ（4匹のHUDが表示され、行動を選択中）
    CommandSelect,
    /// 技選択メニュー表示中（右下に4つの技リスト、P1AまたはP1Bが緑枠でハイライト）
    MoveSelect,
    /// 両者のコマンド入力完了直後の「通信待機中 / Communicating...」表示
    Communicating,
    /// 技エフェクト・特性発動・メッセージ送り中
    BattleAnimation,
    /// 対戦終了後のレート・順位変動画面
    ResultScreen,
    /// 判定不能・暗転中
    Unknown,
}

/// HPバーの色帯状態
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub enum HpBarColorZone {
    Green,
    Yellow,
    Red,
    Empty,
    Hidden,
}

/// 単一スロットの HP バー測定結果
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub struct HpBarMeasurement {
    /// このスロットの HUD が画面上に表示されているか
    pub visible: bool,
    /// 測定された HP 百分率 (0..=100)
    pub percent: u8,
    /// HP バーの色帯 (緑 / 黄 / 赤 / 空 / 非表示)
    pub color_zone: HpBarColorZone,
}

/// 1フレームに対する高速ピクセル解析結果
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub struct VideoFrameAnalysis {
    pub timestamp_ms: u32,
    pub phase: VideoScreenPhase,
    /// `[P1A, P1B, P2A, P2B]` の HP バー測定値
    pub hp_bars: [HpBarMeasurement; 4],
    /// 技選択中にアクティブになっている自軍スロット (`Some(0)` = P1A, `Some(1)` = P1B)
    pub active_p1_slot: Option<u8>,
    /// 技選択メニューでカーソルが合っている技インデックス (`0..4`)
    pub selected_move_index: Option<u8>,
    /// 見せ合い画面で選出バッジ（白タブ）またはハイライトが付いている自軍カード (`0..6`)
    pub preview_selected_p1_indices: Vec<u8>,
    /// 下部メッセージボックスが表示されているか
    pub message_box_visible: bool,
    /// コマンド選択時のターンタイマー（MOVE TIME）が表示されているか
    pub command_timer_visible: bool,
    /// 自軍側（左）の特性発動バナーが表示されているか
    pub p1_ability_banner_visible: bool,
    /// 相手側（右）の特性発動バナーが表示されているか
    pub p2_ability_banner_visible: bool,
    /// メッセージボックス領域の視覚ハッシュ（前フレームと同一テキストかの高速判定用）
    pub message_roi_hash: u32,
    /// 特性バナー領域の視覚ハッシュ
    pub ability_roi_hash: u32,
}

#[inline]
fn sample_rgba(rgba: &[u8], width: u32, height: u32, norm_x: f32, norm_y: f32) -> (u8, u8, u8) {
    if width == 0 || height == 0 || rgba.len() < (width * height * 4) as usize {
        return (0, 0, 0);
    }
    let x = ((norm_x.clamp(0.0, 0.9999)) * width as f32) as u32;
    let y = ((norm_y.clamp(0.0, 0.9999)) * height as f32) as u32;
    let idx = ((y * width + x) * 4) as usize;
    (rgba[idx], rgba[idx + 1], rgba[idx + 2])
}

#[inline]
fn is_p1_blue_header(r: u8, g: u8, b: u8) -> bool {
    // P1 blue header: R ≈ 110..160, G ≈ 95..145, B ≈ 205..255
    b >= 190 && b > r.saturating_add(40) && b > g.saturating_add(50) && r >= 80 && g >= 75
}

#[inline]
fn is_p2_magenta_header(r: u8, g: u8, b: u8) -> bool {
    // P2 magenta header: R ≈ 175..235, G ≈ 30..85, B ≈ 105..165
    r >= 165 && g <= 95 && (90..=180).contains(&b) && r > g.saturating_add(80)
}

#[inline]
fn is_lime_highlight(r: u8, g: u8, b: u8) -> bool {
    // Active selection lime-green border/card: R ≈ 160..235, G ≈ 235..255, B <= 95
    g >= 225 && r >= 135 && b <= 105
}

#[inline]
fn is_header_band_visible(
    rgba: &[u8],
    width: u32,
    height: u32,
    hud_rect: &NormalizedRect,
    side_is_p1: bool,
) -> bool {
    let (x0, y0, x1, y1) = hud_rect.to_pixel_bounds(width, height);
    if x1 <= x0 || y1 <= y0 {
        return false;
    }

    let band_y0 = y0;
    let band_y1 = y1.min(y0 + ((y1 - y0) as f32 * 0.30).round() as u32);
    let band_w = x1 - x0;

    let mut match_votes = 0usize;
    let mut total_samples = 0usize;

    let num_x = 12u32;
    let num_y = 3u32;

    for yi in 0..num_y {
        let y = (band_y0
            + (((yi as f32 + 0.5) * (band_y1 - band_y0) as f32) / num_y as f32) as u32)
            .min(height - 1);
        for xi in 0..num_x {
            let x =
                (x0 + (((xi as f32 + 0.5) * band_w as f32) / num_x as f32) as u32).min(width - 1);
            let idx = ((y * width + x) * 4) as usize;
            if idx + 2 < rgba.len() {
                let r = rgba[idx];
                let g = rgba[idx + 1];
                let b = rgba[idx + 2];
                let matched = if side_is_p1 {
                    is_p1_blue_header(r, g, b)
                } else {
                    is_p2_magenta_header(r, g, b)
                };
                if matched {
                    match_votes += 1;
                }
                total_samples += 1;
            }
        }
    }

    total_samples > 0 && (match_votes as f32 / total_samples as f32) >= 0.12
}

/// 指定した HP バー走査領域から HP 残量 (0..=100%) と色帯を計測する
fn measure_hp_bar(
    rgba: &[u8],
    width: u32,
    height: u32,
    rect: &NormalizedRect,
    hud_visible: bool,
) -> HpBarMeasurement {
    if !hud_visible || width == 0 || height == 0 {
        return HpBarMeasurement {
            visible: false,
            percent: 0,
            color_zone: HpBarColorZone::Hidden,
        };
    }

    let (x0, y0, x1, y1) = rect.to_pixel_bounds(width, height);
    if x1 <= x0 {
        return HpBarMeasurement {
            visible: false,
            percent: 0,
            color_zone: HpBarColorZone::Hidden,
        };
    }

    let y_mid = (y0 + y1) / 2;
    let total_cols = (x1 - x0) as usize;
    let mut lit_cols = 0usize;
    let mut green_votes = 0usize;
    let mut yellow_votes = 0usize;
    let mut red_votes = 0usize;
    let mut dark_track_cols = 0usize;

    for x in x0..x1 {
        let idx = ((y_mid.min(height - 1) * width + x.min(width - 1)) * 4) as usize;
        let r = rgba[idx];
        let g = rgba[idx + 1];
        let b = rgba[idx + 2];

        // Green HP fill: R < 140, G >= 175, B < 120
        let is_green = g >= 175 && g > r.saturating_add(40) && b < 130;
        // Yellow HP fill: R >= 175, G >= 135, B < 100
        let is_yellow = r >= 175 && g >= 135 && b < 100 && !is_green;
        // Red HP fill: R >= 155, G < 95, B < 95
        let is_red = r >= 155 && g < 95 && b < 95;

        if is_green || is_yellow || is_red {
            lit_cols += 1;
            if is_green {
                green_votes += 1;
            } else if is_yellow {
                yellow_votes += 1;
            } else {
                red_votes += 1;
            }
        } else if r < 55 && g < 55 && b < 55 {
            dark_track_cols += 1;
        }
    }

    // HPバーの背景トラック＋点灯ピクセルが領域の半分未満なら HUD 非表示とみなす
    if lit_cols + dark_track_cols < total_cols / 2 {
        return HpBarMeasurement {
            visible: false,
            percent: 0,
            color_zone: HpBarColorZone::Hidden,
        };
    }

    let raw_pct = ((lit_cols as f32 / total_cols as f32) * 100.0).round() as u8;
    let percent = if lit_cols > 0 && raw_pct == 0 {
        1
    } else {
        raw_pct.min(100)
    };

    let color_zone = if lit_cols == 0 {
        HpBarColorZone::Empty
    } else if green_votes >= yellow_votes && green_votes >= red_votes {
        HpBarColorZone::Green
    } else if yellow_votes >= red_votes {
        HpBarColorZone::Yellow
    } else {
        HpBarColorZone::Red
    };

    HpBarMeasurement {
        visible: true,
        percent,
        color_zone,
    }
}

/// ROI 内の白文字ピクセル分布から高速な FNV-1a 32-bit ハッシュを計算する
fn compute_roi_luma_hash(rgba: &[u8], width: u32, height: u32, rect: &NormalizedRect) -> u32 {
    let (x0, y0, x1, y1) = rect.to_pixel_bounds(width, height);
    if x1 <= x0 || y1 <= y0 {
        return 0;
    }
    let mut hash: u32 = 0x811c_9dc5;

    let mut y = y0;
    while y < y1 {
        let mut x = x0;
        while x < x1 {
            let idx = ((y.min(height - 1) * width + x.min(width - 1)) * 4) as usize;
            let r = rgba[idx];
            let g = rgba[idx + 1];
            let b = rgba[idx + 2];
            let is_white = r > 130
                && g > 130
                && b > 130
                && (r as i32 - g as i32).abs() < 35
                && (r as i32 - b as i32).abs() < 35;
            if is_white {
                let pos = (x - x0) ^ ((y - y0) << 8);
                hash ^= pos;
                hash = hash.wrapping_mul(0x0100_0193);
            }
            x += 4;
        }
        y += 2;
    }
    hash
}

/// RGBA フレームバッファ (`width * height * 4` bytes) を解析し、画面フェーズと各 HUD の HP% を返す
pub fn analyze_video_frame_rgba(
    rgba: &[u8],
    width: u32,
    height: u32,
    timestamp_ms: u32,
    layout: Option<&ChampionsRoiLayout>,
) -> VideoFrameAnalysis {
    let default_layout = ChampionsRoiLayout::default();
    let roi = layout.unwrap_or(&default_layout);

    // 1. 4匹の HUD ヘッダー色をサンプリング
    let (p1a_r, p1a_g, p1a_b) = sample_rgba(rgba, width, height, 250.0 / 1920.0, 940.0 / 1080.0);
    let (p1b_r, p1b_g, p1b_b) = sample_rgba(rgba, width, height, 650.0 / 1920.0, 940.0 / 1080.0);
    let (p2a_r, p2a_g, p2a_b) = sample_rgba(rgba, width, height, 1300.0 / 1920.0, 56.0 / 1080.0);
    let (p2b_r, p2b_g, p2b_b) = sample_rgba(rgba, width, height, 1700.0 / 1920.0, 56.0 / 1080.0);

    let p1a_header = is_p1_blue_header(p1a_r, p1a_g, p1a_b)
        || is_header_band_visible(rgba, width, height, &roi.battle_huds[0], true);
    let p1b_header = is_p1_blue_header(p1b_r, p1b_g, p1b_b)
        || is_header_band_visible(rgba, width, height, &roi.battle_huds[1], true);
    let p2a_header = is_p2_magenta_header(p2a_r, p2a_g, p2a_b)
        || is_header_band_visible(rgba, width, height, &roi.battle_huds[2], false);
    let p2b_header = is_p2_magenta_header(p2b_r, p2b_g, p2b_b)
        || is_header_band_visible(rgba, width, height, &roi.battle_huds[3], false);

    let hp_bars = [
        measure_hp_bar(rgba, width, height, &roi.hp_bars[0], p1a_header),
        measure_hp_bar(rgba, width, height, &roi.hp_bars[1], p1b_header),
        measure_hp_bar(rgba, width, height, &roi.hp_bars[2], p2a_header),
        measure_hp_bar(rgba, width, height, &roi.hp_bars[3], p2b_header),
    ];

    // 2. 見せ合い画面 (Team Preview) の判定
    let mut preview_p1_cards = 0usize;
    let mut preview_p2_cards = 0usize;
    let mut preview_selected_p1_indices = Vec::new();
    for i in 0..6 {
        let y_sample = (200.0 + (i as f32) * 126.0) / 1080.0;
        let (lr, lg, lb) = sample_rgba(rgba, width, height, 200.0 / 1920.0, y_sample);
        let (rr, rg, rb) = sample_rgba(rgba, width, height, 1700.0 / 1920.0, y_sample);
        if is_p1_blue_header(lr, lg, lb) || is_lime_highlight(lr, lg, lb) {
            preview_p1_cards += 1;
            // 左端の白い選出番号タブ (x ≈ 96/1920) またはライムハイライトを検出
            let (tab_r, tab_g, tab_b) = sample_rgba(rgba, width, height, 96.0 / 1920.0, y_sample);
            if (tab_r > 215 && tab_g > 215 && tab_b > 215) || is_lime_highlight(lr, lg, lb) {
                preview_selected_p1_indices.push(i as u8);
            }
        }
        // P2 dark magenta preview card: R ≈ 70..150, G <= 35, B ≈ 30..85
        if rr >= 65 && rg <= 40 && rb >= 25 && rr > rg.saturating_add(40) {
            preview_p2_cards += 1;
        }
    }

    // 3. 技選択メニューとアクティブ P1 スロットの判定
    let (p1a_border_r, p1a_border_g, p1a_border_b) =
        sample_rgba(rgba, width, height, 165.0 / 1920.0, 1004.0 / 1080.0);
    let (p1b_border_r, p1b_border_g, p1b_border_b) =
        sample_rgba(rgba, width, height, 561.0 / 1920.0, 1004.0 / 1080.0);
    let active_p1_slot = if is_lime_highlight(p1a_border_r, p1a_border_g, p1a_border_b) {
        Some(0)
    } else if is_lime_highlight(p1b_border_r, p1b_border_g, p1b_border_b) {
        Some(1)
    } else {
        None
    };

    let mut selected_move_index = None;
    for m_idx in 0..4 {
        let y_move = (555.0 + (m_idx as f32) * 110.0) / 1080.0;
        // 技カード左端のカーソル矢印・ライム枠 (x ≈ 1348..1372)
        let (mr, mg, mb) = sample_rgba(rgba, width, height, 1368.0 / 1920.0, y_move);
        if is_lime_highlight(mr, mg, mb) {
            selected_move_index = Some(m_idx as u8);
            break;
        }
    }

    // 4. 下部メッセージ枠・特性バナー・通信待機中ボックスの判定
    let (msg_x0, msg_y0, msg_x1, msg_y1) = roi.message_box.to_pixel_bounds(width, height);
    let mut white_msg_pixels: u32 = 0;
    let mut y = msg_y0;
    while y < msg_y1 {
        let mut x = msg_x0;
        while x < msg_x1 {
            let idx = ((y * width + x) * 4) as usize;
            if idx + 2 < rgba.len() {
                let r = rgba[idx];
                let g = rgba[idx + 1];
                let b = rgba[idx + 2];
                if r > 135
                    && g > 135
                    && b > 135
                    && (r as i32 - g as i32).abs() < 30
                    && (r as i32 - b as i32).abs() < 30
                {
                    white_msg_pixels += 1;
                }
            }
            x += 4;
        }
        y += 2;
    }
    let message_box_visible = white_msg_pixels >= 6;
    let message_roi_hash = if message_box_visible {
        compute_roi_luma_hash(rgba, width, height, &roi.message_box)
    } else {
        0
    };

    let (ab1_r, ab1_g, ab1_b) = sample_rgba(rgba, width, height, 200.0 / 1920.0, 395.0 / 1080.0);
    let p1_ability_banner_visible = is_p1_blue_header(ab1_r, ab1_g, ab1_b)
        || (ab1_b > 140 && ab1_b > ab1_r.saturating_add(30) && ab1_r < 120);

    let (ab2_r, ab2_g, ab2_b) = sample_rgba(rgba, width, height, 1720.0 / 1920.0, 295.0 / 1080.0);
    let p2_ability_banner_visible = is_p2_magenta_header(ab2_r, ab2_g, ab2_b);

    let ability_roi_hash = if p1_ability_banner_visible {
        compute_roi_luma_hash(rgba, width, height, &roi.p1_ability_banner)
    } else if p2_ability_banner_visible {
        compute_roi_luma_hash(rgba, width, height, &roi.p2_ability_banner)
    } else {
        0
    };

    let (timer_x0, timer_y0, timer_x1, timer_y1) =
        roi.command_timer_box.to_pixel_bounds(width, height);
    let mut white_timer_pixels: u32 = 0;
    let mut dark_timer_pixels: u32 = 0;
    let mut ty = timer_y0;
    while ty < timer_y1 {
        let mut tx = timer_x0;
        while tx < timer_x1 {
            let idx = ((ty * width + tx) * 4) as usize;
            if idx + 2 < rgba.len() {
                let r = rgba[idx];
                let g = rgba[idx + 1];
                let b = rgba[idx + 2];
                if r > 170
                    && g > 170
                    && b > 170
                    && (r as i32 - g as i32).abs() < 25
                    && (r as i32 - b as i32).abs() < 25
                {
                    white_timer_pixels += 1;
                } else if r < 90 && g < 100 && b < 120 {
                    dark_timer_pixels += 1;
                }
            }
            tx += 4;
        }
        ty += 2;
    }
    let command_timer_visible =
        (70..=500).contains(&white_timer_pixels) && dark_timer_pixels >= 180;

    let visible_hud_count = hp_bars.iter().filter(|b| b.visible).count();

    let phase = if preview_p1_cards >= 4 && preview_p2_cards >= 4 {
        VideoScreenPhase::TeamPreview
    } else if command_timer_visible {
        if active_p1_slot.is_some() || selected_move_index.is_some() {
            VideoScreenPhase::MoveSelect
        } else {
            VideoScreenPhase::CommandSelect
        }
    } else if message_box_visible
        || p1_ability_banner_visible
        || p2_ability_banner_visible
        || visible_hud_count == 1
    {
        VideoScreenPhase::BattleAnimation
    } else {
        VideoScreenPhase::Unknown
    };

    VideoFrameAnalysis {
        timestamp_ms,
        phase,
        hp_bars,
        active_p1_slot,
        selected_move_index,
        preview_selected_p1_indices,
        message_box_visible,
        command_timer_visible,
        p1_ability_banner_visible,
        p2_ability_banner_visible,
        message_roi_hash,
        ability_roi_hash,
    }
}

// =========================================================================
// ファジー辞書マッチング & OCR テキスト→BattleKifu 変換エンジン
// =========================================================================

/// フロントエンドの翻訳辞書（日英のポケモン名・技名・特性名・持ち物名）を注入するためのエントリ
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Tsify)]
pub struct LocalizedEntityAlias {
    /// 正規化内部スラッグ / 識別子 (`"incineroar"`, `"fakeout"`, `"intimidate"`, `"sitrusberry"` など)
    pub slug: String,
    /// 表示名またはエイリアス (`"Incineroar"`, `"ガオガエン"`, `"Fake Out"`, `"ねこだまし"` など)
    pub alias: String,
}

/// 1フレーム分のピクセル解析結果＋OCR読み取りテキスト
#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct VideoFrameObservation {
    pub analysis: VideoFrameAnalysis,
    /// 見せ合い画面での P1 カード6枠のOCRテキスト（省略可）
    #[serde(default)]
    pub p1_preview_texts: Vec<String>,
    /// 見せ合い画面での P2 カード6枠のOCRテキスト（またはスプライト識別結果）
    #[serde(default)]
    pub p2_preview_texts: Vec<String>,
    /// 場の4枠 `[P1A, P1B, P2A, P2B]` のポケモン名OCRテキスト
    #[serde(default)]
    pub hud_species_texts: [Option<String>; 4],
    /// 自軍 `[P1A, P1B]` の HP 実数値テキスト (`"170/170"`, `"25/202"` など)
    #[serde(default)]
    pub p1_hp_texts: [Option<String>; 2],
    /// 技選択メニューで選択中の技名テキスト
    #[serde(default)]
    pub selected_move_text: Option<String>,
    /// 下部メッセージボックスのOCRテキスト
    #[serde(default)]
    pub message_text: Option<String>,
    /// 特性バナーのOCRテキスト (`"Salamence's Intimidate"`, `"ボーマンダの いかく"` など)
    #[serde(default)]
    pub ability_banner_text: Option<String>,
    /// 左上の天候・フィールドテキスト (`"Rain 2/5"` など)
    #[serde(default)]
    pub weather_text: Option<String>,
    /// 結果画面のOCRテキスト (`"Rating: 1,603.525"` など)
    #[serde(default)]
    pub result_text: Option<String>,
}

/// 動画全体の解析サマリー（BattleKifu + 戦績フォーム自動入力用のメタデータ）
#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct VideoKifuExtractionResult {
    pub kifu: BattleKifu,
    pub pbn_text: String,
    pub pkf_base64url: String,
    /// 結果画面または終盤ログから推定されたレート (`Some(1603.525)` など)
    pub detected_rating: Option<f64>,
    /// 低信頼度 (`needs_review == true`) のイベント件数
    pub review_required_count: usize,
}

/// 文字列比較用の正規化（空白・記号を除去し、小文字化、カタカナ・ひらがな表記揺れを吸収）
pub fn normalize_ocr_token(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for c in raw.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if ('\u{3041}'..='\u{3096}').contains(&c) {
            // ひらがな → カタカナに統一して比較しやすくする
            if let Some(kata) = char::from_u32(c as u32 + 0x60) {
                out.push(kata);
            } else {
                out.push(c);
            }
        } else if ('\u{30A1}'..='\u{30FC}').contains(&c) || ('\u{4E00}'..='\u{9FFF}').contains(&c) {
            out.push(c);
        }
    }
    out
}

/// レーベンシュタイン編集距離（文字単位）
pub fn char_levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let m = a_chars.len();
    let n = b_chars.len();
    if m == 0 {
        return n;
    }
    if n == 0 {
        return m;
    }
    let mut prev: Vec<usize> = (0..=n).collect();
    let mut curr = vec![0usize; n + 1];
    for i in 1..=m {
        curr[0] = i;
        for j in 1..=n {
            let cost = usize::from(a_chars[i - 1] != b_chars[j - 1]);
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[n]
}

/// 候補辞書に対して最も近いスラッグと信頼度 (`0..=100`) を返す
pub fn fuzzy_match_entity(
    query: &str,
    dictionary: &[LocalizedEntityAlias],
) -> Option<(String, u8)> {
    let norm_q = normalize_ocr_token(query);
    if norm_q.is_empty() {
        return None;
    }

    let mut best_slug: Option<String> = None;
    let mut best_score: u8 = 0;

    for entry in dictionary {
        let norm_alias = normalize_ocr_token(&entry.alias);
        let norm_slug = normalize_ocr_token(&entry.slug);

        for candidate in [&norm_alias, &norm_slug] {
            if candidate.is_empty() {
                continue;
            }
            if &norm_q == candidate {
                return Some((entry.slug.clone(), 100));
            }
            let dist = char_levenshtein(&norm_q, candidate);
            let max_len = norm_q.chars().count().max(candidate.chars().count());
            if max_len == 0 {
                continue;
            }
            let similarity =
                ((max_len.saturating_sub(dist) as f32 / max_len as f32) * 100.0).round() as u8;
            if similarity > best_score && similarity >= 55 {
                best_score = similarity;
                best_slug = Some(entry.slug.clone());
            }
        }
    }

    best_slug.map(|slug| (slug, best_score))
}

/// `"170/170"` や `"25 / 202"` のような OCR 文字列から `(current, max)` を抽出する
pub fn parse_exact_hp_text(text: &str) -> Option<(u16, u16)> {
    let cleaned: String = text
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '/')
        .collect();
    let (cur_str, max_str) = cleaned.split_once('/')?;
    let current = cur_str.parse::<u16>().ok()?;
    let max = max_str.parse::<u16>().ok()?;
    if max == 0 || current > max || max > 999 {
        return None;
    }
    Some((current, max))
}

fn resolve_actor_ident(
    is_opposing: bool,
    species_slug: &str,
    active_species: &[Option<String>; 4],
) -> PokemonIdent {
    if is_opposing {
        if active_species[3].as_deref() == Some(species_slug) {
            PokemonIdent { player: 2, slot: 1 }
        } else {
            PokemonIdent { player: 2, slot: 0 }
        }
    } else if active_species[1].as_deref() == Some(species_slug) {
        PokemonIdent { player: 1, slot: 1 }
    } else {
        PokemonIdent { player: 1, slot: 0 }
    }
}

/// 英語・日本語のバトルメッセージ1行を解析して `ObservedEvent` と信頼度 `(0..=100)` を生成する
pub fn parse_battle_message_to_event(
    raw_line: &str,
    active_species: &[Option<String>; 4],
    species_dict: &[LocalizedEntityAlias],
    move_dict: &[LocalizedEntityAlias],
) -> Option<(ObservedEvent, u8)> {
    let trimmed = raw_line.trim();
    if trimmed.is_empty() {
        return None;
    }

    // 1. 技の使用 (English: "The opposing Farigiraf used Helping Hand!" / "Salamence used Tailwind!")
    if let Some((before_used, after_used)) = trimmed.split_once(" used ") {
        let is_opposing = before_used.to_ascii_lowercase().contains("opposing");
        let mon_part = before_used
            .replace("The opposing ", "")
            .replace("the opposing ", "")
            .trim()
            .to_string();
        let move_part = after_used.trim_end_matches(['!', '.', ' ']).trim();

        let (mon_slug, mon_conf) = fuzzy_match_entity(&mon_part, species_dict)
            .unwrap_or_else(|| (normalize_ocr_token(&mon_part), 70));
        let (move_slug, move_conf) = fuzzy_match_entity(move_part, move_dict)
            .unwrap_or_else(|| (normalize_ocr_token(move_part), 70));

        let attacker = resolve_actor_ident(is_opposing, &mon_slug, active_species);
        let conf = mon_conf.min(move_conf);
        return Some((
            ObservedEvent::MoveUsed {
                attacker,
                move_id: move_slug,
                target: None,
            },
            conf,
        ));
    }

    // 2. ひんし (English: "The opposing Farigiraf fainted!")
    if trimmed.to_ascii_lowercase().contains("fainted") {
        let is_opposing = trimmed.to_ascii_lowercase().contains("opposing");
        let cleaned = trimmed
            .replace("The opposing ", "")
            .replace("the opposing ", "")
            .replace("fainted!", "")
            .replace("fainted", "")
            .trim()
            .to_string();
        let (mon_slug, mon_conf) = fuzzy_match_entity(&cleaned, species_dict)
            .unwrap_or_else(|| (normalize_ocr_token(&cleaned), 75));
        let target = resolve_actor_ident(is_opposing, &mon_slug, active_species);
        return Some((ObservedEvent::Faint { target }, mon_conf));
    }

    None
}

/// 特性ポップアップバナー (`"Salamence's Intimidate"` / `"ボーマンダの いかく"`) を解析する
pub fn parse_ability_banner_to_event(
    raw_banner: &str,
    is_opposing_side: bool,
    active_species: &[Option<String>; 4],
    species_dict: &[LocalizedEntityAlias],
    ability_dict: &[LocalizedEntityAlias],
) -> Option<(ObservedEvent, u8)> {
    let trimmed = raw_banner.trim();
    if trimmed.is_empty() {
        return None;
    }

    let (mon_part, ab_part) = if let Some((m, a)) = trimmed.split_once("'s") {
        (m.trim(), a.trim())
    } else if let Some((m, a)) = trimmed.split_once("’s") {
        (m.trim(), a.trim())
    } else {
        let lines: Vec<&str> = trimmed
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .collect();
        if lines.len() >= 2 {
            (lines[0], lines[1])
        } else {
            ("", trimmed)
        }
    };

    let (ab_slug, ab_conf) = fuzzy_match_entity(ab_part, ability_dict)?;
    let (mon_slug, mon_conf) = if !mon_part.is_empty() {
        fuzzy_match_entity(mon_part, species_dict)
            .unwrap_or_else(|| (normalize_ocr_token(mon_part), 80))
    } else {
        let fallback_slot = if is_opposing_side { 2 } else { 0 };
        (
            active_species[fallback_slot]
                .clone()
                .unwrap_or_else(|| "unknown".to_string()),
            80,
        )
    };

    let source = resolve_actor_ident(is_opposing_side, &mon_slug, active_species);
    Some((
        ObservedEvent::AbilityTriggered {
            source,
            ability: ab_slug,
        },
        ab_conf.min(mon_conf),
    ))
}

fn default_move1_action() -> PlayerActionJs {
    PlayerActionJs {
        slot_a: SlotActionJs {
            choice: "move1".to_string(),
            target: 0,
            mega: false,
        },
        slot_b: SlotActionJs {
            choice: "move1".to_string(),
            target: 0,
            mega: false,
        },
    }
}

/// 時系列フレーム観測列 (`VideoFrameObservation`) から `BattleKifu` (.pbn / .pkf) を一括生成する
pub fn compile_video_observations_to_kifu(
    regulation: Regulation,
    p1_team: Vec<InputPokemonData>,
    observations: &[VideoFrameObservation],
    species_dict: &[LocalizedEntityAlias],
    move_dict: &[LocalizedEntityAlias],
    ability_dict: &[LocalizedEntityAlias],
) -> VideoKifuExtractionResult {
    let mut kifu = BattleKifu {
        regulation,
        is_open_team_sheet: false,
        result: MatchOutcome::Unknown,
        p1_team: p1_team.clone(),
        p1_selection: [0, 1, 2, 3],
        p2_preview: Vec::new(),
        lead_events: Vec::new(),
        lead_timestamp_ms: None,
        lead_provenance: Vec::new(),
        turns: Vec::new(),
    };

    let mut active_species: [Option<String>; 4] = [None, None, None, None];
    let mut prev_hp_bars: [Option<u8>; 4] = [None, None, None, None];
    let mut last_message_norm = String::new();
    let mut last_ability_norm = String::new();
    let mut current_turn_number: u16 = 0;
    let mut detected_rating: Option<f64> = None;
    let mut review_required_count = 0usize;
    let mut in_command_phase = false;

    for obs in observations {
        let ts = obs.analysis.timestamp_ms;

        // 1. 見せ合いフェーズから相手6匹と自軍選出インデックスを取得
        if obs.analysis.phase == VideoScreenPhase::TeamPreview {
            if kifu.p2_preview.is_empty() && !obs.p2_preview_texts.is_empty() {
                for (idx, raw_name) in obs.p2_preview_texts.iter().take(6).enumerate() {
                    if let Some((slug, _)) = fuzzy_match_entity(raw_name, species_dict) {
                        kifu.p2_preview.push(OpponentPreviewSlot {
                            preview_index: idx as u8,
                            species: slug,
                            known_item: None,
                            known_ability: None,
                            known_moves: Vec::new(),
                        });
                    }
                }
            }
            if obs.analysis.preview_selected_p1_indices.len() == 4 {
                kifu.p1_selection = [
                    obs.analysis.preview_selected_p1_indices[0] as usize,
                    obs.analysis.preview_selected_p1_indices[1] as usize,
                    obs.analysis.preview_selected_p1_indices[2] as usize,
                    obs.analysis.preview_selected_p1_indices[3] as usize,
                ];
            }
        }

        // 2. HUD のポケモン名更新と先発・交代 (SwitchIn) の検出
        for slot_idx in 0..4 {
            if let Some(raw_hud_name) = &obs.hud_species_texts[slot_idx]
                && let Some((slug, conf)) = fuzzy_match_entity(raw_hud_name, species_dict)
                && active_species[slot_idx].as_deref() != Some(&slug)
            {
                active_species[slot_idx] = Some(slug.clone());
                let player = if slot_idx < 2 { 1 } else { 2 };
                let slot = slot_idx % 2;
                let team_index = if player == 1 {
                    kifu.p1_team
                        .iter()
                        .position(|m| normalize_ocr_token(&m.species) == normalize_ocr_token(&slug))
                        .unwrap_or(slot) as u8
                } else {
                    kifu.p2_preview
                        .iter()
                        .position(|p| normalize_ocr_token(&p.species) == normalize_ocr_token(&slug))
                        .unwrap_or(slot) as u8
                };

                let hp = if player == 1 {
                    obs.p1_hp_texts[slot]
                        .as_deref()
                        .and_then(parse_exact_hp_text)
                        .map(|(c, m)| ObservedHp::exact(c, m))
                        .unwrap_or_else(|| {
                            ObservedHp::percent(obs.analysis.hp_bars[slot_idx].percent.max(100))
                        })
                } else {
                    ObservedHp::percent(if obs.analysis.hp_bars[slot_idx].visible {
                        obs.analysis.hp_bars[slot_idx].percent
                    } else {
                        100
                    })
                };

                let ev = ObservedEvent::SwitchIn {
                    player,
                    slot,
                    team_index,
                    species: slug,
                    hp,
                };
                let needs_review = conf < 85;
                if needs_review {
                    review_required_count += 1;
                }
                let prov = EventProvenance {
                    timestamp_ms: Some(ts),
                    confidence: Some(conf),
                    needs_review,
                    comment: None,
                };

                if current_turn_number == 0 {
                    if kifu.lead_timestamp_ms.is_none() {
                        kifu.lead_timestamp_ms = Some(ts);
                    }
                    kifu.lead_events.push(ev);
                    kifu.lead_provenance.push(prov);
                } else if let Some(turn) = kifu.turns.last_mut() {
                    turn.events.push(ev);
                    turn.event_provenance.push(prov);
                }
                prev_hp_bars[slot_idx] = Some(obs.analysis.hp_bars[slot_idx].percent);
            }
        }

        // 3. ターン境界の検出（MOVE TIME 45 / コマンドフェーズへの進入がターンの絶対的な切れ目）
        let is_command_screen =
            obs.analysis.command_timer_visible && kifu.lead_timestamp_ms.is_some();

        if is_command_screen {
            let last_ts = kifu.turns.last().and_then(|t| t.annotation.timestamp_ms);
            let can_start_new_turn = match last_ts {
                Some(prev_ts) => ts.saturating_sub(prev_ts) >= 15_000,
                None => true,
            };

            if !in_command_phase && can_start_new_turn {
                in_command_phase = true;
                current_turn_number += 1;
                kifu.turns.push(TurnRecord {
                    turn_number: current_turn_number,
                    p1_action: default_move1_action(),
                    p2_action: None,
                    events: Vec::new(),
                    annotation: TurnAnnotation {
                        timestamp_ms: Some(ts),
                        ..Default::default()
                    },
                    event_provenance: Vec::new(),
                    field_effects: Vec::new(),
                });
            } else if !in_command_phase {
                in_command_phase = true;
            }
        } else if obs.analysis.phase == VideoScreenPhase::BattleAnimation
            || obs.analysis.message_box_visible
        {
            in_command_phase = false;
        }

        // 4. 特性発動ポップアップの解析
        if let Some(raw_ab) = &obs.ability_banner_text {
            let norm_ab = normalize_ocr_token(raw_ab);
            if !norm_ab.is_empty() && norm_ab != last_ability_norm {
                last_ability_norm = norm_ab;
                let is_opposing = obs.analysis.p2_ability_banner_visible
                    && !obs.analysis.p1_ability_banner_visible;
                if let Some((ev, conf)) = parse_ability_banner_to_event(
                    raw_ab,
                    is_opposing,
                    &active_species,
                    species_dict,
                    ability_dict,
                ) {
                    let needs_review = conf < 85;
                    if needs_review {
                        review_required_count += 1;
                    }
                    let prov = EventProvenance {
                        timestamp_ms: Some(ts),
                        confidence: Some(conf),
                        needs_review,
                        comment: None,
                    };
                    if current_turn_number == 0 {
                        kifu.lead_events.push(ev);
                        kifu.lead_provenance.push(prov);
                    } else if let Some(turn) = kifu.turns.last_mut() {
                        turn.events.push(ev);
                        turn.event_provenance.push(prov);
                    }
                }
            }
        }

        // 5. バトルメッセージの解析（技発動・ひんし・勝敗確定）
        if let Some(raw_msg) = &obs.message_text {
            let norm_msg = normalize_ocr_token(raw_msg);
            if !norm_msg.is_empty() && norm_msg != last_message_norm {
                last_message_norm = norm_msg;
                let lower = raw_msg.to_ascii_lowercase();
                if lower.contains("you defeated") {
                    kifu.result = MatchOutcome::P1Win;
                } else if lower.contains("you lost") {
                    kifu.result = MatchOutcome::P2Win;
                } else if let Some((ev, conf)) =
                    parse_battle_message_to_event(raw_msg, &active_species, species_dict, move_dict)
                {
                    if current_turn_number == 0 {
                        current_turn_number = 1;
                        kifu.turns.push(TurnRecord {
                            turn_number: 1,
                            p1_action: default_move1_action(),
                            p2_action: None,
                            events: Vec::new(),
                            annotation: TurnAnnotation {
                                timestamp_ms: Some(ts),
                                ..Default::default()
                            },
                            event_provenance: Vec::new(),
                            field_effects: Vec::new(),
                        });
                    }
                    let needs_review = conf < 85;
                    if needs_review {
                        review_required_count += 1;
                    }
                    if let Some(turn) = kifu.turns.last_mut() {
                        // 自軍の MoveUsed イベントが出た場合、そのターンの p1_action にも実際の技IDを反映
                        if let ObservedEvent::MoveUsed {
                            attacker,
                            ref move_id,
                            ..
                        } = ev
                            && attacker.player == 1
                        {
                            if attacker.slot == 0 {
                                turn.p1_action.slot_a.choice = move_id.clone();
                            } else if attacker.slot == 1 {
                                turn.p1_action.slot_b.choice = move_id.clone();
                            }
                        }
                        turn.events.push(ev);
                        turn.event_provenance.push(EventProvenance {
                            timestamp_ms: Some(ts),
                            confidence: Some(conf),
                            needs_review,
                            comment: None,
                        });
                    }
                }
            }
        }

        // 6. HP バー変化から Damage / Heal イベントを補完
        if current_turn_number > 0 {
            for (slot_idx, prev_slot_hp) in prev_hp_bars.iter_mut().enumerate() {
                let bar = obs.analysis.hp_bars[slot_idx];
                if !bar.visible {
                    continue;
                }
                if let Some(prev_pct) = *prev_slot_hp {
                    let diff = (prev_pct as i16) - (bar.percent as i16);
                    if diff.abs() >= 3 {
                        if obs.analysis.phase == VideoScreenPhase::BattleAnimation
                            && !in_command_phase
                        {
                            let player = if slot_idx < 2 { 1 } else { 2 };
                            let slot = slot_idx % 2;
                            let target = PokemonIdent { player, slot };
                            let hp_after = if player == 1 {
                                obs.p1_hp_texts[slot]
                                    .as_deref()
                                    .and_then(parse_exact_hp_text)
                                    .map(|(c, m)| ObservedHp::exact(c, m))
                                    .unwrap_or_else(|| ObservedHp::percent(bar.percent))
                            } else {
                                ObservedHp::percent(bar.percent)
                            };

                            let ev = if diff > 0 {
                                ObservedEvent::Damage {
                                    target,
                                    hp_after,
                                    damage_exact: None,
                                    is_crit: false,
                                    effectiveness: None,
                                    from_effect: None,
                                    attacker: None,
                                    move_id: None,
                                    is_spread: false,
                                }
                            } else {
                                ObservedEvent::Heal {
                                    target,
                                    hp_after,
                                    from_effect: None,
                                }
                            };

                            if let Some(turn) = kifu.turns.last_mut() {
                                turn.events.push(ev);
                                turn.event_provenance.push(EventProvenance {
                                    timestamp_ms: Some(ts),
                                    confidence: Some(92),
                                    needs_review: false,
                                    comment: None,
                                });
                            }
                        }
                        *prev_slot_hp = Some(bar.percent);
                    }
                } else {
                    *prev_slot_hp = Some(bar.percent);
                }
            }
        }

        // 7. 結果画面からのレート抽出 ("Rating: 1,603.525" / "レート 1603.525")
        if let Some(res_txt) = &obs.result_text {
            let cleaned = res_txt.replace(',', "");
            for token in cleaned.split(|c: char| !c.is_ascii_digit() && c != '.') {
                if token.contains('.')
                    && let Ok(val) = token.parse::<f64>()
                    && (1000.0..=3000.0).contains(&val)
                {
                    detected_rating = Some(val);
                }
            }
        }
    }

    let pbn_text = kifu.to_pbn();
    let pkf_base64url = kifu.to_pkf_base64url();

    VideoKifuExtractionResult {
        kifu,
        pbn_text,
        pkf_base64url,
        detected_rating,
        review_required_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_synthetic_1080p_command_frame(p2a_hp_pct: u8, p2b_hp_pct: u8) -> Vec<u8> {
        let width = 1920usize;
        let height = 1080usize;
        let mut rgba = vec![80u8; width * height * 4];

        let mut fill_rect = |x0: usize, y0: usize, w: usize, h: usize, r: u8, g: u8, b: u8| {
            for y in y0..(y0 + h).min(height) {
                for x in x0..(x0 + w).min(width) {
                    let idx = (y * width + x) * 4;
                    rgba[idx] = r;
                    rgba[idx + 1] = g;
                    rgba[idx + 2] = b;
                    rgba[idx + 3] = 255;
                }
            }
        };

        // P1A & P1B blue headers (R=134, G=116, B=234)
        fill_rect(170, 932, 350, 24, 134, 116, 234);
        fill_rect(566, 932, 350, 24, 134, 116, 234);
        // P2A & P2B magenta headers (R=210, G=52, B=136)
        fill_rect(1215, 48, 350, 20, 210, 52, 136);
        fill_rect(1611, 48, 300, 20, 210, 52, 136);

        // Dark HP bar tracks (224px wide)
        fill_rect(181, 1002, 224, 12, 20, 20, 20);
        fill_rect(577, 1002, 224, 12, 20, 20, 20);
        fill_rect(1225, 118, 224, 12, 20, 20, 20);
        fill_rect(1621, 118, 224, 12, 20, 20, 20);

        // Fill P1A 100%, P1B 100% green
        fill_rect(181, 1002, 224, 12, 55, 225, 65);
        fill_rect(577, 1002, 224, 12, 55, 225, 65);

        // Fill P2A & P2B according to requested percentages
        let p2a_w = ((224.0 * p2a_hp_pct as f32) / 100.0).round() as usize;
        let (r_a, g_a, b_a) = if p2a_hp_pct > 50 {
            (55, 225, 65)
        } else if p2a_hp_pct > 20 {
            (225, 185, 40)
        } else {
            (215, 45, 45)
        };
        fill_rect(1225, 118, p2a_w, 12, r_a, g_a, b_a);

        let p2b_w = ((224.0 * p2b_hp_pct as f32) / 100.0).round() as usize;
        fill_rect(1621, 118, p2b_w, 12, 55, 225, 65);

        // Command timer box: dark banner + white text
        fill_rect(1550, 295, 310, 60, 40, 50, 70);
        fill_rect(1600, 310, 120, 25, 240, 240, 240);

        rgba
    }

    #[test]
    fn test_analyze_video_frame_rgba_command_phase_and_hp_bars() {
        let frame = make_synthetic_1080p_command_frame(33, 100);
        let analysis = analyze_video_frame_rgba(&frame, 1920, 1080, 130_000, None);

        assert_eq!(analysis.phase, VideoScreenPhase::CommandSelect);
        assert!(analysis.hp_bars[0].visible);
        assert_eq!(analysis.hp_bars[0].percent, 100);
        assert_eq!(analysis.hp_bars[0].color_zone, HpBarColorZone::Green);

        assert!(analysis.hp_bars[2].visible);
        assert_eq!(analysis.hp_bars[2].percent, 33);
        assert_eq!(analysis.hp_bars[2].color_zone, HpBarColorZone::Yellow);

        assert!(analysis.hp_bars[3].visible);
        assert_eq!(analysis.hp_bars[3].percent, 100);
    }

    #[test]
    fn test_compile_video_observations_to_kifu_pipeline() {
        let species_dict = vec![
            LocalizedEntityAlias {
                slug: "salamence".to_string(),
                alias: "Salamence".to_string(),
            },
            LocalizedEntityAlias {
                slug: "incineroar".to_string(),
                alias: "Incineroar".to_string(),
            },
            LocalizedEntityAlias {
                slug: "farigiraf".to_string(),
                alias: "Farigiraf".to_string(),
            },
            LocalizedEntityAlias {
                slug: "garchomp".to_string(),
                alias: "Garchomp".to_string(),
            },
        ];
        let move_dict = vec![
            LocalizedEntityAlias {
                slug: "helpinghand".to_string(),
                alias: "Helping Hand".to_string(),
            },
            LocalizedEntityAlias {
                slug: "tailwind".to_string(),
                alias: "Tailwind".to_string(),
            },
        ];
        let ability_dict = vec![LocalizedEntityAlias {
            slug: "intimidate".to_string(),
            alias: "Intimidate".to_string(),
        }];

        let cmd_frame = make_synthetic_1080p_command_frame(100, 100);
        let cmd_analysis = analyze_video_frame_rgba(&cmd_frame, 1920, 1080, 130_000, None);

        let mut anim_analysis = cmd_analysis.clone();
        anim_analysis.timestamp_ms = 142_000;
        anim_analysis.phase = VideoScreenPhase::BattleAnimation;
        anim_analysis.command_timer_visible = false;
        anim_analysis.hp_bars[2].percent = 33;

        let observations = vec![
            VideoFrameObservation {
                analysis: VideoFrameAnalysis {
                    timestamp_ms: 88_000,
                    phase: VideoScreenPhase::TeamPreview,
                    preview_selected_p1_indices: vec![0, 4, 3, 1],
                    ..cmd_analysis.clone()
                },
                p1_preview_texts: vec!["Salamence".to_string(), "Incineroar".to_string()],
                p2_preview_texts: vec!["Farigiraf".to_string(), "Garchomp".to_string()],
                hud_species_texts: [None, None, None, None],
                p1_hp_texts: [None, None],
                selected_move_text: None,
                message_text: None,
                ability_banner_text: None,
                weather_text: None,
                result_text: None,
            },
            VideoFrameObservation {
                analysis: VideoFrameAnalysis {
                    timestamp_ms: 115_000,
                    phase: VideoScreenPhase::BattleAnimation,
                    p1_ability_banner_visible: true,
                    command_timer_visible: false,
                    ..cmd_analysis.clone()
                },
                p1_preview_texts: vec![],
                p2_preview_texts: vec![],
                hud_species_texts: [
                    Some("Salamence".to_string()),
                    Some("Incineroar".to_string()),
                    Some("Farigiraf".to_string()),
                    Some("Garchomp".to_string()),
                ],
                p1_hp_texts: [Some("170/170".to_string()), Some("202/202".to_string())],
                selected_move_text: None,
                message_text: None,
                ability_banner_text: Some("Salamence's Intimidate".to_string()),
                weather_text: None,
                result_text: None,
            },
            VideoFrameObservation {
                analysis: cmd_analysis,
                p1_preview_texts: vec![],
                p2_preview_texts: vec![],
                hud_species_texts: [None, None, None, None],
                p1_hp_texts: [Some("170/170".to_string()), Some("202/202".to_string())],
                selected_move_text: None,
                message_text: None,
                ability_banner_text: None,
                weather_text: None,
                result_text: None,
            },
            VideoFrameObservation {
                analysis: anim_analysis,
                p1_preview_texts: vec![],
                p2_preview_texts: vec![],
                hud_species_texts: [None, None, None, None],
                p1_hp_texts: [Some("170/170".to_string()), Some("202/202".to_string())],
                selected_move_text: None,
                message_text: Some("The opposing Farigiraf used Helping Hand!".to_string()),
                ability_banner_text: None,
                weather_text: None,
                result_text: Some("Placement: No. 3,928 (Rating: 1,603.525) +13.378".to_string()),
            },
        ];

        let res = compile_video_observations_to_kifu(
            Regulation::MA,
            vec![],
            &observations,
            &species_dict,
            &move_dict,
            &ability_dict,
        );

        assert_eq!(res.kifu.p1_selection, [0, 4, 3, 1]);
        assert_eq!(res.kifu.p2_preview.len(), 2);
        assert_eq!(res.kifu.lead_events.len(), 5); // 4 SwitchIns + 1 AbilityTriggered(intimidate)
        assert_eq!(res.kifu.turns.len(), 1);
        assert_eq!(res.kifu.turns[0].events.len(), 2); // MoveUsed(helpinghand) + Damage(100% -> 33%)
        assert_eq!(res.detected_rating, Some(1603.525));
        assert!(res.pbn_text.contains("helpinghand"));
    }
}
