use crate::kifu::{
    ActiveSpeedComparison, BattleKifu, ObservedEvent, ObservedHp, OpponentPokemonBeliefView,
    SpeedOrderKnowledge, TurnSnapshotView,
};
use crate::sim::battle::Battle;
use crate::sim::damage_evaluator::DamageEvaluator;
use crate::sim::pokemon::{Pokemon, PokemonIdent};
use crate::solver::evaluator::resolve_board_threats;
use crate::wasm_api::{Boosts, InputPokemonData, build_pokemon};
use pkmn_meta::Regulation;
use pkmn_meta::types::{Category, Terrain, Weather};

/// 相手1匹に対する不完全情報の信念・制約状態 (Information Set の構成要素)
#[derive(Clone, Debug)]
pub struct PokemonBelief {
    pub preview_index: u8,
    pub species: String,
    pub base_species: String,
    pub revealed_in_battle: bool,
    pub active_slot: Option<usize>,
    pub hp_percent: u8,
    pub status: Option<String>,
    pub boosts: Boosts,
    pub volatile_status: Vec<String>,
    pub is_mega: bool,

    pub known_ability: Option<String>,
    pub candidate_abilities: Vec<String>,

    pub known_item: Option<String>,
    pub item_consumed: bool,
    pub excluded_items: Vec<String>,

    pub known_moves: Vec<String>,
    pub excluded_moves: Vec<String>,
    /// 現在の場に出てから使用した技履歴（こだわりロック判定用）
    pub moves_used_since_switch_in: Vec<String>,

    /// Champions EV 制約: HP EV (0..=32)
    pub hp_ev_range: (u8, u8),
    pub hp_stat_range: (u16, u16),
    pub atk_stat_range: (u16, u16),
    pub def_stat_range: (u16, u16),
    pub spa_stat_range: (u16, u16),
    pub spd_stat_range: (u16, u16),
    pub spe_stat_range: (u16, u16),
}

/// 1ステータス (HP以外) の Lv50 実数値を `(base, ev, nature_mod)` から計算
/// `nature_mod`: -1 (下降 0.9倍), 0 (無補正 1.0倍), +1 (上昇 1.1倍)
pub fn calc_stat_lv50(base: u32, ev: u8, nature_mod: i8) -> u16 {
    let pre = (base + 20 + ev as u32) as i32;
    let val = if nature_mod > 0 {
        (pre * 11) / 10
    } else if nature_mod < 0 {
        (pre * 9) / 10
    } else {
        pre
    };
    val as u16
}

/// HP の Lv50 実数値を `(species, base_hp, hp_ev)` から計算
pub fn calc_hp_lv50(species: &str, base_hp: u32, hp_ev: u8) -> u16 {
    if species.replace('-', "").eq_ignore_ascii_case("shedinja") {
        1
    } else {
        (base_hp + 75 + hp_ev as u32) as u16
    }
}

/// 種族のベースステータスから `[0 EV 下降補正, 32 EV 上昇補正]` の初期実数値レンジを返す
pub fn full_stat_bounds_for_species(species: &str) -> ([u16; 6], [u16; 6]) {
    if let Some(meta) = pkmn_meta::pokemon_meta::get_pokemon_meta(species) {
        let bs = meta.base_stats();
        let min_hp = calc_hp_lv50(species, bs[0], 0);
        let max_hp = calc_hp_lv50(species, bs[0], 32);
        let mins = [
            min_hp,
            calc_stat_lv50(bs[1], 0, -1),
            calc_stat_lv50(bs[2], 0, -1),
            calc_stat_lv50(bs[3], 0, -1),
            calc_stat_lv50(bs[4], 0, -1),
            calc_stat_lv50(bs[5], 0, -1),
        ];
        let maxs = [
            max_hp,
            calc_stat_lv50(bs[1], 32, 1),
            calc_stat_lv50(bs[2], 32, 1),
            calc_stat_lv50(bs[3], 32, 1),
            calc_stat_lv50(bs[4], 32, 1),
            calc_stat_lv50(bs[5], 32, 1),
        ];
        (mins, maxs)
    } else {
        ([100; 6], [200; 6])
    }
}

impl PokemonBelief {
    pub fn from_preview(
        preview_index: u8,
        species: &str,
        known_item: Option<String>,
        known_ability: Option<String>,
        known_moves: Vec<String>,
    ) -> Self {
        let (mins, maxs) = full_stat_bounds_for_species(species);
        let mut candidate_abilities: Vec<String> =
            pkmn_meta::regulation::get_pokemon_abilities(species)
                .map(|slice| slice.iter().map(|&s| s.to_string()).collect())
                .unwrap_or_default();

        let resolved_ability = if let Some(ab) = known_ability.filter(|s| !s.is_empty()) {
            let norm = ab.replace('-', "").to_lowercase();
            candidate_abilities = vec![norm.clone()];
            Some(norm)
        } else if candidate_abilities.len() == 1 {
            Some(candidate_abilities[0].clone())
        } else {
            None
        };

        let is_shedinja = species.replace('-', "").eq_ignore_ascii_case("shedinja");

        Self {
            preview_index,
            species: species.to_string(),
            base_species: species.to_string(),
            revealed_in_battle: false,
            active_slot: None,
            hp_percent: 100,
            status: None,
            boosts: Boosts::default(),
            volatile_status: Vec::new(),
            is_mega: false,
            known_ability: resolved_ability,
            candidate_abilities,
            known_item: known_item
                .filter(|s| !s.is_empty())
                .map(|s| s.to_lowercase()),
            item_consumed: false,
            excluded_items: Vec::new(),
            known_moves: known_moves
                .into_iter()
                .filter(|s| !s.is_empty())
                .map(|s| s.replace('-', "").to_lowercase())
                .collect(),
            excluded_moves: Vec::new(),
            moves_used_since_switch_in: Vec::new(),
            hp_ev_range: if is_shedinja { (0, 0) } else { (0, 32) },
            hp_stat_range: (mins[0], maxs[0]),
            atk_stat_range: (mins[1], maxs[1]),
            def_stat_range: (mins[2], maxs[2]),
            spa_stat_range: (mins[3], maxs[3]),
            spd_stat_range: (mins[4], maxs[4]),
            spe_stat_range: (mins[5], maxs[5]),
        }
    }

    pub fn reveal_move(&mut self, move_id: &str) {
        let norm = move_id.replace('-', "").to_lowercase();
        if norm.is_empty() || norm == "struggle" || norm == "pass" || norm == "switch" {
            return;
        }
        if !self.known_moves.contains(&norm) && self.known_moves.len() < 4 {
            self.known_moves.push(norm.clone());
        }
        if !self.moves_used_since_switch_in.contains(&norm) {
            self.moves_used_since_switch_in.push(norm);
        }
        // 同じ繰り出し中に2種類以上の異なる技を使った場合、こだわり系アイテムを除外
        if self.moves_used_since_switch_in.len() >= 2 {
            self.exclude_item("choice-scarf");
            self.exclude_item("choicescarf");
            self.exclude_item("choice-band");
            self.exclude_item("choiceband");
            self.exclude_item("choice-specs");
            self.exclude_item("choicespecs");
        }
    }

