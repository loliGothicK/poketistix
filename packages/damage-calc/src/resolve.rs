use crate::types::{DamageInput, Type};
use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct PokemonPanelState {
    pub species: Option<String>,
    pub identifier: Option<String>,
    pub move_id: Option<String>,
    pub ability: Option<String>,
    pub item: Option<String>,
    pub evs: Option<String>,
    pub hp_current: Option<i32>,
    pub hp_max: Option<i32>,
    #[tsify(type = "any")]
    pub stats: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct ResolveContext {
    pub attacker: PokemonPanelState,
    pub defender: PokemonPanelState,
    pub weather: Option<String>,
    pub terrain: Option<String>,
    pub is_doubles: bool,
    pub is_crit: bool,
}

pub fn parse_ev_string(ev_str: &str) -> ([u32; 6], [f64; 6]) {
    let mut evs = [0; 6];
    let mut natures = [1.0; 6];

    for token in ev_str.split_whitespace() {
        if token.is_empty() {
            continue;
        }

        let stat_char = token.chars().next().unwrap();
        let stat_idx = match stat_char {
            'H' => 0,
            'A' => 1,
            'B' => 2,
            'C' => 3,
            'D' => 4,
            'S' => 5,
            _ => continue,
        };

        let mut end_idx = token.len();
        if token.ends_with('+') {
            natures[stat_idx] = 1.1;
            end_idx -= 1;
        } else if token.ends_with('-') {
            natures[stat_idx] = 0.9;
            end_idx -= 1;
        }

        if end_idx > 1
            && let Ok(val) = token[1..end_idx].parse::<u32>()
        {
            // In Champions format, 'A32' means 32 stat points. Since 252 EVs / 4 = 63, and standard adds 32 at level 50,
            // we convert the 32 scale back to the standard Showdown 252 scale so the Showdown formula calculates it identically.
            // 32 * 8 = 256, but max EV in Showdown is 252. We map 32 -> 252.
            let mut showdown_ev = val * 8;
            if showdown_ev > 252 {
                showdown_ev = 252;
            }
            evs[stat_idx] = showdown_ev;
        }
    }

    (evs, natures)
}

pub fn calc_stat(
    is_hp: bool,
    base_stat: u32,
    iv: u32,
    ev: u32,
    level: u32,
    nature_multiplier: f64,
) -> u32 {
    // Showdown exact formula (sim/pokemon.ts)
    if is_hp {
        if base_stat == 1 {
            return 1;
        }
        return ((2 * base_stat + iv + (ev / 4)) * level / 100) + level + 10;
    }
    let val = ((2 * base_stat + iv + (ev / 4)) * level / 100) + 5;
    (val as f64 * nature_multiplier).floor() as u32
}

pub fn resolve_damage_input(ctx: &ResolveContext) -> Option<DamageInput> {
    let _parsed_pokemon = crate::data::get_parsed_pokemon();
    let _parsed_moves = crate::data::get_parsed_moves();

    let attacker_id = ctx
        .attacker
        .species
        .as_ref()
        .or(ctx.attacker.identifier.as_ref())?
        .to_lowercase();
    let defender_id = ctx
        .defender
        .species
        .as_ref()
        .or(ctx.defender.identifier.as_ref())?
        .to_lowercase();

    let p_list = _parsed_pokemon["data"].as_array()?;
    let atk_data = p_list
        .iter()
        .find(|p| p["identifier"].as_str() == Some(&attacker_id))
        .or_else(|| {
            p_list
                .iter()
                .find(|p| p["slug"].as_str() == Some(&attacker_id))
        })?;
    let def_data = p_list
        .iter()
        .find(|p| p["identifier"].as_str() == Some(&defender_id))
        .or_else(|| {
            p_list
                .iter()
                .find(|p| p["slug"].as_str() == Some(&defender_id))
        })?;

    let resolve_status = |p: &'static serde_json::Value| -> Option<&'static [serde_json::Value]> {
        if p["status"].as_str() == Some("inherit") {
            let species_id = p.get("species_id").and_then(|v| v.as_u64())?;
            let base = p_list
                .iter()
                .find(|b| b["id"].as_u64() == Some(species_id))?;
            base["status"].as_array().map(|v| v.as_slice())
        } else {
            p["status"].as_array().map(|v| v.as_slice())
        }
    };

    let resolve_types = |p: &'static serde_json::Value| -> Option<&'static [serde_json::Value]> {
        if p["types"].as_str() == Some("inherit") {
            let species_id = p.get("species_id").and_then(|v| v.as_u64())?;
            let base = p_list
                .iter()
                .find(|b| b["id"].as_u64() == Some(species_id))?;
            base["types"].as_array().map(|v| v.as_slice())
        } else {
            p["types"].as_array().map(|v| v.as_slice())
        }
    };

    let atk_bases = resolve_status(atk_data)?;
    let def_bases = resolve_status(def_data)?;

    let (atk_evs, atk_natures) = parse_ev_string(ctx.attacker.evs.as_deref().unwrap_or(""));
    let (def_evs, def_natures) = parse_ev_string(ctx.defender.evs.as_deref().unwrap_or(""));

    let mut attacker_stats = [0; 6];
    let mut defender_stats = [0; 6];
    for i in 0..6 {
        attacker_stats[i] = calc_stat(
            i == 0,
            atk_bases[i].as_u64()? as u32,
            31,
            atk_evs[i],
            50,
            atk_natures[i],
        );
        defender_stats[i] = calc_stat(
            i == 0,
            def_bases[i].as_u64()? as u32,
            31,
            def_evs[i],
            50,
            def_natures[i],
        );
    }

    let move_id = ctx.attacker.move_id.as_ref()?.to_lowercase();
    let m_list = _parsed_moves["data"].as_array()?;
    let safe_move_id = move_id.replace(" ", "").replace("-", "");
    let move_data = m_list.iter().find(|m| {
        let ident = m["identifier"].as_str().unwrap_or("").replace("-", "");
        ident == safe_move_id
    })?;

    let base_power = move_data["power"].as_u64().unwrap_or(0) as u16;
    let category = move_data["category"].as_str().unwrap_or("status");
    let is_physical = category == "physical";

    let move_type_str = move_data["type"].as_str().unwrap_or("Normal");
    let move_type = parse_type(move_type_str);

    let def_types = resolve_types(def_data)?;
    let def_type1 = parse_type(def_types[0].as_str().unwrap_or("Normal"));
    let def_type2 = if def_types.len() > 1 {
        Some(parse_type(def_types[1].as_str().unwrap_or("Normal")))
    } else {
        None
    };

    let attack_stat = if is_physical {
        attacker_stats[1]
    } else {
        attacker_stats[3]
    };
    let defense_stat = if is_physical {
        defender_stats[2]
    } else {
        defender_stats[4]
    };

    let atk_types = resolve_types(atk_data)?;
    let mut stab_modifier = 4096;
    for t in atk_types {
        if t.as_str().unwrap_or("").eq_ignore_ascii_case(move_type_str) {
            stab_modifier = 6144;
            break;
        }
    }

    let weather_str = ctx.weather.as_deref().unwrap_or("none").to_lowercase();
    let mut weather_modifier = 4096;
    if weather_str == "sun" {
        if move_type == Type::Fire {
            weather_modifier = 6144;
        } else if move_type == Type::Water {
            weather_modifier = 2048;
        }
    } else if weather_str == "rain" {
        if move_type == Type::Water {
            weather_modifier = 6144;
        } else if move_type == Type::Fire {
            weather_modifier = 2048;
        }
    }

    let mut defense_modifiers = vec![];
    let def_has_ice = def_type1 == Type::Ice || def_type2 == Some(Type::Ice);
    let def_has_rock = def_type1 == Type::Rock || def_type2 == Some(Type::Rock);
    if weather_str == "snow" && def_has_ice && is_physical {
        defense_modifiers.push(6144);
    }
    if weather_str == "sandstorm" && def_has_rock && !is_physical {
        defense_modifiers.push(6144);
    }

    Some(DamageInput {
        level: 50,
        base_power,
        bp_modifiers: vec![],
        attack: attack_stat as u16,
        attack_boost: 0,
        attack_modifiers: vec![],
        defense: defense_stat as u16,
        defense_boost: 0,
        defense_modifiers,
        is_physical,
        move_type,
        defender_type1: def_type1,
        defender_type2: def_type2,
        defender_type3: None,
        effectiveness_override: None,
        immune_override: None,
        spread_modifier: 4096,
        parental_bond_modifier: 4096,
        weather_modifier,
        is_crit: ctx.is_crit,
        crit_modifier: 6144,
        stab_modifier,
        is_burned: false,
        final_modifiers: vec![],
        protect_modifier: 4096,
        tinted_lens: false,
        neuroforce: false,
        solid_rock: false,
    })
}

fn parse_type(s: &str) -> Type {
    match s.to_lowercase().as_str() {
        "normal" => Type::Normal,
        "fire" => Type::Fire,
        "water" => Type::Water,
        "electric" => Type::Electric,
        "grass" => Type::Grass,
        "ice" => Type::Ice,
        "fighting" => Type::Fighting,
        "poison" => Type::Poison,
        "ground" => Type::Ground,
        "flying" => Type::Flying,
        "psychic" => Type::Psychic,
        "bug" => Type::Bug,
        "rock" => Type::Rock,
        "ghost" => Type::Ghost,
        "dragon" => Type::Dragon,
        "dark" => Type::Dark,
        "steel" => Type::Steel,
        "fairy" => Type::Fairy,
        _ => Type::Normal,
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_damage_calc_integration() {
        let ctx = ResolveContext {
            attacker: PokemonPanelState {
                species: Some("venusaur".to_string()),
                identifier: None,
                move_id: Some("sludgebomb".to_string()),
                ability: Some("overgrow".to_string()),
                item: None,
                evs: Some("C32".to_string()),
                hp_current: None,
                hp_max: None,
                stats: None,
            },
            defender: PokemonPanelState {
                species: Some("charizard".to_string()),
                identifier: None,
                move_id: None,
                ability: Some("blaze".to_string()),
                item: None,
                evs: Some("H32 D32".to_string()),
                hp_current: None,
                hp_max: None,
                stats: None,
            },
            weather: None,
            terrain: None,
            is_doubles: true,
            is_crit: false,
        };

        let input = resolve_damage_input(&ctx).expect("Failed to resolve input");
        assert_eq!(input.base_power, 90);
        let output = crate::calculate_input(&input);
        assert!(output.max > 0);
    }
}
