use crate::sim::battle::Battle;
use pkmn_meta::types::*;

pub fn get_active_weather(battle: &Battle) -> Option<Weather> {
    let has_weather_lock = battle
        .p1
        .active
        .iter()
        .chain(battle.p2.active.iter())
        .any(|p| {
            if p.hp.into_inner() == 0 {
                return false;
            }
            if let Some(ability_id) = &p.ability
                && let Some(condition) = crate::sim::abilities::get_ability(ability_id)
            {
                return condition.suppress_weather;
            }
            false
        });
    if has_weather_lock {
        return None;
    }
    battle.weather
}
