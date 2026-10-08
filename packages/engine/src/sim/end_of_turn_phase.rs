use crate::sim::battle::{Battle, EventContext, EventId, PokemonIdent, Stat};
use crate::sim::log::{BattleLog, BattleLogEvent};
use crate::sim::turn_order::TurnOrderResolver;
use pkmn_meta::types::*;
use rand::RngExt;

pub struct EndOfTurnPhase;

impl EndOfTurnPhase {
    fn is_magic_guard(p: &crate::sim::pokemon::Pokemon) -> bool {
        p.ability
            .as_ref()
            .map(|a| a.as_ref())
            .and_then(pkmn_meta::ability_meta::get_ability_meta)
            .is_some_and(|meta| *meta.is_magic_guard())
    }

    /// Deal fixed end-of-turn damage (clamped at 0 HP) and log it.
    fn apply_residual_damage(
        battle: &mut Battle,
        ident: PokemonIdent,
        damage: i32,
        from_effect: Option<&str>,
    ) {
        if let Some(p) = battle.get_pokemon_mut(ident) {
            p.hp = (p.hp.into_inner() - damage).max(0).into();
        }
        battle.log.push(crate::sim::log::BattleLogEvent::new(
            crate::sim::log::BattleLog::Damage {
                target: ident,
                damage,
                is_crit: false,
                effectiveness: 0,
                absorbed: false,
                from_effect: from_effect.map(str::to_string),
            },
        ));
    }

    /// 1/16 max HP heal (Big Root boosted) for pokemon holding the given volatile status.
    fn heal_for_volatile(battle: &mut Battle, status: VolatileStatus) {
        for ident in Self::get_speed_ordered_active_pokemon(battle) {
            if let Some(p) = battle.get_pokemon(ident)
                && p.hp.into_inner() > 0
                && p.volatile_status.contains(&status)
                && p.hp < p.maxhp
            {
                let base_heal = p.maxhp.into_inner() / 16;
                let heal_amount = if p.item.as_ref().map(|i| i.as_ref()) == Some("big-root") {
                    damage_calc::poke_round_div_4096(base_heal as u64 * damage_calc::MOD_1_3 as u64)
                        as i32
                } else {
                    base_heal
                };
                battle.section_heal(ident, std::cmp::max(1, heal_amount).into());
            }
        }
    }

    /// Collect active pokemons sorted by speed (accounting for Trick Room).
    /// If trick_room is true, slower pokemon resolve first.
    pub fn get_speed_ordered_active_pokemon(battle: &Battle) -> Vec<PokemonIdent> {
        let turn_order_resolver = TurnOrderResolver::new(battle);
        let mut active = Vec::new();

        for (i, p) in battle.p1.active.iter().enumerate() {
            if p.hp.into_inner() > 0 {
                let speed = turn_order_resolver
                    .check_speed_modifiers(p, p.speed)
                    .into_inner();
                active.push((speed, PokemonIdent { player: 1, slot: i }));
            }
        }
        for (i, p) in battle.p2.active.iter().enumerate() {
            if p.hp.into_inner() > 0 {
                let speed = turn_order_resolver
                    .check_speed_modifiers(p, p.speed)
                    .into_inner();
                active.push((speed, PokemonIdent { player: 2, slot: i }));
            }
        }

        let is_trick_room = battle.trick_room;
        active.sort_by(|a, b| {
            if a.0 != b.0 {
                if is_trick_room {
                    a.0.cmp(&b.0)
                } else {
                    b.0.cmp(&a.0)
                }
            } else {
                std::cmp::Ordering::Equal
            }
        });

        active.into_iter().map(|(_, ident)| ident).collect()
    }