    pub fn reveal_ability(&mut self, ability: &str) {
        let norm = ability.replace('-', "").to_lowercase();
        self.known_ability = Some(norm.clone());
        self.candidate_abilities = vec![norm];
    }

    pub fn exclude_ability(&mut self, ability: &str) {
        if self.known_ability.is_some() {
            return;
        }
        let norm = ability.replace('-', "").to_lowercase();
        if self.candidate_abilities.len() > 1 {
            self.candidate_abilities.retain(|a| a != &norm);
            if self.candidate_abilities.len() == 1 {
                self.known_ability = Some(self.candidate_abilities[0].clone());
            }
        }
    }

    pub fn reveal_item(&mut self, item: &str, consumed: bool) {
        let norm = item.to_lowercase();
        self.known_item = Some(norm);
        if consumed {
            self.item_consumed = true;
        }
    }

    pub fn exclude_item(&mut self, item: &str) {
        let norm = item.to_lowercase();
        if !self.excluded_items.contains(&norm) {
            self.excluded_items.push(norm);
        }
    }

    pub fn is_item_excluded(&self, item: &str) -> bool {
        let norm = item.to_lowercase();
        let no_hyphen = norm.replace('-', "");
        self.excluded_items
            .iter()
            .any(|ex| ex == &norm || ex.replace('-', "") == no_hyphen)
    }

    pub fn tighten_spe_min(&mut self, new_min: u16) {
        let candidate_min = self.spe_stat_range.0.max(new_min);
        if candidate_min <= self.spe_stat_range.1 {
            self.spe_stat_range.0 = candidate_min;
        }
    }

    pub fn tighten_spe_max(&mut self, new_max: u16) {
        let candidate_max = self.spe_stat_range.1.min(new_max);
        if self.spe_stat_range.0 <= candidate_max {
            self.spe_stat_range.1 = candidate_max;
        }
    }

    pub fn to_view(&self) -> OpponentPokemonBeliefView {
        OpponentPokemonBeliefView {
            preview_index: self.preview_index,
            species: self.species.clone(),
            revealed_in_battle: self.revealed_in_battle,
            is_active: self.active_slot.is_some(),
            active_slot: self.active_slot,
            hp_percent: self.hp_percent,
            status: self.status.clone(),
            boosts: self.boosts.clone(),
            known_ability: self.known_ability.clone(),
            candidate_abilities: self.candidate_abilities.clone(),
            known_item: self.known_item.clone(),
            item_consumed: self.item_consumed,
            excluded_items: self.excluded_items.clone(),
            known_moves: self.known_moves.clone(),
            hp_stat_range: self.hp_stat_range,
            atk_stat_range: self.atk_stat_range,
            def_stat_range: self.def_stat_range,
            spa_stat_range: self.spa_stat_range,
            spd_stat_range: self.spd_stat_range,
            spe_stat_range: self.spe_stat_range,
        }
    }
}

/// プレイヤー視点の情報集合 (Information Set / Belief State)
#[derive(Clone, Debug)]
pub struct BeliefState {
    pub regulation: Regulation,
    pub is_open_team_sheet: bool,
    pub turn_number: u16,
    /// 自軍の確定状態と現在のフィールド状態（天候・フィールド・トリル・追い風・壁・設置技）を保持するベース Battle
    pub base_battle: Battle,
    /// 相手の見せ合い6匹それぞれの信念状態
    pub opponent_beliefs: Vec<PokemonBelief>,
    /// 現在 P2 の場のスロット `[0, 1]` に出ている `opponent_beliefs` のインデックス
    pub p2_active_indices: [Option<usize>; 2],
}

/// 場に出た瞬間に自動発動する特性リスト（不発時にネガティブ推論で除外可能）
const ON_SWITCH_IN_ABILITIES: &[&str] = &[
    "intimidate",
    "drought",
    "drizzle",
    "sandstream",
    "snowwarning",
    "electricsurge",
    "grassysurge",
    "mistysurge",
    "psychicsurge",
];

impl BeliefState {
    /// 棋譜の先頭から `target_turn_index` ターン開始時点までの状態を再生・推論する
    /// - `target_turn_index == 0`: Turn 1 のコマンド選択直前（`lead_events` 反映後）
    /// - `target_turn_index == k`: `turns[0..k]` 反映後（Turn `k + 1` のコマンド選択直前）
    pub fn from_kifu_up_to_turn(kifu: &BattleKifu, target_turn_index: usize) -> Self {
        let mut battle = Battle::new();

        // 1. P1 の選出4匹をセット (lead_a, lead_b, bench_1, bench_2)
        for (i, &team_idx) in kifu.p1_selection.iter().enumerate() {
            if let Some(input_poke) = kifu.p1_team.get(team_idx) {
                let mut cloned = input_poke.clone();
                cloned.ident = if i == 0 {
                    "p1a".to_string()
                } else if i == 1 {
                    "p1b".to_string()
                } else {
                    format!("p1bench{}", i - 1)
                };
                let pkmn = build_pokemon(&cloned);
                if i < 2 {
                    battle.p1.active.push(pkmn);
                } else {
                    battle.p1.team.push(pkmn);
                }
            }
        }

        // 2. P2 見せ合い6匹の Belief を初期化
        let opponent_beliefs: Vec<PokemonBelief> = kifu
            .p2_preview
            .iter()
            .map(|slot| {
                PokemonBelief::from_preview(
                    slot.preview_index,
                    &slot.species,
                    slot.known_item.clone(),
                    slot.known_ability.clone(),
                    slot.known_moves.clone(),
                )
            })
            .collect();

        let mut state = Self {
            regulation: kifu.regulation,
            is_open_team_sheet: kifu.is_open_team_sheet,
            turn_number: 1,
            base_battle: battle,
            opponent_beliefs,
            p2_active_indices: [None, None],
        };

        // 3. Lead events (Turn 1 開始前の繰り出し・入場時特性発動) を反映
        state.apply_event_batch(&kifu.lead_events);
        state.sync_p2_representative_actives();

        // 4. 指定ターンまで順再生＆推論
        let limit = target_turn_index.min(kifu.turns.len());
        for turn_rec in &kifu.turns[..limit] {
            state.apply_event_batch(&turn_rec.events);
            state.advance_field_timers_end_of_turn();
            state.turn_number = turn_rec.turn_number + 1;
            state.sync_p2_representative_actives();
        }

        if let Some(current_turn) = kifu.turns.get(limit) {
            state.turn_number = current_turn.turn_number;
        }

        state
    }

