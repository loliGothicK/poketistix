use crate::sim::abilities::on_start;
use crate::sim::battle::{Battle, Stat};
use crate::sim::log::{BattleLog, BattleLogEvent};
use crate::sim::pokemon::PokemonIdent;
use pkmn_meta::types::*;

pub fn run_switch_in(battle: &mut Battle, player: u8, slot: usize) {
    if let Some(p) = battle.get_pokemon_mut(PokemonIdent { player, slot }) {
        p.libero_activated = false;
    }
    trigger_switch_in_ability(battle, player, slot);
    crate::sim::items::check_terrain_seeds(battle);
}

pub fn trigger_switch_in_ability(battle: &mut Battle, player: u8, slot: usize) {
    let ability = if player == 1 {
        battle.p1.active.get(slot).and_then(|p| p.ability.clone())
    } else {
        battle.p2.active.get(slot).and_then(|p| p.ability.clone())
    };

    let item = if player == 1 {
        battle.p1.active.get(slot).and_then(|p| p.item)
    } else {
        battle.p2.active.get(slot).and_then(|p| p.item)
    };

    if let Some(ability_id) = ability.as_ref() {
        if ability_id.as_str() == "imposter" {
            let user_ident = PokemonIdent { player, slot };
            let opp_player = if player == 1 { 2 } else { 1 };
            let target_ident = PokemonIdent {
                player: opp_player,
                slot,
            };
            crate::sim::sections::transform::section_transform(battle, user_ident, target_ident);
            return;
        }
        on_start(ability_id.as_ref(), battle, PokemonIdent { player, slot });
    }

    if let Some(meta) = ability
        .as_ref()
        .map(|a| a.as_ref())
        .and_then(pkmn_meta::ability_meta::get_ability_meta)
    {
        if let Some(w) = meta.on_start_weather()
            && battle.weather != Some(*w)
        {
            battle.weather = Some(*w);
            if (*w == Weather::Rain && item == Some(ItemId::DampRock))
                || (*w == Weather::HashSunlight && item == Some(ItemId::HeatRock))
                || (*w == Weather::Sandstorm && item == Some(ItemId::SmoothRock))
                || (*w == Weather::Snow && item == Some(ItemId::IcyRock))
            {
                battle.weather_turns_left = 8;
            } else {
                battle.weather_turns_left = 5;
            }
            // Emit log
            let log_weather = if *w == Weather::Snow {
                "Snowscape"
            } else {
                w.as_ref()
            };
            battle
                .log
                .push(BattleLogEvent::new(BattleLog::WeatherChange {
                    weather: log_weather.to_string(),
                    is_start: true,
                }));
            battle.update_forecast();
        }
        if let Some(t) = meta.on_start_terrain()
            && battle.terrain != Some(*t)
        {
            battle.terrain = Some(*t);
            if item == Some(ItemId::TerrainExtender) {
                battle.terrain_turns_left = 8;
            } else {
                battle.terrain_turns_left = 5;
            }
            battle
                .log
                .push(BattleLogEvent::new(BattleLog::TerrainChange {
                    terrain: t.as_ref().to_string() + "Terrain",
                    is_start: true,
                }));
            battle.update_mimicry();
            crate::sim::items::check_terrain_seeds(battle);
        }
        if let Some(drop) = meta.on_start_stat_drop_foe().as_ref() {
            let targets = if player == 1 {
                (0..std::cmp::min(2, battle.p2.active.len())).collect::<Vec<_>>()
            } else {
                (0..std::cmp::min(2, battle.p1.active.len())).collect::<Vec<_>>()
            };

            let mut drops = Vec::new();
            if drop.atk.into_inner() != 0 {
                drops.push((Stat::Atk, drop.atk.into_inner()));
            }
            if drop.def.into_inner() != 0 {
                drops.push((Stat::Def, drop.def.into_inner()));
            }
            if drop.spa.into_inner() != 0 {
                drops.push((Stat::Spa, drop.spa.into_inner()));
            }
            if drop.spd.into_inner() != 0 {
                drops.push((Stat::Spd, drop.spd.into_inner()));
            }
            if drop.spe.into_inner() != 0 {
                drops.push((Stat::Spe, drop.spe.into_inner()));
            }
            if drop.accuracy.into_inner() != 0 {
                drops.push((Stat::Accuracy, drop.accuracy.into_inner()));
            }
            if drop.evasion.into_inner() != 0 {
                drops.push((Stat::Evasion, drop.evasion.into_inner()));
            }

            if !drops.is_empty() {
                for t_slot in targets {
                    let target_player = if player == 1 { 2 } else { 1 };
                    let hp = if target_player == 1 {
                        battle
                            .p1
                            .active
                            .get(t_slot)
                            .map(|p| p.hp.into_inner())
                            .unwrap_or(0)
                    } else {
                        battle
                            .p2
                            .active
                            .get(t_slot)
                            .map(|p| p.hp.into_inner())
                            .unwrap_or(0)
                    };

                    if hp > 0 {
                        battle.apply_stat_change(
                            target_player,
                            t_slot,
                            drops.clone(),
                            player,
                            ability.as_ref().map(|a| a.as_ref()),
                        );
                    }
                }
            }
        }
        if let Some(boost) = meta.on_start_stat_boost_self().as_ref() {
            let mut boosts = Vec::new();
            if boost.atk.into_inner() != 0 {
                boosts.push((Stat::Atk, boost.atk.into_inner()));
            }
            if boost.def.into_inner() != 0 {
                boosts.push((Stat::Def, boost.def.into_inner()));
            }
            if boost.spa.into_inner() != 0 {
                boosts.push((Stat::Spa, boost.spa.into_inner()));
            }
            if boost.spd.into_inner() != 0 {
                boosts.push((Stat::Spd, boost.spd.into_inner()));
            }
            if boost.spe.into_inner() != 0 {
                boosts.push((Stat::Spe, boost.spe.into_inner()));
            }
            if boost.accuracy.into_inner() != 0 {
                boosts.push((Stat::Accuracy, boost.accuracy.into_inner()));
            }
            if boost.evasion.into_inner() != 0 {
                boosts.push((Stat::Evasion, boost.evasion.into_inner()));
            }

            if !boosts.is_empty() {
                battle.apply_stat_change(
                    player,
                    slot,
                    boosts,
                    player,
                    ability.as_ref().map(|a| a.as_ref()),
                );
            }
        }
        if ability.as_ref().map(|a| a.as_str()) == Some("hospitality") {
            let ally_ident = PokemonIdent {
                player,
                slot: 1 - slot,
            };
            if let Some(ally) = battle.get_pokemon(ally_ident)
                && ally.hp.into_inner() > 0
                && ally.hp < ally.maxhp
            {
                let heal_amount = std::cmp::max(1, ally.maxhp.into_inner() / 4);
                battle.section_heal(ally_ident, heal_amount.into());
            }
        }
        if ability.as_ref().map(|a| a.as_str()) == Some("immunity") {
            let ident = PokemonIdent { player, slot };
            if let Some(p) = battle.get_pokemon(ident)
                && (p.status == Some(Status::Poison) || p.status == Some(Status::Toxic))
            {
                battle.section_cure_status(ident);
            }
        }
        if ability.as_ref().map(|a| a.as_str()) == Some("limber") {
            let ident = PokemonIdent { player, slot };
            if let Some(p) = battle.get_pokemon(ident)
                && p.status == Some(Status::Paralysis)
            {
                battle.section_cure_status(ident);
            }
        }
        if ability.as_ref().map(|a| a.as_str()) == Some("magmaarmor") {
            let ident = PokemonIdent { player, slot };
            if let Some(p) = battle.get_pokemon(ident)
                && p.status == Some(Status::Frozen)
            {
                battle.section_cure_status(ident);
            }
        }
        if matches!(
            ability.as_ref().map(|a| a.as_str()),
            Some("waterveil") | Some("waterbubble")
        ) {
            let ident = PokemonIdent { player, slot };
            if let Some(p) = battle.get_pokemon(ident)
                && p.status == Some(Status::Burn)
            {
                battle.section_cure_status(ident);
            }
        }
        if matches!(
            ability.as_ref().map(|a| a.as_str()),
            Some("insomnia") | Some("vitalspirit")
        ) {
            let ident = PokemonIdent { player, slot };
            if let Some(p) = battle.get_pokemon(ident)
                && p.status == Some(Status::Sleep)
            {
                battle.section_cure_status(ident);
            }
        }
        battle.update_forecast();
        battle.update_mimicry();
    }
}
