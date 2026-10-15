use crate::sim::battle::Battle;
use crate::sim::damage_evaluator::DamageEvaluator;
use crate::sim::pokemon::Pokemon;
use pkmn_meta::types::{Category, Type};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BattleResult {
    Win(u8), // Winning player: 1 or 2
    Draw,
    Ongoing,
}

/// Checks whether the battle has ended or is still ongoing.
pub fn check_battle_result(battle: &Battle) -> BattleResult {
    let p1_alive = battle
        .p1
        .active
        .iter()
        .chain(&battle.p1.team)
        .any(|p| p.hp.into_inner() > 0);
    let p2_alive = battle
        .p2
        .active
        .iter()
        .chain(&battle.p2.team)
        .any(|p| p.hp.into_inner() > 0);

    match (p1_alive, p2_alive) {
        (true, false) => BattleResult::Win(1),
        (false, true) => BattleResult::Win(2),
        (false, false) => BattleResult::Draw,
        (true, true) => BattleResult::Ongoing,
    }
}

// =========================================================================
// Step 1: 基礎生存価値 (Base Alive & HP Value)
// Base(p) = c_alive + (1.0 - c_alive) * (HP(p) / MaxHP(p))
// =========================================================================
pub fn calculate_base_value(p: &Pokemon) -> f64 {
    let cur_hp = p.hp.into_inner();
    if cur_hp <= 0 {
        return 0.0;
    }
    let max_hp = p.maxhp.into_inner().max(1);
    let hp_ratio = (cur_hp as f64 / max_hp as f64).clamp(0.0, 1.0);
    const C_ALIVE: f64 = 0.25;
    C_ALIVE + (1.0 - C_ALIVE) * hp_ratio
}

// =========================================================================
// Step 2: 能力ランク・状態異常による実効価値補正 (Effective Stat Value)
// StatValue(p) = Base(p) * (0.5 * M_off + 0.5 * M_def) * M_status
// =========================================================================
fn boost_multiplier(stage: i8) -> f64 {
    let s = stage.clamp(-6, 6);
    if s >= 0 {
        (2.0 + s as f64) / 2.0
    } else {
        2.0 / (2.0 - s as f64)
    }
}

pub fn calculate_stat_value(p: &Pokemon) -> f64 {
    let base = calculate_base_value(p);
    if base <= 0.0 {
        return 0.0;
    }

    // Determine primary offensive category (physical vs special) based on moves or base stats
    let mut phys_moves = 0;
    let mut spec_moves = 0;
    for m in &p.moves {
        if let Some(meta) = pkmn_meta::move_meta::get_move_meta(m) {
            match meta.category() {
                Category::Physical => phys_moves += 1,
                Category::Special => spec_moves += 1,
                _ => {}
            }
        }
    }
    let is_physical = if phys_moves > spec_moves {
        true
    } else if spec_moves > phys_moves {
        false
    } else {
        p.attack.into_inner() >= p.sp_attack.into_inner()
    };

    let off_stage = if is_physical {
        p.boosts.atk.into_inner()
    } else {
        p.boosts.spa.into_inner()
    };
    let off_raw = boost_multiplier(off_stage);
    let m_off = off_raw.sqrt(); // gamma = 0.5 (square root)

    let def_raw = boost_multiplier(p.boosts.def.into_inner());
    let spd_raw = boost_multiplier(p.boosts.spd.into_inner());
    let def_avg = 0.5 * (def_raw + spd_raw);
    let m_def = def_avg.powf(0.35).min(1.6); // gamma_def = 0.35 capped at 1.6

    let mut m_status = 1.0;
    if let Some(st) = &p.status {
        match st.as_ref() {
            "brn" => {
                let has_guts = p.ability.as_ref().map(|a| a.as_str()) == Some("guts");
                if is_physical && !has_guts {
                    m_status *= 0.5;
                }
            }
            "slp" | "frz" => {
                m_status *= 0.4;
            }
            "par" => {
                m_status *= 0.8;
            }
            _ => {}
        }
    }

    base * (0.5 * m_off + 0.5 * m_def) * m_status
}