    /// 1フェーズ／1ターン分の観測イベント列を処理し、状態更新と4種の推論を実行する
    pub fn apply_event_batch(&mut self, events: &[ObservedEvent]) {
        let mut switched_in_p2: Vec<usize> = Vec::new();
        let mut triggered_abilities_p2: Vec<(usize, String)> = Vec::new();
        let mut ability_trigger_order: Vec<(PokemonIdent, String)> = Vec::new();
        let mut move_order_in_batch: Vec<(PokemonIdent, String)> = Vec::new();
        let mut life_orb_recoil_seen_p2 = [false; 2];
        let mut damaging_move_used_p2 = [false; 2];

        for event in events {
            match event {
                ObservedEvent::SwitchIn {
                    player,
                    slot,
                    team_index,
                    species,
                    hp,
                } => {
                    if *player == 1 {
                        self.handle_p1_switch_in(*slot, *team_index as usize, species, *hp);
                    } else if *player == 2 {
                        let b_idx = self.resolve_p2_belief_index(*team_index, species);
                        if let Some(idx) = b_idx {
                            // 同じスロットに以前いたポケモンの active_slot を解除
                            for b in &mut self.opponent_beliefs {
                                if b.active_slot == Some(*slot) {
                                    b.active_slot = None;
                                    b.boosts = Boosts::default();
                                    b.volatile_status.clear();
                                    b.moves_used_since_switch_in.clear();
                                }
                            }
                            let belief = &mut self.opponent_beliefs[idx];
                            belief.revealed_in_battle = true;
                            belief.active_slot = Some(*slot);
                            belief.species = species.clone();
                            belief.moves_used_since_switch_in.clear();
                            if let ObservedHp::Percent { percent } = hp {
                                belief.hp_percent = *percent;
                            } else if let ObservedHp::Exact { current, max } = hp
                                && *max > 0
                            {
                                belief.hp_percent =
                                    ((*current as u32 * 100) / (*max as u32)).min(100) as u8;
                            }
                            if *slot < 2 {
                                self.p2_active_indices[*slot] = Some(idx);
                            }
                            switched_in_p2.push(idx);
                            self.sync_p2_representative_actives();
                        }
                    }
                }

                ObservedEvent::MegaEvolve {
                    target,
                    mega_species,
                    item,
                } => {
                    if target.player == 1 {
                        self.base_battle.p1.mega_used = true;
                        if let Some(p) = self.base_battle.p1.active.get_mut(target.slot) {
                            let mega_ab = pkmn_meta::mega_meta::get_mega_details(&p.species, item)
                                .map(|d| d.ability)
                                .unwrap_or("");
                            p.mega_evolve(mega_species, mega_ab);
                        }
                    } else if let Some(Some(b_idx)) = self.p2_active_indices.get(target.slot) {
                        self.base_battle.p2.mega_used = true;
                        let belief = &mut self.opponent_beliefs[*b_idx];
                        let mega_ab =
                            pkmn_meta::mega_meta::get_mega_details(&belief.base_species, item)
                                .map(|d| d.ability.to_string())
                                .or_else(|| {
                                    pkmn_meta::regulation::get_pokemon_abilities(mega_species)
                                        .and_then(|abs| abs.first().map(|s| s.to_string()))
                                });
                        belief.species = mega_species.clone();
                        belief.is_mega = true;
                        belief.reveal_item(item, false);
                        if let Some(ab) = mega_ab {
                            belief.reveal_ability(&ab);
                        }
                        // メガシンカ後の種族値に合わせて実数値レンジを再計算（EVは引き継ぐ）
                        Self::recompute_mega_stat_bounds(belief, mega_species);
                        self.sync_p2_representative_actives();
                    }
                }

                ObservedEvent::AbilityTriggered { source, ability } => {
                    if source.player == 2
                        && let Some(Some(b_idx)) = self.p2_active_indices.get(source.slot)
                    {
                        self.opponent_beliefs[*b_idx].reveal_ability(ability);
                        triggered_abilities_p2
                            .push((*b_idx, ability.replace('-', "").to_lowercase()));
                    }
                    ability_trigger_order.push((*source, ability.replace('-', "").to_lowercase()));
                }

                ObservedEvent::ItemTriggered {
                    source,
                    item,
                    consumed,
                } => {
                    if source.player == 2
                        && let Some(Some(b_idx)) = self.p2_active_indices.get(source.slot)
                    {
                        self.opponent_beliefs[*b_idx].reveal_item(item, *consumed);
                        if item.replace('-', "").eq_ignore_ascii_case("lifeorb") && source.slot < 2
                        {
                            life_orb_recoil_seen_p2[source.slot] = true;
                        }
                    }
                }

                ObservedEvent::MoveUsed {
                    attacker,
                    move_id,
                    target: _,
                } => {
                    if attacker.player == 2
                        && let Some(Some(b_idx)) = self.p2_active_indices.get(attacker.slot)
                    {
                        self.opponent_beliefs[*b_idx].reveal_move(move_id);
                        if let Some(meta) = pkmn_meta::move_meta::get_move_meta(move_id)
                            && *meta.category() != Category::Status
                            && attacker.slot < 2
                        {
                            damaging_move_used_p2[attacker.slot] = true;
                        }
                    }
                    move_order_in_batch.push((*attacker, move_id.replace('-', "").to_lowercase()));
                    self.sync_p2_representative_actives();
                }

                ObservedEvent::Damage {
                    target,
                    hp_after,
                    damage_exact,
                    is_crit,
                    effectiveness: _,
                    from_effect,
                    attacker,
                    move_id,
                    is_spread,
                } => {
                    if target.player == 1 {
                        // P1 が被弾: 相手アタッカーの Atk / SpA 実数値を逆算
                        let prev_hp = self
                            .base_battle
                            .p1
                            .active
                            .get(target.slot)
                            .map(|p| p.hp.into_inner())
                            .unwrap_or(0);
                        let actual_dmg = if let Some(d) = damage_exact {
                            *d as i32
                        } else if let ObservedHp::Exact { current, .. } = hp_after {
                            (prev_hp - (*current as i32)).max(0)
                        } else {
                            0
                        };

                        if let Some(p1_poke) = self.base_battle.p1.active.get_mut(target.slot)
                            && let ObservedHp::Exact { current, max } = hp_after
                        {
                            p1_poke.hp = (*current as i32).into();
                            p1_poke.maxhp = (*max as i32).into();
                        }

                        if actual_dmg > 0
                            && !*is_crit
                            && let (Some(atk_ident), Some(m_id)) = (attacker, move_id)
                            && atk_ident.player == 2
                        {
                            self.infer_offensive_stat_from_damage(
                                atk_ident.slot,
                                target.slot,
                                m_id,
                                actual_dmg,
                                *is_spread,
                            );
                        }
                    } else if target.player == 2 {
                        // P2 が被弾: P1 からの技ダメージなら P2 の HP/Def/SpD 耐久を逆算
                        let prev_percent = self
                            .p2_active_indices
                            .get(target.slot)
                            .and_then(|&idx| idx)
                            .map(|idx| self.opponent_beliefs[idx].hp_percent)
                            .unwrap_or(100);

                        let new_percent = match hp_after {
                            ObservedHp::Percent { percent } => Some(*percent),
                            ObservedHp::Exact { current, max } if *max > 0 => {
                                Some(((*current as u32 * 100) / (*max as u32)).min(100) as u8)
                            }
                            _ => None,
                        };

                        if let Some(after_pct) = new_percent {
                            if !*is_crit
                                && after_pct > 0
                                && after_pct < prev_percent
                                && let (Some(atk_ident), Some(m_id)) = (attacker, move_id)
                                && atk_ident.player == 1
                            {
                                self.infer_defensive_bulk_from_percent(
                                    atk_ident.slot,
                                    target.slot,
                                    m_id,
                                    prev_percent,
                                    after_pct,
                                    *is_spread,
                                );
                            }

                            if let Some(Some(b_idx)) = self.p2_active_indices.get(target.slot) {
                                self.opponent_beliefs[*b_idx].hp_percent = after_pct;
                                if from_effect.as_deref().is_some_and(|e| {
                                    e.replace('-', "").eq_ignore_ascii_case("lifeorb")
                                }) {
                                    self.opponent_beliefs[*b_idx].reveal_item("life-orb", false);
                                    if target.slot < 2 {
                                        life_orb_recoil_seen_p2[target.slot] = true;
                                    }
                                }
                            }
                        }
                        self.sync_p2_representative_actives();
                    }
                }

                ObservedEvent::Heal {
                    target,
                    hp_after,
                    from_effect,
                } => {
                    if target.player == 1 {
                        if let Some(p1_poke) = self.base_battle.p1.active.get_mut(target.slot)
                            && let ObservedHp::Exact { current, .. } = hp_after
                        {
                            p1_poke.hp = (*current as i32).into();
                        }
                    } else if let Some(Some(b_idx)) = self.p2_active_indices.get(target.slot) {
                        if let ObservedHp::Percent { percent } = hp_after {
                            self.opponent_beliefs[*b_idx].hp_percent = *percent;
                        }
                        if let Some(eff) = from_effect {
                            let norm = eff.replace('-', "").to_lowercase();
                            if norm == "leftovers" {
                                self.opponent_beliefs[*b_idx].reveal_item("leftovers", false);
                            } else if norm == "sitrusberry" {
                                self.opponent_beliefs[*b_idx].reveal_item("sitrus-berry", true);
                            }
                        }
                        self.sync_p2_representative_actives();
                    }
                }

                ObservedEvent::StatStageChanged {
                    target,
                    stat,
                    delta,
                } => {
                    if target.player == 1 {
                        if let Some(p) = self.base_battle.p1.active.get_mut(target.slot) {
                            Self::apply_boost_delta(&mut p.boosts, stat, *delta);
                        }
                    } else if let Some(Some(b_idx)) = self.p2_active_indices.get(target.slot) {
                        Self::apply_boost_delta(
                            &mut self.opponent_beliefs[*b_idx].boosts,
                            stat,
                            *delta,
                        );
                        self.sync_p2_representative_actives();
                    }
                }

                ObservedEvent::StatusChanged { target, status } => {
                    if target.player == 1 {
                        if let Some(p) = self.base_battle.p1.active.get_mut(target.slot) {
                            p.status = status
                                .as_deref()
                                .and_then(|s| std::str::FromStr::from_str(s).ok());
                        }
                    } else if let Some(Some(b_idx)) = self.p2_active_indices.get(target.slot) {
                        self.opponent_beliefs[*b_idx].status = status.clone();
                        self.sync_p2_representative_actives();
                    }
                }

                ObservedEvent::WeatherChanged { weather } => {
                    self.base_battle.weather = weather
                        .as_deref()
                        .and_then(|w| std::str::FromStr::from_str(w).ok());
                    self.base_battle.weather_turns_left = if self.base_battle.weather.is_some() {
                        5
                    } else {
                        0
                    };
                }

                ObservedEvent::TerrainChanged { terrain } => {
                    self.base_battle.terrain = terrain
                        .as_deref()
                        .and_then(|t| std::str::FromStr::from_str(t).ok());
                    self.base_battle.terrain_turns_left = if self.base_battle.terrain.is_some() {
                        5
                    } else {
                        0
                    };
                }

                ObservedEvent::FieldConditionChanged { condition, active } => {
                    let norm = condition.replace('-', "").to_lowercase();
                    if norm == "trickroom" {
                        self.base_battle.trick_room = if *active {
                            std::num::NonZeroU8::new(5)
                        } else {
                            None
                        };
                    }
                }

                ObservedEvent::SideConditionChanged {
                    player,
                    condition,
                    active,
                } => {
                    let side = if *player == 1 {
                        &mut self.base_battle.p1
                    } else {
                        &mut self.base_battle.p2
                    };
                    let norm = condition.replace('-', "").to_lowercase();
                    match norm.as_str() {
                        "tailwind" => {
                            side.tailwind = if *active {
                                std::num::NonZeroU8::new(4)
                            } else {
                                None
                            };
                        }
                        "reflect" => side.reflect_turns = if *active { 5 } else { 0 },
                        "lightscreen" => side.lightscreen_turns = if *active { 5 } else { 0 },
                        "auroraveil" => side.aurora_veil_turns = if *active { 5 } else { 0 },
                        _ => {}
                    }
                }

                ObservedEvent::Faint { target } => {
                    if target.player == 1 {
                        if let Some(p) = self.base_battle.p1.active.get_mut(target.slot) {
                            p.hp = 0.into();
                        }
                    } else if let Some(Some(b_idx)) = self.p2_active_indices.get(target.slot) {
                        self.opponent_beliefs[*b_idx].hp_percent = 0;
                        self.sync_p2_representative_actives();
                    }
                }
            }
        }

        // ネガティブ推論1: 繰り出し時に発動しなかった入場時特性を除外
        for &b_idx in &switched_in_p2 {
            for &entry_ab in ON_SWITCH_IN_ABILITIES {
                let did_trigger = triggered_abilities_p2
                    .iter()
                    .any(|(idx, ab)| *idx == b_idx && ab == entry_ab);
                if !did_trigger {
                    self.opponent_beliefs[b_idx].exclude_ability(entry_ab);
                }
            }
        }

        // ネガティブ推論2: 攻撃技を使ったがいのちのたま反動がなかった場合、life-orb を除外
        for slot in 0..2 {
            if damaging_move_used_p2[slot]
                && !life_orb_recoil_seen_p2[slot]
                && let Some(b_idx) = self.p2_active_indices[slot]
            {
                let ab = self.opponent_beliefs[b_idx].known_ability.as_deref();
                if ab != Some("sheerforce") && ab != Some("magicguard") {
                    self.opponent_beliefs[b_idx].exclude_item("life-orb");
                    self.opponent_beliefs[b_idx].exclude_item("lifeorb");
                }
            }
        }

        // 素早さ推論1: 繰り出し時の特性発動順から S 関係を推論
        if ability_trigger_order.len() >= 2 {
            for pair in ability_trigger_order.windows(2) {
                let (first_ident, first_ab) = &pair[0];
                let (second_ident, second_ab) = &pair[1];
                if ON_SWITCH_IN_ABILITIES.contains(&first_ab.as_str())
                    && ON_SWITCH_IN_ABILITIES.contains(&second_ab.as_str())
                {
                    self.infer_speed_from_action_pair(*first_ident, *second_ident);
                }
            }
        }

        // 素早さ推論2: 同一優先度の技の行動順から S 関係を推論
        if move_order_in_batch.len() >= 2 {
            for pair in move_order_in_batch.windows(2) {
                let (first_ident, first_move) = &pair[0];
                let (second_ident, second_move) = &pair[1];
                if self.effective_move_priority(*first_ident, first_move)
                    == self.effective_move_priority(*second_ident, second_move)
                {
                    self.infer_speed_from_action_pair(*first_ident, *second_ident);
                }
            }
        }

        self.sync_p2_representative_actives();
    }