    pub fn execute(battle: &mut Battle) {
        // Clear single-turn volatile statuses that end at end of turn (protect, flinch, etc.)
        for p in battle
            .p1
            .active
            .iter_mut()
            .chain(battle.p2.active.iter_mut())
        {
            p.volatile_status.retain(|s| {
                s.as_ref() != "protect"
                    && s.as_ref() != "flinch"
                    && s.as_ref() != "electrify"
                    && s.as_ref() != "helpinghand"
            });
        }

        // =========================================================================
        // Step 1: てんきの効果 (Weather effects)
        // a. 天候の終了
        // b. すなあらしダメージ
        // c. かんそうはだ、あめうけざら、アイスボディ等 (EndOfTurn event handles some abilities/items)
        // =========================================================================
        if battle.weather_turns_left > 0 {
            battle.weather_turns_left -= 1;
            if battle.weather_turns_left == 0 {
                battle.weather = None;
                battle.update_forecast();
                battle.log.push(crate::sim::log::BattleLogEvent::new(
                    crate::sim::log::BattleLog::WeatherChange {
                        weather: "none".to_string(),
                        is_start: false,
                    },
                ));
            } else if let Some(w) = &battle.weather {
                let log_w = if *w == Weather::Snow {
                    "Snowscape".to_string()
                } else {
                    w.to_string()
                };
                battle.log.push(crate::sim::log::BattleLogEvent::new(
                    crate::sim::log::BattleLog::WeatherChange {
                        weather: log_w,
                        is_start: false,
                    },
                ));
            }
        }

        let active_weather = battle.get_active_weather();
        if active_weather == Some(Weather::Sandstorm) {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                if let Some(p) = battle.get_pokemon(ident) {
                    if p.hp.into_inner() == 0 {
                        continue;
                    }
                    let mut is_immune = p.type1 == Type::Rock
                        || p.type1 == Type::Ground
                        || p.type1 == Type::Steel
                        || p.type2 == Some(Type::Rock)
                        || p.type2 == Some(Type::Ground)
                        || p.type2 == Some(Type::Steel);

                    if let Some(meta) = p
                        .ability
                        .as_ref()
                        .map(|a| a.as_ref())
                        .and_then(pkmn_meta::ability_meta::get_ability_meta)
                        && *meta.is_magic_guard()
                    {
                        is_immune = true;
                    }
                    if p.ability.as_ref().map(|a| a.as_ref()) == Some("sandveil")
                        || p.ability.as_ref().map(|a| a.as_ref()) == Some("sandrush")
                        || p.ability.as_ref().map(|a| a.as_ref()) == Some("sandforce")
                        || p.ability.as_ref().map(|a| a.as_ref()) == Some("overcoat")
                    {
                        is_immune = true;
                    }

                    if !is_immune {
                        let damage = std::cmp::max(1, p.maxhp.into_inner() / 16);
                        battle.section_take_damage(ident, damage);
                        battle.log.push(crate::sim::log::BattleLogEvent::new(
                            crate::sim::log::BattleLog::Damage {
                                target: ident,
                                damage,
                                is_crit: false,
                                effectiveness: 0,
                                absorbed: false,
                                from_effect: Some("Sandstorm".to_string()),
                            },
                        ));
                    }
                }
            }
        } else if active_weather == Some(Weather::Rain)
            || active_weather == Some(Weather::HeavyRain)
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let heal_info = battle.get_pokemon(ident).and_then(|p| {
                    if p.hp.into_inner() == 0 || p.hp >= p.maxhp {
                        return None;
                    }
                    let ab = p.ability.as_ref().map(|a| a.as_str());
                    if ab == Some("raindish") {
                        Some(std::cmp::max(1, p.maxhp.into_inner() / 16))
                    } else if ab == Some("dryskin") {
                        Some(std::cmp::max(1, p.maxhp.into_inner() / 8))
                    } else {
                        None
                    }
                });
                if let Some(heal) = heal_info {
                    battle.section_heal(ident, heal.into());
                }
            }
        } else if active_weather == Some(Weather::HashSunlight)
            || active_weather == Some(Weather::ExtremelyHarshSunlight)
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let dmg_info = battle.get_pokemon(ident).and_then(|p| {
                    if p.hp.into_inner() == 0 {
                        return None;
                    }
                    let ab = p.ability.as_ref().map(|a| a.as_str());
                    if ab == Some("dryskin") {
                        Some((std::cmp::max(1, p.maxhp.into_inner() / 8), "Dry Skin"))
                    } else if ab == Some("solarpower") {
                        Some((std::cmp::max(1, p.maxhp.into_inner() / 8), "Solar Power"))
                    } else {
                        None
                    }
                });
                if let Some((damage, effect_name)) = dmg_info {
                    battle.section_take_damage(ident, damage);
                    battle.log.push(crate::sim::log::BattleLogEvent::new(
                        crate::sim::log::BattleLog::Damage {
                            target: ident,
                            damage,
                            is_crit: false,
                            effectiveness: 0,
                            absorbed: false,
                            from_effect: Some(effect_name.to_string()),
                        },
                    ));
                }
            }
        } else if active_weather == Some(Weather::Snow) {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let heal_info = battle.get_pokemon(ident).and_then(|p| {
                    if p.hp.into_inner() == 0 || p.hp >= p.maxhp {
                        return None;
                    }
                    if p.ability.as_ref().map(|a| a.as_str()) == Some("icebody") {
                        Some(std::cmp::max(1, p.maxhp.into_inner() / 16))
                    } else {
                        None
                    }
                });
                if let Some(heal) = heal_info {
                    battle.section_heal(ident, heal.into());
                }
            }
        }

        // =========================================================================
        // Step 4: みらいよち / はめつのねがい (Future Sight / Doom Desire)
        // Handled at start of turn / pending queue in turn.rs
        // =========================================================================

        // =========================================================================
        // Step 6: イベントブロック (その1) (Event Block 1)
        // b. グラスフィールド (Grassy Terrain) 回復
        // c. だっぴ / うるおいボディ等
        // d. たべのこし / くろいヘドロ (Leftovers / Black Sludge via EndOfTurn event)
        // =========================================================================
        if battle.terrain == Some(Terrain::Grassy) {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                if let Some(p) = battle.get_pokemon(ident)
                    && p.hp.into_inner() > 0
                    && p.is_grounded()
                    && p.hp < p.maxhp
                {
                    let heal = std::cmp::max(1, p.maxhp.into_inner() / 16);
                    battle.section_heal(ident, heal.into());
                }
            }
        }

        // Trigger item/ability end-of-turn effects in Block 1 (Leftovers, Black Sludge, etc.)
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                if let Some(p) = battle.get_pokemon(ident)
                    && p.hp.into_inner() > 0
                {
                    let mut ctx = EventContext::builder().target(ident).build();
                    battle.trigger_event(EventId::EndOfTurn, &mut ctx);
                }
            }
        }

        // =========================================================================
        // Step 6.c: うるおいボディ (Hydration)
        // =========================================================================
        {
            let is_rain =
                battle.weather == Some(Weather::Rain) || battle.weather == Some(Weather::HeavyRain);
            if is_rain {
                let ordered = Self::get_speed_ordered_active_pokemon(battle);
                for ident in ordered {
                    let mut cured = false;
                    if let Some(p) = battle.get_pokemon(ident)
                        && p.hp.into_inner() > 0
                        && p.ability.as_ref().map(|a| a.as_str()) == Some("hydration")
                        && p.status.is_some()
                    {
                        cured = true;
                    }
                    if cured {
                        battle.log.push(BattleLogEvent::new(BattleLog::Activate {
                            target: ident,
                            effect: "ability: Hydration".to_string(),
                        }));
                        battle.section_cure_status(ident);
                    }
                }
            }
        }

        // =========================================================================
        // Step 6.c.2: だっぴ (Shed Skin)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let mut cured = false;
                if let Some(p) = battle.get_pokemon(ident)
                    && p.hp.into_inner() > 0
                    && p.ability.as_ref().map(|a| a.as_str()) == Some("shedskin")
                    && p.status.is_some()
                {
                    let trigger = if let Some(config) = &battle.rng_config
                        && let Some(sec_config) = &config.secondary
                    {
                        match sec_config.as_str() {
                            "always" => true,
                            "never" => false,
                            _ => true,
                        }
                    } else {
                        rand::rng().random_range(1..=100) <= 33
                    };
                    if trigger {
                        cured = true;
                    }
                }
                if cured {
                    battle.log.push(BattleLogEvent::new(BattleLog::Activate {
                        target: ident,
                        effect: "ability: Shed Skin".to_string(),
                    }));
                    battle.section_cure_status(ident);
                }
            }
        }

        // =========================================================================
        // Step 8: アクアリング (Aqua Ring)
        // =========================================================================
        Self::heal_for_volatile(battle, VolatileStatus::Aquaring);

        // =========================================================================
        // Step 9: ねをはる (Ingrain)
        // =========================================================================
        Self::heal_for_volatile(battle, VolatileStatus::Ingrain);

        // =========================================================================
        // Step 10: やどりぎのタネ (Leech Seed)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let leech_seed_source = battle.get_pokemon(ident).and_then(|p| {
                    p.volatile_status
                        .contains(&VolatileStatus::Leechseed)
                        .then_some(p.leech_seeded_by)
                        .flatten()
                });
                if let Some(source) = leech_seed_source
                    && let Some(p) = battle.get_pokemon(ident)
                    && p.hp.into_inner() > 0
                {
                    let damage = std::cmp::max(1, p.maxhp.into_inner() / 8);
                    battle.section_take_damage(ident, damage);
                    battle.log.push(crate::sim::log::BattleLogEvent::new(
                        crate::sim::log::BattleLog::Damage {
                            target: ident,
                            damage,
                            is_crit: false,
                            effectiveness: 0,
                            absorbed: false,
                            from_effect: Some("Leech Seed".to_string()),
                        },
                    ));
                    let source_item = battle.get_pokemon(source).and_then(|p| p.item);
                    let heal_amount = if source_item == Some(ItemId::BigRoot) {
                        ((damage * 5324) / 4096).max(1)
                    } else {
                        damage
                    };

                    let is_ooze = battle
                        .get_pokemon(ident)
                        .and_then(|p| p.ability.as_ref())
                        .is_some_and(|a| a.as_str() == "liquidooze");

                    if is_ooze {
                        battle.section_take_damage(source, heal_amount);
                        battle.log.push(crate::sim::log::BattleLogEvent::new(
                            crate::sim::log::BattleLog::Damage {
                                target: source,
                                damage: heal_amount,
                                is_crit: false,
                                effectiveness: 0,
                                absorbed: false,
                                from_effect: Some("ability: Liquid Ooze".to_string()),
                            },
                        ));
                    } else {
                        battle.section_heal(source, heal_amount.into());
                    }
                }
            }
        }

        // =========================================================================
        // Step 11: どく / もうどく / ポイズンヒール (Poison / Toxic / Poison Heal)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let mut poison_damage = None;
                let mut poison_heal = None;
                if let Some(p) = battle.get_pokemon_mut(ident) {
                    if p.hp.into_inner() == 0 || Self::is_magic_guard(p) {
                        continue;
                    }

                    let has_poison_heal =
                        p.ability.as_ref().map(|a| a.as_str()) == Some("poisonheal");
                    if has_poison_heal
                        && (p.status == Some(Status::Toxic) || p.status == Some(Status::Poison))
                    {
                        poison_heal = Some(std::cmp::max(1, p.maxhp.into_inner() / 8));
                    } else if p.status == Some(Status::Toxic) {
                        p.tox_counter = (p.tox_counter + 1).min(15);
                        let base_dmg = std::cmp::max(1, p.maxhp.into_inner() / 16);
                        poison_damage = Some(base_dmg * p.tox_counter as i32);
                    } else if p.status == Some(Status::Poison) {
                        poison_damage = Some(std::cmp::max(1, p.maxhp.into_inner() / 8));
                    }
                }
                if let Some(heal) = poison_heal {
                    battle.section_heal(ident, heal.into());
                }
                if let Some(dmg) = poison_damage {
                    Self::apply_residual_damage(battle, ident, dmg, None);
                }
            }
        }

        // =========================================================================
        // Step 12: やけど (Burn)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let dmg = battle.get_pokemon(ident).and_then(|p| {
                    if p.hp.into_inner() == 0
                        || Self::is_magic_guard(p)
                        || p.status != Some(Status::Burn)
                    {
                        return None;
                    }
                    let is_heatproof = p.ability.as_ref().map(|a| a.as_str()) == Some("heatproof");
                    let divisor = if is_heatproof { 32 } else { 16 };
                    Some(std::cmp::max(1, p.maxhp.into_inner() / divisor))
                });
                if let Some(dmg) = dmg {
                    Self::apply_residual_damage(battle, ident, dmg, None);
                }
            }
        }

        // =========================================================================
        // Step 14: のろい (Curse)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let damage = battle.get_pokemon(ident).and_then(|p| {
                    if p.hp.into_inner() == 0
                        || Self::is_magic_guard(p)
                        || !p.volatile_status.contains(&VolatileStatus::Curse)
                    {
                        return None;
                    }
                    Some(std::cmp::max(1, p.maxhp.into_inner() / 4))
                });
                if let Some(damage) = damage {
                    Self::apply_residual_damage(battle, ident, damage, Some("Curse"));
                }
            }
        }

        // =========================================================================
        // Step 15: バインド (Partially Trapped / Bind / Fire Spin etc.)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let mut source_item = None;
                if let Some(p) = battle.get_pokemon(ident)
                    && let Some(source_ident) = p.partially_trapped_by
                    && let Some(source_p) = battle.get_pokemon(source_ident)
                {
                    source_item = source_p.item;
                }

                let mut bind_damage = None;
                if let Some(p) = battle.get_pokemon_mut(ident) {
                    if p.hp.into_inner() == 0 {
                        continue;
                    }
                    let is_magic_guard = Self::is_magic_guard(p);

                    if p.volatile_status
                        .contains(&VolatileStatus::Partiallytrapped)
                    {
                        if p.partially_trapped_turns > 0 {
                            p.partially_trapped_turns -= 1;
                        }

                        if p.partially_trapped_turns == 0 {
                            p.volatile_status
                                .retain(|v| v != &VolatileStatus::Partiallytrapped);
                            p.partially_trapped_by = None;
                            battle.log.push(crate::sim::log::BattleLogEvent::new(
                                crate::sim::log::BattleLog::VolatileStatusEnd {
                                    target: ident,
                                    volatile_status: "partiallytrapped".to_string(),
                                },
                            ));
                        } else if !is_magic_guard {
                            let divisor = if source_item == Some(ItemId::BindingBand) {
                                6
                            } else {
                                8
                            };
                            bind_damage = Some(std::cmp::max(1, p.maxhp.into_inner() / divisor));
                        }
                    }
                }
                if let Some(damage) = bind_damage {
                    Self::apply_residual_damage(battle, ident, damage, None);
                }
            }
        }

        // =========================================================================
        // Step 16: たこがため (Octolock)
        // Def and SpD drop by 1 stage
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                if let Some(p) = battle.get_pokemon(ident)
                    && p.hp.into_inner() > 0
                    && p.volatile_status.contains(&VolatileStatus::Octolock)
                {
                    battle.apply_stat_change(
                        ident.player,
                        ident.slot,
                        vec![(Stat::Def, -1), (Stat::Spd, -1)],
                        ident.player,
                        Some("Octolock"),
                    );
                }
            }
        }

        // =========================================================================
        // Step 16.5: みずあめボム (Syrup Bomb)
        // Drops Speed by 1 stage; lasts 3 turns
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let source_opt = if let Some(p) = battle.get_pokemon_mut(ident)
                    && p.hp.into_inner() > 0
                    && p.volatile_status.contains(&VolatileStatus::Syrupbomb)
                {
                    if p.syrup_bomb_turns > 0 {
                        p.syrup_bomb_turns -= 1;
                    }
                    let is_active = p.syrup_bomb_turns > 0;
                    let source = p.syrup_bomb_source;
                    if !is_active {
                        p.volatile_status
                            .retain(|v| v != &VolatileStatus::Syrupbomb);
                    }
                    Some(source)
                } else {
                    None
                };

                if let Some(source) = source_opt {
                    let source_player = source.map(|s| s.player).unwrap_or(ident.player);
                    battle.apply_stat_change(
                        ident.player,
                        ident.slot,
                        vec![(Stat::Spe, -1)],
                        source_player,
                        Some("Syrup Bomb"),
                    );
                }
            }
        }

        // =========================================================================
        // Step 17: しおづけ (Salt Cure)
        // 1/8 damage, or 1/4 if Water or Steel type
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let damage = battle.get_pokemon(ident).and_then(|p| {
                    if p.hp.into_inner() == 0
                        || Self::is_magic_guard(p)
                        || !p.volatile_status.contains(&VolatileStatus::Saltcure)
                    {
                        return None;
                    }
                    let is_water_or_steel = [Some(p.type1), p.type2, p.added_type]
                        .iter()
                        .any(|t| matches!(t, Some(Type::Water | Type::Steel)));
                    let divisor = if is_water_or_steel { 4 } else { 8 };
                    Some(std::cmp::max(1, p.maxhp.into_inner() / divisor))
                });
                if let Some(damage) = damage {
                    Self::apply_residual_damage(battle, ident, damage, Some("Salt Cure"));
                }
            }
        }

        // =========================================================================
        // Step 18: ちょうはつの終了 (Taunt end)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                if let Some(p) = battle.get_pokemon_mut(ident)
                    && p.volatile_status.contains(&VolatileStatus::Taunt)
                {
                    if p.taunt_turns > 0 {
                        p.taunt_turns -= 1;
                    }
                    if p.taunt_turns == 0 {
                        p.volatile_status.retain(|v| v != &VolatileStatus::Taunt);
                        battle.log.push(crate::sim::log::BattleLogEvent::new(
                            crate::sim::log::BattleLog::Text {
                                message: format!("|-end|{}|move: Taunt", ident),
                            },
                        ));
                    }
                }
            }
        }

        // =========================================================================
        // Step 20: アンコールの終了 (Encore end)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                if let Some(p) = battle.get_pokemon_mut(ident)
                    && p.volatile_status.contains(&VolatileStatus::Encore)
                {
                    if p.encore_turns > 0 {
                        p.encore_turns -= 1;
                    }
                    if p.encore_turns == 0 {
                        p.volatile_status.retain(|v| v != &VolatileStatus::Encore);
                        p.encored_move = None;
                        battle.log.push(crate::sim::log::BattleLogEvent::new(
                            crate::sim::log::BattleLog::VolatileStatusEnd {
                                target: ident,
                                volatile_status: "Encore".to_string(),
                            },
                        ));
                    }
                }
            }
        }

        // =========================================================================
        // Step 21: かなしばりの終了 (Disable end)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                if let Some(p) = battle.get_pokemon_mut(ident)
                    && p.volatile_status.contains(&VolatileStatus::Disable)
                {
                    if p.disable_turns > 0 {
                        p.disable_turns -= 1;
                    }
                    if p.disable_turns == 0 {
                        p.volatile_status.retain(|v| v != &VolatileStatus::Disable);
                        p.disabled_move = None;
                        battle.log.push(crate::sim::log::BattleLogEvent::new(
                            crate::sim::log::BattleLog::VolatileStatusEnd {
                                target: ident,
                                volatile_status: "Disable".to_string(),
                            },
                        ));
                    }
                }
            }
        }

        // =========================================================================
        // Step 22: でんじふゆうの終了 (Magnet Rise end)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                if let Some(p) = battle.get_pokemon_mut(ident)
                    && p.volatile_status.contains(&VolatileStatus::Magnetrise)
                {
                    if p.magnet_rise_turns > 0 {
                        p.magnet_rise_turns -= 1;
                    }
                    if p.magnet_rise_turns == 0 {
                        p.volatile_status
                            .retain(|v| v != &VolatileStatus::Magnetrise);
                        battle.log.push(crate::sim::log::BattleLogEvent::new(
                            crate::sim::log::BattleLog::VolatileStatusEnd {
                                target: ident,
                                volatile_status: "Magnet Rise".to_string(),
                            },
                        ));
                    }
                }
            }
        }

        // =========================================================================
        // Step 23: テレキネシスの終了 (Telekinesis end)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                if let Some(p) = battle.get_pokemon_mut(ident)
                    && p.volatile_status.contains(&VolatileStatus::Telekinesis)
                {
                    if p.telekinesis_turns > 0 {
                        p.telekinesis_turns -= 1;
                    }
                    if p.telekinesis_turns == 0 {
                        p.volatile_status
                            .retain(|v| v != &VolatileStatus::Telekinesis);
                        battle.log.push(crate::sim::log::BattleLogEvent::new(
                            crate::sim::log::BattleLog::VolatileStatusEnd {
                                target: ident,
                                volatile_status: "Telekinesis".to_string(),
                            },
                        ));
                    }
                }
            }
        }

        // =========================================================================
        // Step 26: ねむけ (Yawn / Drowsy)
        // Decrement yawn turns; if it hits 0, inflict Sleep status
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let should_fall_asleep = if let Some(p) = battle.get_pokemon_mut(ident) {
                    if p.hp.into_inner() > 0 && p.volatile_status.contains(&VolatileStatus::Yawn) {
                        if p.yawn_turns > 0 {
                            p.yawn_turns -= 1;
                        }
                        if p.yawn_turns == 0 {
                            p.volatile_status.retain(|v| v != &VolatileStatus::Yawn);
                            true
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                } else {
                    false
                };

                if should_fall_asleep {
                    battle.section_apply_status(ident, Status::Sleep, None);
                }
            }
        }

        // =========================================================================
        // Step 27: ほろびのうた (Perish Song)
        // Count decreases by 1; if it reaches 0, the pokemon faints
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let (has_perish, current) = if let Some(p) = battle.get_pokemon_mut(ident) {
                    if p.hp.into_inner() > 0
                        && p.volatile_status.contains(&VolatileStatus::Perishsong)
                    {
                        if p.perish_turns > 0 {
                            p.perish_turns -= 1;
                        }
                        let current = p.perish_turns;
                        if current == 0 {
                            p.volatile_status
                                .retain(|v| v != &VolatileStatus::Perishsong);
                            p.hp = 0.into();
                        }
                        (true, current)
                    } else {
                        (false, 0)
                    }
                } else {
                    (false, 0)
                };

                if has_perish {
                    battle.log.push(crate::sim::log::BattleLogEvent::new(
                        crate::sim::log::BattleLog::Text {
                            message: format!("|-start|{}|perish{}", ident, current),
                        },
                    ));
                    if current == 0 {
                        battle.log.push(crate::sim::log::BattleLogEvent::new(
                            crate::sim::log::BattleLog::Faint { target: ident },
                        ));
                    }
                }
            }
        }

        // =========================================================================
        // Step 28: はねやすめ終了 (Roost Flying type restore) & ひるみ解除
        // =========================================================================
        for p in battle
            .p1
            .active
            .iter_mut()
            .chain(battle.p2.active.iter_mut())
        {
            p.volatile_status
                .retain(|s| s != &VolatileStatus::Roost && s != &VolatileStatus::Flinch);
        }

        // =========================================================================
        // Step 28.5: はんすう (Cud Chew)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let mut should_activate = false;
                let mut eaten_berry = None;
                if let Some(p) = battle.get_pokemon_mut(ident)
                    && p.hp.into_inner() > 0
                    && p.cud_chew_berry.is_some()
                {
                    p.cud_chew_counter = p.cud_chew_counter.saturating_sub(1);
                    if p.cud_chew_counter == 0 {
                        eaten_berry = p.cud_chew_berry.take();
                        should_activate = true;
                    }
                }
                if should_activate && let Some(berry) = eaten_berry {
                    battle.log.push(BattleLogEvent::new(BattleLog::Activate {
                        target: ident,
                        effect: "ability: Cud Chew".to_string(),
                    }));
                    battle.log.push(BattleLogEvent::new(BattleLog::EndItem {
                        target: ident,
                        item: berry.to_string(),
                    }));
                    crate::sim::items::apply_berry_effect(battle, ident, berry.as_ref());
                }
            }
        }

        // =========================================================================
        // Step 28.6: しゅうかく (Harvest)
        // =========================================================================
        {
            let is_sun = battle.weather == Some(Weather::HashSunlight)
                || battle.weather == Some(Weather::ExtremelyHarshSunlight);
            let sec_config = battle.rng_config.as_ref().and_then(|c| c.secondary.clone());
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let mut restored_berry = None;
                if let Some(p) = battle.get_pokemon_mut(ident)
                    && p.hp.into_inner() > 0
                    && p.ability.as_ref().map(|a| a.as_str()) == Some("harvest")
                    && p.item.is_none()
                    && p.last_consumed_berry.is_some()
                {
                    let trigger = if is_sun {
                        true
                    } else if let Some(sec) = &sec_config {
                        match sec.as_str() {
                            "always" => true,
                            "never" => false,
                            _ => true,
                        }
                    } else {
                        rand::rng().random_range(1..=100) <= 50
                    };

                    if trigger {
                        restored_berry = p.last_consumed_berry;
                        p.item = restored_berry;
                    }
                }

                if let Some(berry) = restored_berry {
                    battle.log.push(BattleLogEvent::new(BattleLog::Text {
                        message: format!("|-item|{}|{}|[from] ability: Harvest", ident, berry),
                    }));
                }
            }
        }

        // =========================================================================
        // Step 28.7: いやしのこころ (Healer)
        // =========================================================================
        {
            let sec_config = battle.rng_config.as_ref().and_then(|c| c.secondary.clone());
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let mut cure_ally = None;
                if let Some(p) = battle.get_pokemon(ident)
                    && p.hp.into_inner() > 0
                    && p.ability.as_ref().map(|a| a.as_str()) == Some("healer")
                {
                    let ally_ident = PokemonIdent {
                        player: ident.player,
                        slot: 1 - ident.slot,
                    };
                    if let Some(ally) = battle.get_pokemon(ally_ident)
                        && ally.hp.into_inner() > 0
                        && ally.status.is_some()
                    {
                        let trigger = if let Some(sec) = &sec_config {
                            match sec.as_str() {
                                "always" => true,
                                "never" => false,
                                _ => true,
                            }
                        } else {
                            rand::rng().random_range(1..=100) <= 30
                        };

                        if trigger {
                            cure_ally = Some(ally_ident);
                        }
                    }
                }

                if let Some(ally_ident) = cure_ally {
                    battle.log.push(BattleLogEvent::new(BattleLog::Activate {
                        target: ident,
                        effect: "ability: Healer".to_string(),
                    }));
                    battle.section_cure_status(ally_ident);
                }
            }
        }

        // =========================================================================
        // Step 28.8: はらぺこスイッチ (Hunger Switch)
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                if let Some(p) = battle.get_pokemon_mut(ident)
                    && p.hp.into_inner() > 0
                    && p.ability.as_ref().map(|a| a.as_str()) == Some("hungerswitch")
                {
                    if p.species.contains("hangry") {
                        p.species = "morpeko-full-belly".to_string();
                        battle.log.push(BattleLogEvent::new(BattleLog::Text {
                            message: format!("|-formechange|{}|Morpeko", ident),
                        }));
                    } else {
                        p.species = "morpeko-hangry".to_string();
                        battle.log.push(BattleLogEvent::new(BattleLog::Text {
                            message: format!("|-formechange|{}|Morpeko-Hangry", ident),
                        }));
                    }
                }
            }
        }

        // =========================================================================
        // Step 28.9: ムラっけ (Moody) & Speed Boost
        // =========================================================================
        {
            let ordered = Self::get_speed_ordered_active_pokemon(battle);
            for ident in ordered {
                let has_moody = battle.get_pokemon(ident).is_some_and(|p| {
                    p.hp > 0 && p.ability.as_ref().map(|a| a.as_str()) == Some("moody")
                });
                if has_moody {
                    let boost_stat = Stat::Atk;
                    let drop_stat = Stat::Spe;
                    battle.apply_stat_change(
                        ident.player,
                        ident.slot,
                        vec![(boost_stat, 2)],
                        ident.player,
                        Some("moody"),
                    );
                    battle.apply_stat_change(
                        ident.player,
                        ident.slot,
                        vec![(drop_stat, -1)],
                        ident.player,
                        Some("moody"),
                    );
                }
                let has_speedboost = battle.get_pokemon(ident).is_some_and(|p| {
                    p.hp > 0 && p.ability.as_ref().map(|a| a.as_str()) == Some("speedboost")
                });
                if has_speedboost {
                    battle.apply_stat_change(
                        ident.player,
                        ident.slot,
                        vec![(Stat::Spe, 1)],
                        ident.player,
                        Some("speedboost"),
                    );
                }
            }
        }

        // =========================================================================
        // Step 30: 片側の場の状態の継続/終了 (Side conditions)
        // Tailwind, Reflect, Light Screen, Aurora Veil, Safeguard
        // =========================================================================
        let sides = [(1, &mut battle.p1), (2, &mut battle.p2)];
        for (player, side) in sides {
            if side.tailwind_turns > 0 {
                side.tailwind_turns -= 1;
                if side.tailwind_turns == 0 {
                    side.tailwind = false;
                    battle.log.push(crate::sim::log::BattleLogEvent::new(
                        crate::sim::log::BattleLog::SideEnd {
                            player,
                            effect: "Tailwind".to_string(),
                        },
                    ));
                }
            }
        }

        // =========================================================================
        // Step 31: 全体の場の状態の継続/終了 (Whole-field conditions)
        // Trick Room, Gravity, Wonder Room, Magic Room, Terrains, Fairy Lock
        // =========================================================================
        if battle.gravity_turns_left > 0 {
            battle.gravity_turns_left -= 1;
            if battle.gravity_turns_left == 0 {
                battle.log.push(crate::sim::log::BattleLogEvent::new(
                    crate::sim::log::BattleLog::Text {
                        message: "|-fieldend|move: Gravity".to_string(),
                    },
                ));
            }
        }

        if battle.magic_room_turns_left > 0 {
            battle.magic_room_turns_left -= 1;
            if battle.magic_room_turns_left == 0 {
                battle.log.push(crate::sim::log::BattleLogEvent::new(
                    crate::sim::log::BattleLog::Text {
                        message: "|-fieldend|move: Magic Room".to_string(),
                    },
                ));
            }
        }

        if battle.wonder_room_turns_left > 0 {
            battle.wonder_room_turns_left -= 1;
            if battle.wonder_room_turns_left == 0 {
                battle.log.push(crate::sim::log::BattleLogEvent::new(
                    crate::sim::log::BattleLog::Text {
                        message: "|-fieldend|move: Wonder Room".to_string(),
                    },
                ));
            }
        }

        if battle.terrain_turns_left > 0 {
            battle.terrain_turns_left -= 1;
            if battle.terrain_turns_left == 0 {
                let old_terrain = battle.terrain.take();
                if let Some(t) = old_terrain {
                    battle.log.push(crate::sim::log::BattleLogEvent::new(
                        crate::sim::log::BattleLog::TerrainChange {
                            terrain: t.as_ref().to_string() + "Terrain",
                            is_start: false,
                        },
                    ));
                    battle.update_mimicry();
                }
            }
        }

        if battle.fairy_lock_turns > 0 {
            battle.fairy_lock_turns -= 1;
            if battle.fairy_lock_turns == 0 {
                battle.log.push(crate::sim::log::BattleLogEvent::new(
                    crate::sim::log::BattleLog::Text {
                        message: "-fieldend|move: Fairy Lock".to_string(),
                    },
                ));
            }
        }
    }
}