// =========================================================================
// Helper: Effective speed calculation
// =========================================================================
fn get_effective_speed(battle: &Battle, pkmn: &Pokemon, ignore_speed_control: bool) -> i32 {
    let mut spe = pkmn.speed.apply_boost(pkmn.boosts.spe);
    if pkmn.status.as_ref().map(|s| s.as_ref()) == Some("par") {
        spe = spe / 2;
    }
    if !ignore_speed_control {
        let is_p1 = battle.p1.active.iter().any(|p| p.ident == pkmn.ident);
        if (is_p1 && battle.p1.tailwind) || (!is_p1 && battle.p2.tailwind) {
            spe = spe * 2.0;
        }
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
    let pkmn_ability = pkmn.ability.as_ref().map(|a| a.as_str());
    let active_weather = battle.get_active_weather();
    if (pkmn_ability == Some("swiftswim")
        && (active_weather == Some(pkmn_meta::types::Weather::Rain)
            || active_weather == Some(pkmn_meta::types::Weather::HeavyRain)))
        || (pkmn_ability == Some("chlorophyll")
            && (active_weather == Some(pkmn_meta::types::Weather::HashSunlight)
                || active_weather == Some(pkmn_meta::types::Weather::ExtremelyHarshSunlight)))
        || (pkmn_ability == Some("sandrush")
            && active_weather == Some(pkmn_meta::types::Weather::Sandstorm))
        || (pkmn_ability == Some("slushrush")
            && active_weather == Some(pkmn_meta::types::Weather::Snow))
        || (pkmn_ability == Some("surgesurfer")
            && battle.terrain == Some(pkmn_meta::types::Terrain::Electric))
    {
        spe = spe * 2.0;
    }
    if pkmn_ability == Some("quickfeet") && pkmn.status.is_some() {
        spe = spe * 1.5;
        if pkmn.status.as_ref().map(|s| s.as_ref()) == Some("par") {
            spe = spe * 2.0;
        }
    }
    spe.into_inner()
}

// =========================================================================
// Step 3: 場の4匹の行動順解決 & 縛り・受け出し・まもる・吸寄せ解析
// =========================================================================
#[derive(Clone, Copy, Debug)]
struct ActiveSlot {
    player: u8,
    slot: usize,
    eff_speed: i32,
    is_alive: bool,
}

pub fn resolve_board_threats(
    battle: &Battle,
    ignore_speed_control: bool,
    out_board_values_p1: &mut [f64; 2],
    out_board_values_p2: &mut [f64; 2],
) {
    let is_trick_room = if ignore_speed_control {
        false
    } else {
        battle.trick_room
    };

    let mut slots = [
        ActiveSlot {
            player: 1,
            slot: 0,
            eff_speed: 0,
            is_alive: false,
        },
        ActiveSlot {
            player: 1,
            slot: 1,
            eff_speed: 0,
            is_alive: false,
        },
        ActiveSlot {
            player: 2,
            slot: 0,
            eff_speed: 0,
            is_alive: false,
        },
        ActiveSlot {
            player: 2,
            slot: 1,
            eff_speed: 0,
            is_alive: false,
        },
    ];

    if let Some(p) = battle.p1.active.get(0) {
        if p.hp.into_inner() > 0 {
            slots[0].is_alive = true;
            slots[0].eff_speed = get_effective_speed(battle, p, ignore_speed_control);
        }
    }
    if let Some(p) = battle.p1.active.get(1) {
        if p.hp.into_inner() > 0 {
            slots[1].is_alive = true;
            slots[1].eff_speed = get_effective_speed(battle, p, ignore_speed_control);
        }
    }
    if let Some(p) = battle.p2.active.get(0) {
        if p.hp.into_inner() > 0 {
            slots[2].is_alive = true;
            slots[2].eff_speed = get_effective_speed(battle, p, ignore_speed_control);
        }
    }
    if let Some(p) = battle.p2.active.get(1) {
        if p.hp.into_inner() > 0 {
            slots[3].is_alive = true;
            slots[3].eff_speed = get_effective_speed(battle, p, ignore_speed_control);
        }
    }

    // Sort order: if trick room, slower acts first (ascending). Otherwise faster acts first (descending).
    slots.sort_by(|a, b| {
        if a.is_alive != b.is_alive {
            return b.is_alive.cmp(&a.is_alive);
        }
        if is_trick_room {
            a.eff_speed.cmp(&b.eff_speed)
        } else {
            b.eff_speed.cmp(&a.eff_speed)
        }
    });

    let dmg_eval = DamageEvaluator::new(battle);
    let mut counter_damage_on_foe = [[0.0f64; 2]; 2];
    let mut redirected_foes: Vec<(u8, usize, f64)> = Vec::new();

    // Pre-pass: Detect if an active Pokemon with Follow Me / Rage Powder redirects an enemy's single-target threat
    for p in 1..=2u8 {
        let (actives, foe_actives) = if p == 1 {
            (&battle.p1.active, &battle.p2.active)
        } else {
            (&battle.p2.active, &battle.p1.active)
        };

        if actives.len() < 2 {
            continue;
        }
        let p0 = &actives[0];
        let p1 = &actives[1];
        if p0.hp.into_inner() == 0 || p1.hp.into_inner() == 0 {
            continue;
        }

        for r_slot in 0..2 {
            let redirector = &actives[r_slot];
            let ally = &actives[1 - r_slot];

            let has_follow_me = redirector.moves.iter().any(|m| m.as_str() == "followme");
            let has_rage_powder = redirector.moves.iter().any(|m| m.as_str() == "ragepowder");
            let can_act = redirector.status.as_ref().map(|s| s.as_ref()) != Some("slp")
                && redirector.status.as_ref().map(|s| s.as_ref()) != Some("frz")
                && redirector.taunt_turns == 0;

            if (!has_follow_me && !has_rage_powder) || !can_act {
                continue;
            }

            let ally_cur_hp = ally.hp.into_inner();
            let ally_spe = get_effective_speed(battle, ally, ignore_speed_control);

            for (f_slot, foe) in foe_actives.iter().enumerate() {
                if foe.hp.into_inner() == 0 {
                    continue;
                }
                let foe_spe = get_effective_speed(battle, foe, ignore_speed_control);
                let foe_faster = if is_trick_room {
                    foe_spe <= ally_spe
                } else {
                    foe_spe >= ally_spe
                };
                if !foe_faster {
                    continue;
                }

                // Check powder immunity
                if !has_follow_me && has_rage_powder {
                    let foe_types = foe.get_types();
                    let is_grass = foe_types.contains(&Type::Grass);
                    let has_overcoat = foe.ability.as_ref().map(|a| a.as_str()) == Some("overcoat");
                    let has_goggles =
                        foe.item.as_ref().map(|i| i.as_ref()) == Some("safetygoggles");
                    if is_grass || has_overcoat || has_goggles {
                        continue;
                    }
                }

                // Check ignoring abilities/moves
                let foe_ability = foe.ability.as_ref().map(|a| a.as_str());
                if matches!(foe_ability, Some("stalwart") | Some("propellertail")) {
                    continue;
                }

                // Find foe's most threatening single-target move to ally
                let mut best_threat_m = "";
                let mut best_threat_dmg = 0;

                for m in &foe.moves {
                    let meta = match pkmn_meta::move_meta::get_move_meta(m) {
                        Some(meta) if *meta.category() != Category::Status => meta,
                        _ => continue,
                    };
                    let is_spread = matches!(
                        meta.range(),
                        pkmn_meta::types::Range::AllOpponents | pkmn_meta::types::Range::AllPokemon
                    );
                    if is_spread || m.as_str() == "snipeshot" {
                        continue;
                    }
                    let prio = *meta.priority();
                    if prio > 2 {
                        continue;
                    }

                    let (min_d, max_d) = dmg_eval.evaluate_range(
                        m,
                        3 - p,
                        f_slot as u8,
                        p,
                        (1 - r_slot) as u8,
                        false,
                    );
                    let exp_d = (min_d + max_d) / 2;
                    if exp_d > best_threat_dmg {
                        best_threat_dmg = exp_d;
                        best_threat_m = m.as_str();
                    }
                }

                if !best_threat_m.is_empty()
                    && (best_threat_dmg as f64 / ally_cur_hp as f64) >= 0.35
                {
                    let (red_min, red_max) = dmg_eval.evaluate_range(
                        best_threat_m,
                        3 - p,
                        f_slot as u8,
                        p,
                        r_slot as u8,
                        false,
                    );
                    let red_exp = 0.5 * (red_min + red_max) as f64;
                    let d_redir = (red_exp / redirector.hp.into_inner() as f64).clamp(0.0, 2.0);
                    redirected_foes.push((3 - p, f_slot, d_redir));
                    break;
                }
            }
        }
    }

    for idx in 0..4 {
        let active = slots[idx];
        if !active.is_alive {
            continue;
        }

        let (target_p, partner_p, bench, _def_side) = if active.player == 1 {
            (
                battle.p1.active.get(active.slot),
                battle.p1.active.get(1 - active.slot),
                &battle.p1.team,
                &battle.p1,
            )
        } else {
            (
                battle.p2.active.get(active.slot),
                battle.p2.active.get(1 - active.slot),
                &battle.p2.team,
                &battle.p2,
            )
        };

        let target_p = match target_p {
            Some(p) if p.hp.into_inner() > 0 => p,
            _ => continue,
        };

        let stat_val_target = calculate_stat_value(target_p);
        let target_cur_hp = target_p.hp.into_inner();

        // 3.1 脅威の特定: 自分より先に行動する敵 i (0..idx) からの最大打点技 m*
        let mut max_ko_prob = 0.0;
        let mut max_chip_rate = 0.0;
        let mut most_threatening_is_spread = false;
        let mut foe_source_slot: Option<ActiveSlot> = None;
        let mut threat_move_id = "";

        for earlier_idx in 0..idx {
            let foe_slot = slots[earlier_idx];
            if !foe_slot.is_alive || foe_slot.player == active.player {
                continue;
            }

            // If this foe was already redirected to `active`, it dealt d_redirect damage to `active`
            let mut foe_redirect_d = None;
            for (fp, fs, d) in &redirected_foes {
                if *fp == foe_slot.player && *fs == foe_slot.slot {
                    foe_redirect_d = Some(*d);
                    break;
                }
            }
            if let Some(d) = foe_redirect_d {
                let ko_prob = if d >= 1.0 { 1.0 } else { 0.0 };
                let chip_rate = d.clamp(0.0, 1.0);
                if ko_prob > max_ko_prob || (ko_prob == max_ko_prob && chip_rate > max_chip_rate) {
                    max_ko_prob = ko_prob;
                    max_chip_rate = chip_rate;
                    most_threatening_is_spread = false;
                    foe_source_slot = Some(foe_slot);
                    threat_move_id = "redirected";
                }
                continue;
            }

            let foe_p = if foe_slot.player == 1 {
                battle.p1.active.get(foe_slot.slot)
            } else {
                battle.p2.active.get(foe_slot.slot)
            };
            let foe_p = match foe_p {
                Some(p) if p.hp.into_inner() > 0 => p,
                _ => continue,
            };

            for m in &foe_p.moves {
                let meta = match pkmn_meta::move_meta::get_move_meta(m) {
                    Some(meta) if *meta.category() != Category::Status => meta,
                    _ => continue,
                };

                let is_spread = matches!(
                    meta.range(),
                    pkmn_meta::types::Range::AllOpponents | pkmn_meta::types::Range::AllPokemon
                );

                let (min_dmg, max_dmg) = dmg_eval.evaluate_range(
                    m,
                    foe_slot.player,
                    foe_slot.slot as u8,
                    active.player,
                    active.slot as u8,
                    is_spread,
                );

                let exp_dmg = 0.5 * (min_dmg + max_dmg) as f64;
                let ko_prob = if min_dmg >= target_cur_hp {
                    1.0
                } else if max_dmg < target_cur_hp {
                    0.0
                } else {
                    let range = (max_dmg - min_dmg).max(1) as f64;
                    ((max_dmg - target_cur_hp) as f64 / range).clamp(0.0, 1.0)
                };
                let chip_rate = (exp_dmg / target_cur_hp as f64).clamp(0.0, 1.0);

                if ko_prob > max_ko_prob || (ko_prob == max_ko_prob && chip_rate > max_chip_rate) {
                    max_ko_prob = ko_prob;
                    max_chip_rate = chip_rate;
                    most_threatening_is_spread = is_spread;
                    foe_source_slot = Some(foe_slot);
                    threat_move_id = m.as_str();
                }
            }
        }

        // If not under threat, full board value is preserved
        if max_ko_prob <= 0.0 && max_chip_rate <= 0.0 {
            if active.player == 1 {
                out_board_values_p1[active.slot] = stat_val_target;
            } else {
                out_board_values_p2[active.slot] = stat_val_target;
            }
            continue;
        }

        let foe_act = foe_source_slot.unwrap();
        let foe_p = if foe_act.player == 1 {
            battle.p1.active.get(foe_act.slot).unwrap()
        } else {
            battle.p2.active.get(foe_act.slot).unwrap()
        };

        // -----------------------------------------------------------------
        // 3.2 交代による脱出可能性 (SwitchViability)
        // -----------------------------------------------------------------
        let mut best_switch_viability = 0.0;
        for bench_p in bench.iter().filter(|b| b.hp.into_inner() > 0) {
            let b_cur_hp = bench_p.hp.into_inner();
            let (b_min, b_max) = dmg_eval.evaluate_range_against_pokemon(
                threat_move_id,
                foe_act.player,
                foe_act.slot as u8,
                bench_p,
                most_threatening_is_spread,
            );
            let d_in = (0.5 * (b_min + b_max) as f64 / b_cur_hp as f64).clamp(0.0, 2.0);
            if d_in >= 1.0 {
                continue;
            }

            let r_after = 1.0 - d_in;
            let foe_spe = foe_act.eff_speed;
            let b_spe = get_effective_speed(battle, bench_p, ignore_speed_control);
            let foe_faster_next = if is_trick_room {
                foe_spe <= b_spe
            } else {
                foe_spe >= b_spe
            };

            let viability = if foe_faster_next {
                if r_after <= d_in { 0.0 } else { r_after }
            } else {
                r_after
            };

            let final_viability = if most_threatening_is_spread {
                viability * 0.7
            } else {
                viability
            };

            if final_viability > best_switch_viability {
                best_switch_viability = final_viability;
            }
        }
        let e_switch = 0.65 * best_switch_viability;

        // -----------------------------------------------------------------
        // 3.3 『まもる』による状況打開可能性 (ProtectMeaningfulness)
        // -----------------------------------------------------------------
        let has_protect = target_p.moves.iter().any(|m| {
            matches!(
                m.as_str(),
                "protect" | "detect" | "banefulbunker" | "kingsshield" | "spikyshield" | "silktrap"
            )
        });
        let last_used_protect = target_p.last_move_used.as_ref().is_some_and(|m| {
            matches!(
                m.as_str(),
                "protect" | "detect" | "banefulbunker" | "kingsshield" | "spikyshield" | "silktrap"
            )
        });
        let can_protect = has_protect && !last_used_protect;

        let mut e_protect = 0.0;
        if can_protect {
            // 条件A: 隣の相方による脅威排除・威力減衰 (R_partner)
            let mut r_partner: f64 = 0.0;
            if let Some(partner) = partner_p {
                if partner.hp.into_inner() > 0 {
                    let partner_slot = 1 - active.slot;
                    let partner_spe = slots
                        .iter()
                        .find(|s| s.is_alive && s.player == active.player && s.slot == partner_slot)
                        .map(|s| s.eff_speed)
                        .unwrap_or(0);
                    let partner_acts_before_foe = if is_trick_room {
                        partner_spe <= foe_act.eff_speed
                    } else {
                        partner_spe >= foe_act.eff_speed
                    };

                    let partner_survives = if partner_acts_before_foe {
                        true
                    } else {
                        let (f_to_p_min, f_to_p_max) = dmg_eval.evaluate_range(
                            threat_move_id,
                            foe_act.player,
                            foe_act.slot as u8,
                            active.player,
                            partner_slot as u8,
                            most_threatening_is_spread,
                        );
                        let f_to_p_exp = 0.5 * (f_to_p_min + f_to_p_max) as f64;
                        let p_cur_hp = partner.hp.into_inner() as f64;
                        (p_cur_hp - f_to_p_exp) / p_cur_hp > 0.25
                    };

                    if partner_survives {
                        let foe_cur_hp = foe_p.hp.into_inner();
                        for pm in &partner.moves {
                            let (p_min, p_max) = dmg_eval.evaluate_range(
                                pm,
                                active.player,
                                partner_slot as u8,
                                foe_act.player,
                                foe_act.slot as u8,
                                false,
                            );
                            let p_exp = 0.5 * (p_min + p_max) as f64;
                            let d_foe = (p_exp / foe_cur_hp as f64).clamp(0.0, 1.0);
                            let is_ko = p_min >= foe_cur_hp || p_exp >= foe_cur_hp as f64 * 0.95;
                            if is_ko {
                                r_partner = if partner_acts_before_foe { 1.0 } else { 0.95 };
                            } else if matches!(
                                threat_move_id,
                                "eruption" | "waterspout" | "dragonenergy"
                            ) && d_foe >= 0.25
                            {
                                r_partner = r_partner.max(0.85);
                            }

                            if r_partner > 0.0 {
                                let foe_p_idx = (foe_act.player - 1) as usize;
                                let foe_s_idx = foe_act.slot;
                                let chip = if is_ko { 1.0 } else { d_foe };
                                if chip > counter_damage_on_foe[foe_p_idx][foe_s_idx] {
                                    counter_damage_on_foe[foe_p_idx][foe_s_idx] = chip;
                                }
                                if is_ko {
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // 条件B: S操作（トリックルーム・相手追い風）のターン枯らし (R_stall)
            let mut r_stall = 0.0;
            let raw_target_spe = target_p.speed.apply_boost(target_p.boosts.spe).into_inner();
            let raw_foe_spe = foe_p.speed.apply_boost(foe_p.boosts.spe).into_inner();
            let faster_naturally = raw_target_spe > raw_foe_spe;

            let foe_side = if active.player == 1 {
                &battle.p2
            } else {
                &battle.p1
            };
            let foe_tailwind_rem = if foe_side.tailwind {
                foe_side.tailwind_turns
            } else {
                0
            };

            if is_trick_room && faster_naturally {
                let tr_rem = if battle.trick_room_turns_left > 0 {
                    battle.trick_room_turns_left
                } else {
                    3
                };
                if tr_rem == 1 {
                    r_stall = 1.0;
                } else if tr_rem == 2 {
                    r_stall = 0.20;
                } else {
                    r_stall = 0.0;
                }
            } else if foe_tailwind_rem > 0 && faster_naturally {
                if foe_tailwind_rem == 1 {
                    r_stall = 1.0;
                } else if foe_tailwind_rem == 2 {
                    r_stall = 0.20;
                } else {
                    r_stall = 0.0;
                }
            }

            // 条件C: 全体技に対する『ワイドガード』所持 (R_wide)
            let mut r_wide = 0.0;
            if most_threatening_is_spread {
                let self_has_wide = target_p.moves.iter().any(|m| m.as_str() == "wideguard");
                let partner_has_wide = partner_p.is_some_and(|p| {
                    p.hp.into_inner() > 0 && p.moves.iter().any(|m| m.as_str() == "wideguard")
                });
                if self_has_wide || partner_has_wide {
                    r_wide = 0.90;
                }
            }

            e_protect = 0.75 * r_partner.max(r_stall).max(r_wide);
        }

        // -----------------------------------------------------------------
        // 3.4 隣の『このゆびとまれ／いかりのこな』による吸寄せ成立解析 (RedirectionViability)
        // -----------------------------------------------------------------
        let mut e_redirect = 0.0;
        if let Some(partner) = partner_p {
            if partner.hp.into_inner() > 0 {
                let has_follow_me = partner.moves.iter().any(|m| m.as_str() == "followme");
                let has_rage_powder = partner.moves.iter().any(|m| m.as_str() == "ragepowder");
                let partner_can_act = partner.status.as_ref().map(|s| s.as_ref()) != Some("slp")
                    && partner.status.as_ref().map(|s| s.as_ref()) != Some("frz")
                    && partner.taunt_turns == 0;

                let mut can_redirect = (has_follow_me || has_rage_powder) && partner_can_act;

                // ① 全体技貫通
                if most_threatening_is_spread {
                    can_redirect = false;
                }

                // ① 粉無効貫通 (Rage Powder Immunity)
                if can_redirect && !has_follow_me && has_rage_powder {
                    let foe_types = foe_p.get_types();
                    let is_grass = foe_types.contains(&Type::Grass);
                    let has_overcoat =
                        foe_p.ability.as_ref().map(|a| a.as_str()) == Some("overcoat");
                    let has_safety_goggles =
                        foe_p.item.as_ref().map(|i| i.as_ref()) == Some("safetygoggles");
                    if is_grass || has_overcoat || has_safety_goggles {
                        can_redirect = false;
                    }
                }

                // ① 吸寄せ無視特性・技
                let foe_ability = foe_p.ability.as_ref().map(|a| a.as_str());
                if matches!(foe_ability, Some("stalwart") | Some("propellertail"))
                    || threat_move_id == "snipeshot"
                {
                    can_redirect = false;
                }

                // ① 優先度負け
                let threat_prio = pkmn_meta::move_meta::get_move_meta(threat_move_id)
                    .map(|m| *m.priority())
                    .unwrap_or(0);
                if threat_prio > 2 {
                    can_redirect = false;
                } else if threat_prio == 2 {
                    let partner_spe = slots
                        .iter()
                        .find(|s| {
                            s.is_alive && s.player == active.player && s.slot == (1 - active.slot)
                        })
                        .map(|s| s.eff_speed)
                        .unwrap_or(0);
                    let foe_faster = if is_trick_room {
                        foe_act.eff_speed <= partner_spe
                    } else {
                        foe_act.eff_speed >= partner_spe
                    };
                    if foe_faster {
                        can_redirect = false;
                    }
                }

                if can_redirect {
                    // ② 吸寄せ役（相方）の被ダメージ（代償）計算
                    let partner_slot = 1 - active.slot;
                    let partner_cur_hp = partner.hp.into_inner();
                    let (red_min, red_max) = dmg_eval.evaluate_range(
                        threat_move_id,
                        foe_act.player,
                        foe_act.slot as u8,
                        active.player,
                        partner_slot as u8,
                        false,
                    );
                    let red_exp = 0.5 * (red_min + red_max) as f64;
                    let d_redirect = (red_exp / partner_cur_hp as f64).clamp(0.0, 1.0);

                    // ③ 守られたポケモン j の行動リターン
                    let mut r_attack = 0.0;
                    let foe_side_active = if active.player == 1 {
                        &battle.p2.active
                    } else {
                        &battle.p1.active
                    };
                    for (e_slot, foe_target) in foe_side_active.iter().enumerate() {
                        if foe_target.hp.into_inner() <= 0 {
                            continue;
                        }
                        let e_hp = foe_target.hp.into_inner();
                        for j_move in &target_p.moves {
                            let (j_min, j_max) = dmg_eval.evaluate_range(
                                j_move,
                                active.player,
                                active.slot as u8,
                                3 - active.player,
                                e_slot as u8,
                                false,
                            );
                            let j_exp = 0.5 * (j_min + j_max) as f64;
                            let ret = (j_exp / e_hp as f64).clamp(0.0, 1.0);
                            if ret > r_attack {
                                r_attack = ret;
                            }
                        }
                    }

                    let r_setup = if target_p.moves.iter().any(|m| {
                        matches!(
                            m.as_str(),
                            "trickroom"
                                | "tailwind"
                                | "swordsdance"
                                | "nastyplot"
                                | "calmmind"
                                | "quiverdance"
                        )
                    }) {
                        0.85
                    } else {
                        0.0
                    };

                    let r_action = r_attack.max(r_setup).max(0.50);

                    // ④ 吸寄せによる正味打開スコア
                    let stat_val_partner = calculate_stat_value(partner);
                    let cost_ratio = (stat_val_partner / stat_val_target.max(0.1)) * d_redirect;
                    if d_redirect < 1.0 {
                        e_redirect = (0.80 + 0.15 * r_action - 0.20 * cost_ratio).clamp(0.50, 0.95);
                    } else {
                        e_redirect = (r_action - 0.35 * cost_ratio).clamp(0.20, 0.90);
                    }
                    redirected_foes.push((foe_act.player, foe_act.slot, d_redirect));
                }
            }
        }

        // 3.5 実効脅威ディスカウントの統合適用
        let e_escape = e_switch.max(e_protect).max(e_redirect);
        let threat_discount = if max_ko_prob > 0.0 {
            max_ko_prob * (1.0 - e_escape)
        } else {
            0.35 * max_chip_rate * (1.0 - e_escape)
        };

        let board_val = stat_val_target * (1.0 - threat_discount.clamp(0.0, 1.0));
        if active.player == 1 {
            out_board_values_p1[active.slot] = board_val;
        } else {
            out_board_values_p2[active.slot] = board_val;
        }
    }

    // Apply counter-attack damage on foes
    for s in 0..2 {
        out_board_values_p1[s] *= (1.0 - counter_damage_on_foe[0][s]).max(0.0);
        out_board_values_p2[s] *= (1.0 - counter_damage_on_foe[1][s]).max(0.0);
    }
}

// =========================================================================
// Step 4 & 5: 総合盤面評価とシグモイド正規化
// =========================================================================
pub fn evaluate_state(battle: &Battle) -> f64 {
    match check_battle_result(battle) {
        BattleResult::Win(1) => 1.0,
        BattleResult::Win(_) => 0.0,
        BattleResult::Draw => 0.5,
        BattleResult::Ongoing => {
            // Step 3 actual execution
            let mut actual_bv_p1 = [0.0; 2];
            let mut actual_bv_p2 = [0.0; 2];
            resolve_board_threats(battle, false, &mut actual_bv_p1, &mut actual_bv_p2);

            let b_actual =
                (actual_bv_p1[0] + actual_bv_p1[1]) - (actual_bv_p2[0] + actual_bv_p2[1]);

            // Step 4 Counterfactual Speed Control Evaluation
            let has_speed_control = battle.trick_room || battle.p1.tailwind || battle.p2.tailwind;
            let speed_bonus = if has_speed_control {
                let mut base_bv_p1 = [0.0; 2];
                let mut base_bv_p2 = [0.0; 2];
                resolve_board_threats(battle, true, &mut base_bv_p1, &mut base_bv_p2);
                let b_base = (base_bv_p1[0] + base_bv_p1[1]) - (base_bv_p2[0] + base_bv_p2[1]);
                let delta_b_speed = b_actual - b_base;

                let mut t_future: i32 = 0;
                if battle.p1.tailwind {
                    t_future = t_future.max(battle.p1.tailwind_turns.saturating_sub(1) as i32);
                }
                if battle.p2.tailwind {
                    t_future = t_future.max(battle.p2.tailwind_turns.saturating_sub(1) as i32);
                }
                if battle.trick_room {
                    let tr_rem = if battle.trick_room_turns_left > 0 {
                        battle.trick_room_turns_left
                    } else {
                        3
                    };
                    t_future = t_future.max(tr_rem.saturating_sub(1) as i32);
                }

                const LAMBDA: f64 = 0.55;
                let mut discount_sum = 0.0;
                let mut current_lambda = LAMBDA;
                for _ in 1..=t_future {
                    discount_sum += current_lambda;
                    current_lambda *= LAMBDA;
                }
                delta_b_speed * discount_sum
            } else {
                0.0
            };

            // Step 5 Logit Aggregation
            let mut e_p1 = actual_bv_p1[0] + actual_bv_p1[1];
            for b in &battle.p1.team {
                e_p1 += calculate_stat_value(b);
            }

            let mut e_p2 = actual_bv_p2[0] + actual_bv_p2[1];
            for b in &battle.p2.team {
                e_p2 += calculate_stat_value(b);
            }

            let delta_e = (e_p1 - e_p2) + speed_bonus;
            const K: f64 = 1.4;
            let score = 1.0 / (1.0 + (-K * delta_e).exp());
            score.clamp(0.01, 0.99)
        }
    }
}

/// Evaluates the current state from the specified player's perspective (1 or 2).
pub fn evaluate_for_player(battle: &Battle, player: u8) -> f64 {
    let p1_score = evaluate_state(battle);
    if player == 1 {
        p1_score
    } else {
        1.0 - p1_score
    }
}