    fn apply_boost_delta(boosts: &mut Boosts, stat: &str, delta: i8) {
        let clamp = |v: i8| v.clamp(-6, 6);
        match stat {
            "atk" => boosts.atk = clamp(boosts.atk.into_inner() + delta).into(),
            "def" => boosts.def = clamp(boosts.def.into_inner() + delta).into(),
            "spa" => boosts.spa = clamp(boosts.spa.into_inner() + delta).into(),
            "spd" => boosts.spd = clamp(boosts.spd.into_inner() + delta).into(),
            "spe" => boosts.spe = clamp(boosts.spe.into_inner() + delta).into(),
            _ => {}
        }
    }

    fn recompute_mega_stat_bounds(belief: &mut PokemonBelief, mega_species: &str) {
        if let Some(meta) = pkmn_meta::pokemon_meta::get_pokemon_meta(mega_species) {
            let bs = meta.base_stats();
            belief.atk_stat_range = (calc_stat_lv50(bs[1], 0, -1), calc_stat_lv50(bs[1], 32, 1));
            belief.def_stat_range = (calc_stat_lv50(bs[2], 0, -1), calc_stat_lv50(bs[2], 32, 1));
            belief.spa_stat_range = (calc_stat_lv50(bs[3], 0, -1), calc_stat_lv50(bs[3], 32, 1));
            belief.spd_stat_range = (calc_stat_lv50(bs[4], 0, -1), calc_stat_lv50(bs[4], 32, 1));
            belief.spe_stat_range = (calc_stat_lv50(bs[5], 0, -1), calc_stat_lv50(bs[5], 32, 1));
        }
    }

    fn handle_p1_switch_in(
        &mut self,
        slot: usize,
        _team_index: usize,
        species: &str,
        hp: ObservedHp,
    ) {
        let norm_species = species.replace('-', "").to_lowercase();
        if let Some(active_poke) = self.base_battle.p1.active.get_mut(slot)
            && active_poke
                .species
                .replace('-', "")
                .eq_ignore_ascii_case(&norm_species)
        {
            if let ObservedHp::Exact { current, max } = hp {
                active_poke.hp = (current as i32).into();
                active_poke.maxhp = (max as i32).into();
            }
            return;
        }

        if let Some(bench_pos) = self.base_battle.p1.team.iter().position(|p| {
            p.species
                .replace('-', "")
                .eq_ignore_ascii_case(&norm_species)
        }) && slot < self.base_battle.p1.active.len()
        {
            let mut old = self.base_battle.p1.active.remove(slot);
            let mut new_poke = self.base_battle.p1.team.remove(bench_pos);
            old.boosts = Boosts::default();
            old.volatile_status.clear();
            if let ObservedHp::Exact { current, max } = hp {
                new_poke.hp = (current as i32).into();
                new_poke.maxhp = (max as i32).into();
            }
            new_poke.ident = if slot == 0 {
                "p1a".to_string()
            } else {
                "p1b".to_string()
            };
            self.base_battle.p1.active.insert(slot, new_poke);
            self.base_battle.p1.team.insert(bench_pos, old);
        }
    }

    fn resolve_p2_belief_index(&self, team_index: u8, species: &str) -> Option<usize> {
        if let Some(pos) = self
            .opponent_beliefs
            .iter()
            .position(|b| b.preview_index == team_index)
        {
            return Some(pos);
        }
        let norm = species.replace('-', "").to_lowercase();
        self.opponent_beliefs.iter().position(|b| {
            b.species.replace('-', "").to_lowercase() == norm
                || b.base_species.replace('-', "").to_lowercase() == norm
        })
    }

    fn effective_move_priority(&self, attacker: PokemonIdent, move_id: &str) -> i32 {
        let mut prio = pkmn_meta::move_meta::get_move_meta(move_id)
            .map(|m| *m.priority())
            .unwrap_or(0);

        let is_status = pkmn_meta::move_meta::get_move_meta(move_id)
            .is_some_and(|m| *m.category() == Category::Status);
        let is_flying = pkmn_meta::move_meta::get_move_meta(move_id)
            .is_some_and(|m| *m.move_type() == pkmn_meta::types::Type::Flying);

        if attacker.player == 1 {
            if let Some(p) = self.base_battle.p1.active.get(attacker.slot) {
                let ab = p.ability.as_ref().map(|a| a.as_str());
                if (ab == Some("prankster") && is_status)
                    || (ab == Some("galewings") && is_flying && p.hp == p.maxhp)
                {
                    prio += 1;
                }
            }
        } else if let Some(Some(b_idx)) = self.p2_active_indices.get(attacker.slot) {
            let belief = &self.opponent_beliefs[*b_idx];
            let ab = belief.known_ability.as_deref();
            if (ab == Some("prankster") && is_status)
                || (ab == Some("galewings") && is_flying && belief.hp_percent == 100)
            {
                prio += 1;
            }
        }

        if move_id == "grassyglide" && self.base_battle.terrain == Some(Terrain::Grassy) {
            prio += 1;
        }

        prio
    }

    /// P1 のアクティブスロットの確定実効素早さを計算
    pub fn get_p1_effective_speed(&self, slot: usize) -> Option<u16> {
        let pkmn = self.base_battle.p1.active.get(slot)?;
        if pkmn.hp.into_inner() <= 0 {
            return None;
        }
        let mut spe = pkmn.speed.apply_boost(pkmn.boosts.spe);
        if pkmn.status.as_ref().map(|s| s.as_ref()) == Some("par") {
            spe = spe / 2;
        }
        if self.base_battle.p1.is_tailwind() {
            spe = spe * 2.0;
        }
        if let Some(item_meta) = pkmn
            .item
            .as_ref()
            .and_then(pkmn_meta::item_meta::get_item_meta)
        {
            if *item_meta.is_choice_scarf() {
                spe = spe * 1.5;
            } else if *item_meta.is_speed_drop() {
                spe = spe / 2;
            }
        }
        let ab = pkmn.ability.as_ref().map(|a| a.as_str());
        let weather = self.base_battle.get_active_weather();
        if (ab == Some("swiftswim") && matches!(weather, Some(Weather::Rain | Weather::HeavyRain)))
            || (ab == Some("chlorophyll")
                && matches!(
                    weather,
                    Some(Weather::HashSunlight | Weather::ExtremelyHarshSunlight)
                ))
            || (ab == Some("sandrush") && weather == Some(Weather::Sandstorm))
            || (ab == Some("slushrush") && weather == Some(Weather::Snow))
            || (ab == Some("surgesurfer") && self.base_battle.terrain == Some(Terrain::Electric))
        {
            spe = spe * 2.0;
        }
        Some(spe.into_inner().max(1) as u16)
    }

    /// P2 の素の素早さ実数値 `raw_spe` に対する現在の実効素早さを計算
    pub fn calc_p2_effective_speed_for_raw(
        &self,
        belief: &PokemonBelief,
        raw_spe: u16,
        assume_choice_scarf: bool,
    ) -> u16 {
        let base_speed: crate::sim::values::Speed = (raw_spe as i32).into();
        let mut spe = base_speed.apply_boost(belief.boosts.spe);
        if belief.status.as_deref() == Some("par") {
            spe = spe / 2;
        }
        if self.base_battle.p2.is_tailwind() {
            spe = spe * 2.0;
        }
        let has_scarf = assume_choice_scarf
            || (!belief.item_consumed
                && belief
                    .known_item
                    .as_deref()
                    .is_some_and(|i| i.replace('-', "") == "choicescarf"));
        if has_scarf {
            spe = spe * 1.5;
        }
        let ab = belief.known_ability.as_deref();
        let weather = self.base_battle.get_active_weather();
        if (ab == Some("swiftswim") && matches!(weather, Some(Weather::Rain | Weather::HeavyRain)))
            || (ab == Some("chlorophyll")
                && matches!(
                    weather,
                    Some(Weather::HashSunlight | Weather::ExtremelyHarshSunlight)
                ))
            || (ab == Some("sandrush") && weather == Some(Weather::Sandstorm))
            || (ab == Some("slushrush") && weather == Some(Weather::Snow))
            || (ab == Some("surgesurfer") && self.base_battle.terrain == Some(Terrain::Electric))
        {
            spe = spe * 2.0;
        }
        spe.into_inner().max(1) as u16
    }

    /// 行動順 `(first, second)` から相手の素早さ実数値レンジを絞り込む
    fn infer_speed_from_action_pair(&mut self, first: PokemonIdent, second: PokemonIdent) {
        if first.player == second.player {
            return;
        }
        let is_trick_room = self.base_battle.is_trick_room();

        let (p1_slot, p2_slot, p2_moved_first) = if first.player == 1 {
            (first.slot, second.slot, false)
        } else {
            (second.slot, first.slot, true)
        };

        let Some(p1_eff_spe) = self.get_p1_effective_speed(p1_slot) else {
            return;
        };
        let Some(Some(b_idx)) = self.p2_active_indices.get(p2_slot).copied() else {
            return;
        };

        // トリックルーム下では遅い方が先に動く
        let p2_has_higher_or_equal_eff_spe = if is_trick_room {
            !p2_moved_first
        } else {
            p2_moved_first
        };

        let belief_clone = self.opponent_beliefs[b_idx].clone();
        let (min_raw, max_raw) = belief_clone.spe_stat_range;
        let scarf_definitely_absent = belief_clone
            .known_item
            .as_deref()
            .is_some_and(|i| i.replace('-', "") != "choicescarf")
            || belief_clone.is_item_excluded("choice-scarf");

        if p2_has_higher_or_equal_eff_spe {
            // P2 の実効素早さ >= p1_eff_spe
            if scarf_definitely_absent {
                // スカーフ無しで p1_eff_spe 以上になる最小の raw_spe を求める
                let valid_min = (min_raw..=max_raw).find(|&raw| {
                    self.calc_p2_effective_speed_for_raw(&belief_clone, raw, false) >= p1_eff_spe
                });
                if let Some(vmin) = valid_min {
                    self.opponent_beliefs[b_idx].tighten_spe_min(vmin);
                }
            } else {
                // スカーフ未確定の場合でも、最速 (max_raw) かつスカーフ無しで p1_eff_spe に届かないなら、スカーフ確定！
                let max_without_scarf =
                    self.calc_p2_effective_speed_for_raw(&belief_clone, max_raw, false);
                if max_without_scarf < p1_eff_spe {
                    self.opponent_beliefs[b_idx].reveal_item("choice-scarf", false);
                    let updated_clone = self.opponent_beliefs[b_idx].clone();
                    if let Some(vmin) = (min_raw..=max_raw).find(|&raw| {
                        self.calc_p2_effective_speed_for_raw(&updated_clone, raw, true)
                            >= p1_eff_spe
                    }) {
                        self.opponent_beliefs[b_idx].tighten_spe_min(vmin);
                    }
                }
            }
        } else {
            // P2 の実効素早さ <= p1_eff_spe
            // スカーフを持っていない場合でも p1_eff_spe 以下である必要があるため、無条件の上限が決まる
            let valid_max = (min_raw..=max_raw).rev().find(|&raw| {
                self.calc_p2_effective_speed_for_raw(&belief_clone, raw, false) <= p1_eff_spe
            });
            if let Some(vmax) = valid_max {
                self.opponent_beliefs[b_idx].tighten_spe_max(vmax);
            }
            // スカーフ持ちが素早さ下降補正 (-1) を採用することはないため、無補正0振り (または現在の min_raw) でスカーフを持った場合の下限で判定
            let neutral_zero_ev_spe =
                pkmn_meta::pokemon_meta::get_pokemon_meta(&belief_clone.species)
                    .map(|m| calc_stat_lv50(m.base_stats()[5], 0, 0))
                    .unwrap_or(min_raw)
                    .max(min_raw);
            let min_with_scarf =
                self.calc_p2_effective_speed_for_raw(&belief_clone, neutral_zero_ev_spe, true);
            if min_with_scarf > p1_eff_spe && belief_clone.known_item.is_none() {
                self.opponent_beliefs[b_idx].exclude_item("choice-scarf");
                self.opponent_beliefs[b_idx].exclude_item("choicescarf");
            }
        }
    }

    /// 被ダメージ実数値 (P2 -> P1) から P2 の攻撃・特攻実数値レンジを逆算
    fn infer_offensive_stat_from_damage(
        &mut self,
        p2_slot: usize,
        p1_slot: usize,
        move_id: &str,
        observed_damage: i32,
        is_spread: bool,
    ) {
        let Some(Some(b_idx)) = self.p2_active_indices.get(p2_slot).copied() else {
            return;
        };
        let Some(move_meta) = pkmn_meta::move_meta::get_move_meta(move_id) else {
            return;
        };
        if *move_meta.category() == Category::Status {
            return;
        }
        let is_physical = *move_meta.category() == Category::Physical;
        let species = self.opponent_beliefs[b_idx].species.clone();
        let Some(poke_meta) = pkmn_meta::pokemon_meta::get_pokemon_meta(&species) else {
            return;
        };

        let base_stat = if is_physical {
            poke_meta.base_stats()[1]
        } else {
            poke_meta.base_stats()[3]
        };

        let current_range = if is_physical {
            self.opponent_beliefs[b_idx].atk_stat_range
        } else {
            self.opponent_beliefs[b_idx].spa_stat_range
        };

        // 持ち物が確定している場合はその持ち物のみ、未確定でも「持ち物補正なし」でまず一致する実数値を探す
        let mut valid_stats_no_boost = Vec::new();
        let mut test_battle = self.base_battle.clone();

        for ev in 0..=32u8 {
            for nature_mod in [-1i8, 0, 1] {
                let cand_stat = calc_stat_lv50(base_stat, ev, nature_mod);
                if cand_stat < current_range.0 || cand_stat > current_range.1 {
                    continue;
                }
                if let Some(p2_poke) = test_battle.p2.active.get_mut(p2_slot) {
                    if is_physical {
                        p2_poke.attack = (cand_stat as i32).into();
                    } else {
                        p2_poke.sp_attack = (cand_stat as i32).into();
                    }
                }
                let eval = DamageEvaluator::new(&test_battle);
                let (min_d, max_d) =
                    eval.evaluate_range(move_id, 2, p2_slot as u8, 1, p1_slot as u8, is_spread);
                if observed_damage >= min_d && observed_damage <= max_d {
                    valid_stats_no_boost.push(cand_stat);
                }
            }
        }

        if let (Some(&min_s), Some(&max_s)) = (
            valid_stats_no_boost.iter().min(),
            valid_stats_no_boost.iter().max(),
        ) {
            if is_physical {
                self.opponent_beliefs[b_idx].atk_stat_range =
                    (current_range.0.max(min_s), current_range.1.min(max_s));
            } else {
                self.opponent_beliefs[b_idx].spa_stat_range =
                    (current_range.0.max(min_s), current_range.1.min(max_s));
            }
        }
    }

    /// 与ダメージ百分率変化 (P1 -> P2: `prev_percent`% -> `after_percent`%) から P2 の HP/耐久実数値レンジを逆算
    fn infer_defensive_bulk_from_percent(
        &mut self,
        p1_slot: usize,
        p2_slot: usize,
        move_id: &str,
        prev_percent: u8,
        after_percent: u8,
        is_spread: bool,
    ) {
        let Some(Some(b_idx)) = self.p2_active_indices.get(p2_slot).copied() else {
            return;
        };
        let Some(move_meta) = pkmn_meta::move_meta::get_move_meta(move_id) else {
            return;
        };
        if *move_meta.category() == Category::Status {
            return;
        }
        let is_physical = *move_meta.category() == Category::Physical;
        let species = self.opponent_beliefs[b_idx].species.clone();
        let Some(poke_meta) = pkmn_meta::pokemon_meta::get_pokemon_meta(&species) else {
            return;
        };

        let base_hp = poke_meta.base_stats()[0];
        let base_def = if is_physical {
            poke_meta.base_stats()[2]
        } else {
            poke_meta.base_stats()[4]
        };

        let hp_ev_bounds = self.opponent_beliefs[b_idx].hp_ev_range;
        let def_bounds = if is_physical {
            self.opponent_beliefs[b_idx].def_stat_range
        } else {
            self.opponent_beliefs[b_idx].spd_stat_range
        };

        let pct_drop = prev_percent.saturating_sub(after_percent) as i32;
        if pct_drop <= 0 {
            return;
        }

        let mut valid_hp_evs = Vec::new();
        let mut valid_def_stats = Vec::new();
        let mut test_battle = self.base_battle.clone();

        for def_ev in 0..=32u8 {
            for nature_mod in [-1i8, 0, 1] {
                let cand_def = calc_stat_lv50(base_def, def_ev, nature_mod);
                if cand_def < def_bounds.0 || cand_def > def_bounds.1 {
                    continue;
                }
                if let Some(p2_poke) = test_battle.p2.active.get_mut(p2_slot) {
                    if is_physical {
                        p2_poke.defense = (cand_def as i32).into();
                    } else {
                        p2_poke.sp_defense = (cand_def as i32).into();
                    }
                }
                let eval = DamageEvaluator::new(&test_battle);
                let (min_d, max_d) =
                    eval.evaluate_range(move_id, 1, p1_slot as u8, 2, p2_slot as u8, is_spread);

                for hp_ev in hp_ev_bounds.0..=hp_ev_bounds.1 {
                    // 合計 EV 66 制限: hp_ev + def_ev <= 66
                    if (hp_ev as u16 + def_ev as u16) > 66 {
                        continue;
                    }
                    let max_hp = calc_hp_lv50(&species, base_hp, hp_ev) as i32;
                    // 最小ダメージでの割合減少と最大ダメージでの割合減少 (±1% の表示丸め許容)
                    let min_pct = (min_d * 100) / max_hp;
                    let max_pct = ((max_d * 100) + max_hp - 1) / max_hp;
                    if pct_drop >= (min_pct - 1) && pct_drop <= (max_pct + 1) {
                        valid_hp_evs.push(hp_ev);
                        valid_def_stats.push(cand_def);
                    }
                }
            }
        }

        if let (Some(&min_hev), Some(&max_hev), Some(&min_def), Some(&max_def)) = (
            valid_hp_evs.iter().min(),
            valid_hp_evs.iter().max(),
            valid_def_stats.iter().min(),
            valid_def_stats.iter().max(),
        ) {
            let belief = &mut self.opponent_beliefs[b_idx];
            belief.hp_ev_range = (hp_ev_bounds.0.max(min_hev), hp_ev_bounds.1.min(max_hev));
            belief.hp_stat_range = (
                calc_hp_lv50(&species, base_hp, belief.hp_ev_range.0),
                calc_hp_lv50(&species, base_hp, belief.hp_ev_range.1),
            );
            if is_physical {
                belief.def_stat_range = (def_bounds.0.max(min_def), def_bounds.1.min(max_def));
            } else {
                belief.spd_stat_range = (def_bounds.0.max(min_def), def_bounds.1.min(max_def));
            }
        }
    }

    /// `base_battle.p2.active` を現在の `opponent_beliefs` の代表値（中央値）と同期する
    pub fn sync_p2_representative_actives(&mut self) {
        self.base_battle.p2.active.clear();
        for slot in 0..2 {
            if let Some(b_idx) = self.p2_active_indices[slot] {
                let belief = &self.opponent_beliefs[b_idx];
                let ident = if slot == 0 { "p2a" } else { "p2b" };
                let pkmn = Self::build_representative_pokemon_from_belief(ident, belief);
                self.base_battle.p2.active.push(pkmn);
            }
        }
    }

    pub fn build_representative_pokemon_from_belief(
        ident: &str,
        belief: &PokemonBelief,
    ) -> Pokemon {
        let mid = |(lo, hi): (u16, u16)| ((lo as i32 + hi as i32) / 2).max(1);
        let max_hp = mid(belief.hp_stat_range);
        let cur_hp = if belief.hp_percent == 0 {
            0
        } else {
            ((max_hp * belief.hp_percent as i32) / 100).max(1)
        };

        let meta_opt = pkmn_meta::pokemon_meta::get_pokemon_meta(&belief.species);
        let type1 = meta_opt
            .as_ref()
            .map(|m| format!("{:?}", m.type1()))
            .unwrap_or_else(|| "Normal".to_string());
        let type2 = meta_opt
            .as_ref()
            .and_then(|m| m.type2().map(|t| format!("{:?}", t)));

        let ability = belief
            .known_ability
            .clone()
            .or_else(|| belief.candidate_abilities.first().cloned());

        let item = if belief.item_consumed {
            None
        } else {
            belief.known_item.clone()
        };

        build_pokemon(&InputPokemonData {
            ident: ident.to_string(),
            species: belief.species.clone(),
            hp: cur_hp,
            maxhp: max_hp,
            attack: mid(belief.atk_stat_range),
            defense: mid(belief.def_stat_range),
            sp_attack: mid(belief.spa_stat_range),
            sp_defense: mid(belief.spd_stat_range),
            speed: mid(belief.spe_stat_range),
            item,
            ability,
            status: belief.status.clone(),
            type1,
            type2,
            boosts: belief.boosts.clone(),
            volatile_status: belief.volatile_status.clone(),
            moves: belief.known_moves.clone(),
            is_mega: belief.is_mega,
            ..Default::default()
        })
    }

    fn advance_field_timers_end_of_turn(&mut self) {
        if self.base_battle.weather_turns_left > 0 {
            self.base_battle.weather_turns_left -= 1;
            if self.base_battle.weather_turns_left == 0 {
                self.base_battle.weather = None;
            }
        }
        if self.base_battle.terrain_turns_left > 0 {
            self.base_battle.terrain_turns_left -= 1;
            if self.base_battle.terrain_turns_left == 0 {
                self.base_battle.terrain = None;
            }
        }
        if let Some(tr) = self.base_battle.trick_room {
            self.base_battle.trick_room = std::num::NonZeroU8::new(tr.get() - 1);
        }
        if let Some(tw1) = self.base_battle.p1.tailwind {
            self.base_battle.p1.tailwind = std::num::NonZeroU8::new(tw1.get() - 1);
        }
        if let Some(tw2) = self.base_battle.p2.tailwind {
            self.base_battle.p2.tailwind = std::num::NonZeroU8::new(tw2.get() - 1);
        }
    }

    /// 現在の BeliefState から可視化用スナップショット (`TurnSnapshotView`) を生成する (Goal 2)
    pub fn to_snapshot_view(&self) -> TurnSnapshotView {
        let mut p1_board_values = [0.0; 2];
        let mut p2_board_values = [0.0; 2];
        resolve_board_threats(
            &self.base_battle,
            false,
            &mut p1_board_values,
            &mut p2_board_values,
        );

        let mut speed_comparisons = Vec::new();
        for p1_slot in 0..self.base_battle.p1.active.len() {
            let Some(p1_eff_spe) = self.get_p1_effective_speed(p1_slot) else {
                continue;
            };
            for p2_slot in 0..2 {
                let Some(b_idx) = self.p2_active_indices[p2_slot] else {
                    continue;
                };
                let belief = &self.opponent_beliefs[b_idx];
                if belief.hp_percent == 0 {
                    continue;
                }
                let p2_min_eff =
                    self.calc_p2_effective_speed_for_raw(belief, belief.spe_stat_range.0, false);
                let p2_max_eff =
                    self.calc_p2_effective_speed_for_raw(belief, belief.spe_stat_range.1, false);

                let knowledge = if p1_eff_spe > p2_max_eff {
                    SpeedOrderKnowledge::Faster
                } else if p1_eff_spe < p2_min_eff {
                    SpeedOrderKnowledge::Slower
                } else {
                    SpeedOrderKnowledge::Ambiguous
                };

                speed_comparisons.push(ActiveSpeedComparison {
                    p1_slot,
                    p2_slot,
                    p1_effective_speed: p1_eff_spe,
                    p2_effective_speed_range: (p2_min_eff, p2_max_eff),
                    knowledge,
                });
            }
        }

        let revealed_count = self
            .opponent_beliefs
            .iter()
            .filter(|b| b.revealed_in_battle)
            .count();
        let unrevealed_opponent_bench_slots = 4usize.saturating_sub(revealed_count);

        TurnSnapshotView {
            turn_number: self.turn_number,
            weather: self.base_battle.weather.map(|w| w.to_string()),
            terrain: self.base_battle.terrain.map(|t| t.to_string()),
            trick_room: self.base_battle.is_trick_room(),
            p1_tailwind: self.base_battle.p1.is_tailwind(),
            p2_tailwind: self.base_battle.p2.is_tailwind(),
            p1_board_values,
            p2_board_values,
            speed_comparisons,
            opponent_beliefs: self
                .opponent_beliefs
                .iter()
                .map(PokemonBelief::to_view)
                .collect(),
            unrevealed_opponent_bench_slots,
        }
    }
}
