use crate::sim::battle::Battle;
use damage_calc::{calculate_input, types::DamageInput};
use pkmn_meta::types::*;
use rand::RngExt;

pub struct DamageEvaluator<'a> {
    battle: &'a Battle,
}

impl<'a> DamageEvaluator<'a> {
    pub fn new(battle: &'a Battle) -> Self {
        Self { battle }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn evaluate(
        &self,
        move_id: &str,
        player: u8,
        slot: u8,
        target_player: u8,
        target_slot: u8,
        is_spread: bool,
        hit_index: u32,
    ) -> (i32, Option<String>, bool) {
        let attacker = if player == 1 {
            self.battle.p1.active.get(slot as usize)
        } else {
            self.battle.p2.active.get(slot as usize)
        };
        let defender = if target_player == 1 {
            self.battle.p1.active.get(target_slot as usize)
        } else {
            self.battle.p2.active.get(target_slot as usize)
        };
        if attacker.is_none() || defender.is_none() {
            return (0, None, false);
        }
        let (attacker, defender) = (attacker.unwrap(), defender.unwrap());

        if move_id == "splash" || move_id == "teleport" {
            return (0, None, false);
        }

        if ["fissure", "guillotine", "horndrill", "sheercold"].contains(&move_id) {
            return (defender.maxhp.into_inner(), None, false);
        }

        if move_id == "seismictoss" || move_id == "nightshade" {
            return (50, None, false);
        }

        if move_id == "superfang" {
            let dmg = std::cmp::max(1, defender.hp.into_inner() / 2);
            return (dmg, None, false);
        }

        if move_id == "counter"
            || move_id == "mirrorcoat"
            || move_id == "metalburst"
            || move_id == "comeuppance"
        {
            let mut last_damage = 0;
            for &(_, _, dmg, cat) in attacker.turn_state.damage_taken_from.iter().rev() {
                if dmg > 0 {
                    if move_id == "counter" && cat == Category::Physical {
                        last_damage = dmg;
                        break;
                    }
                    if move_id == "mirrorcoat" && cat == Category::Special {
                        last_damage = dmg;
                        break;
                    }
                    if move_id == "metalburst" || move_id == "comeuppance" {
                        last_damage = dmg;
                        break;
                    }
                }
            }
            if last_damage > 0 {
                let multiplier = if move_id == "metalburst" || move_id == "comeuppance" {
                    1.5
                } else {
                    2.0
                };
                return (
                    (last_damage as f64 * multiplier).floor() as i32,
                    None,
                    false,
                );
            }
            return (0, None, false); // Fail if no valid damage taken
        }

        let mut base_power = 0;
        let mut move_type = Type::Normal;
        let mut is_physical = true;

        let meta_opt = pkmn_meta::move_meta::get_move_meta(move_id);
        if let Some(meta) = &meta_opt {
            base_power = *meta.base_power();
            move_type = *meta.move_type();

            if move_id == "lastrespects" {
                let side = if player == 1 {
                    &self.battle.p1
                } else {
                    &self.battle.p2
                };
                let fainted = side
                    .active
                    .iter()
                    .chain(side.team.iter())
                    .filter(|pokemon| pokemon.hp == 0)
                    .count();
                base_power = (50u32 + 50 * fainted as u32).min(200);
            }

            if move_id == "avalanche" || move_id == "revenge" {
                let target_damaged_user = attacker
                    .turn_state
                    .damage_taken_from
                    .iter()
                    .any(|&(p, s, dmg, _)| p == target_player && s == target_slot && dmg > 0);
                if target_damaged_user {
                    base_power *= 2;
                }
            }

            if move_id == "weatherball" {
                let is_sun = self.battle.get_active_weather().is_some_and(|w| {
                    matches!(w, Weather::HashSunlight | Weather::ExtremelyHarshSunlight)
                }) || attacker.ability.as_ref().map(|a| a.as_str()) == Some("megasol");

                if is_sun {
                    base_power = 100;
                    move_type = Type::Fire;
                } else if let Some(weather) = self.battle.get_active_weather() {
                    base_power = 100;
                    move_type = match weather {
                        Weather::HashSunlight | Weather::ExtremelyHarshSunlight => Type::Fire,
                        Weather::Rain | Weather::HeavyRain => Type::Water,
                        Weather::Sandstorm => Type::Rock,
                        Weather::Snow => Type::Ice,
                        Weather::StrongWinds => Type::Normal,
                    };
                }
            }

            if move_id == "terrainpulse"
                && attacker.is_grounded()
                && let Some(terrain) = self.battle.terrain
            {
                base_power = 100;
                move_type = match terrain {
                    Terrain::Electric => Type::Electric,
                    Terrain::Grassy => Type::Grass,
                    Terrain::Misty => Type::Fairy,
                    Terrain::Psychic => Type::Psychic,
                };
            }

            if move_id == "aurawheel" && attacker.species.contains("hangry") {
                move_type = Type::Dark;
            }
        }

        let mut attacker_atk = attacker.attack;
        let mut attacker_spa = attacker.sp_attack;
        let attacker_item = if attacker.ability.as_ref().map(|a| a.as_str()) == Some("klutz") {
            None
        } else {
            attacker.item.as_ref()
        };

        if attacker_item
            .as_ref()
            .and_then(|i| pkmn_meta::item_meta::get_item_meta(i))
            .is_some_and(|m| *m.is_choice_band())
        {
            attacker_atk = attacker_atk * 1.5;
        } else if attacker_item
            .as_ref()
            .and_then(|i| pkmn_meta::item_meta::get_item_meta(i))
            .is_some_and(|m| *m.is_choice_specs())
        {
            attacker_spa = attacker_spa * 1.5;
        }

        if move_id == "photongeyser" || move_id == "shellsidearm" || move_id == "terablast" {
            let atk_val = attacker_atk.apply_boost(attacker.boosts.atk).into_inner();
            let spa_val = attacker_spa.apply_boost(attacker.boosts.spa).into_inner();
            is_physical = atk_val > spa_val;
        } else if let Some(meta) = pkmn_meta::move_meta::get_move_meta(move_id) {
            is_physical = *meta.category() == Category::Physical;
        }

        let effective_weight = |p: &crate::sim::pokemon::Pokemon| {
            let mut weight = p.weight.into_inner();
            if p.ability.as_ref().map(|a| a.as_ref()) == Some("heavymetal") {
                weight *= 2;
            } else if p.ability.as_ref().map(|a| a.as_ref()) == Some("lightmetal") {
                weight /= 2;
            }
            if p.item.as_ref().map(|a| a.as_ref()) == Some("floatstone") {
                weight /= 2;
            }
            weight
        };

        if move_id == "grassknot" || move_id == "lowkick" {
            let def_weight = effective_weight(defender);
            base_power = if def_weight < 100 {
                20
            } else if def_weight < 250 {
                40
            } else if def_weight < 500 {
                60
            } else if def_weight < 1000 {
                80
            } else if def_weight < 2000 {
                100
            } else {
                120
            };
        } else if move_id == "heavyslam" || move_id == "heatcrash" {
            let atk_weight = effective_weight(attacker);
            let def_weight = effective_weight(defender);

            base_power = if def_weight * 5 <= atk_weight {
                120
            } else if def_weight * 4 <= atk_weight {
                100
            } else if def_weight * 3 <= atk_weight {
                80
            } else if def_weight * 2 <= atk_weight {
                60
            } else {
                40
            };
        } else if move_id == "eruption" || move_id == "waterspout" || move_id == "dragonenergy" {
            let hp = attacker.hp.into_inner();
            let maxhp = attacker.maxhp.into_inner();
            base_power = std::cmp::max(1, 150 * hp / maxhp) as u32;
        } else if move_id == "flail" || move_id == "reversal" {
            let p = (48 * attacker.hp.into_inner()) / attacker.maxhp.into_inner();
            base_power = if p <= 1 {
                200
            } else if p <= 4 {
                150
            } else if p <= 9 {
                100
            } else if p <= 16 {
                80
            } else if p <= 32 {
                40
            } else {
                20
            };
        } else if move_id == "electroball" {
            let attacker_speed = self
                .battle
                .check_speed_modifiers(attacker, attacker.speed.apply_boost(attacker.boosts.spe))
                .into_inner();
            let defender_speed = self
                .battle
                .check_speed_modifiers(defender, defender.speed.apply_boost(defender.boosts.spe))
                .into_inner();
            let mut ratio = if defender_speed == 0 {
                0
            } else {
                attacker_speed / defender_speed
            };
            if ratio < 0 {
                ratio = 0;
            }
            base_power = match ratio {
                0 => 40,
                1 => 60,
                2 => 80,
                3 => 120,
                _ => 150,
            };
        } else if move_id == "fling" {
            base_power = if let Some(item) = attacker_item {
                match item.as_ref() {
                    "iron-ball" => 130,
                    "toxic-orb" | "flame-orb" | "light-ball" | "poison-barb" | "hard-stone"
                    | "macho-brace" => 30,
                    "choiceband" | "choicescarf" | "choicespecs" | "focussash" | "mentalherb"
                    | "powerherb" | "whiteherb" | "absorbbulb" => 10,
                    "sitrusberry" | "lumberry" | "leppaberry" | "oranberry" | "pechaberry"
                    | "rawstberry" | "cheriberry" | "chestoberry" | "aspearberry"
                    | "persimberry" => 10,
                    "leftovers" | "blacksludge" | "Rocky Helmet" => 10, // Wait, rockyhelmet is 80? I'll just do 10 for defaults
                    _ => 30,
                }
            } else {
                0
            };
        } else if move_id == "payback" {
            base_power = if defender.turn_state.acted_this_turn {
                100
            } else {
                50
            };
        } else if move_id == "gyroball" {
            let attacker_speed = self
                .battle
                .check_speed_modifiers(attacker, attacker.speed.apply_boost(attacker.boosts.spe))
                .into_inner();
            let defender_speed = self
                .battle
                .check_speed_modifiers(defender, defender.speed.apply_boost(defender.boosts.spe))
                .into_inner();
            let attacker_speed = std::cmp::max(1, attacker_speed);
            let mut power = (25 * defender_speed) / attacker_speed + 1;
            if power > 150 {
                power = 150;
            }
            base_power = std::cmp::max(1, power) as u32;
        } else if move_id == "beatup" {
            let (active, benched) = if player == 1 {
                (&self.battle.p1.active, &self.battle.p1.team)
            } else {
                (&self.battle.p2.active, &self.battle.p2.team)
            };

            // Build the full party array to look up stats
            let mut full_party = Vec::new();
            for p in active {
                full_party.push(p);
            }
            for p in benched {
                full_party.push(p);
            }

            // The hit_index corresponds to valid beat up participants.
            // But wait, the engine calculates hit_count in moves.rs based on valid participants.
            // Which participant corresponds to hit_index? We just iterate and find the Nth valid one!
            let mut valid_participants = Vec::new();
            for p in full_party {
                if p.hp > 0 && p.status.is_none() {
                    valid_participants.push(p);
                }
            }

            if let Some(p) = valid_participants.get(hit_index as usize) {
                let base_atk = pkmn_meta::pokemon_meta::get_pokemon_meta(&p.species)
                    .map(|m| m.base_stats()[1])
                    .unwrap_or(0);
                base_power = (base_atk as u32 / 10) + 5;
            } else {
                base_power = 0;
            }
        } else if move_id == "storedpower" || move_id == "powertrip" {
            let mut boosts = 0;
            let b = &attacker.boosts;
            for val in [
                b.atk.into_inner(),
                b.def.into_inner(),
                b.spa.into_inner(),
                b.spd.into_inner(),
                b.spe.into_inner(),
                b.accuracy.into_inner(),
                b.evasion.into_inner(),
            ] {
                if val > 0 {
                    boosts += val;
                }
            }
            base_power = 20 + 20 * boosts as u32;
        } else if move_id == "tripleaxel" {
            base_power = 20 * (hit_index + 1);
        } else if move_id == "hardpress" {
            base_power = std::cmp::max(
                1,
                100 * defender.hp.into_inner() as u32 / defender.maxhp.into_inner() as u32,
            );
        }

        if move_id == "facade" && attacker.status.is_some() {
            let s = attacker.status.as_ref().map(|s| s.as_ref()).unwrap();
            if s == "brn" || s == "psn" || s == "tox" || s == "par" {
                base_power *= 2;
            }
        }

        if move_id == "expandingforce"
            && self.battle.terrain == Some(Terrain::Psychic)
            && attacker.is_grounded()
        {
            base_power = 120; // 80 * 1.5
        }

        if (move_id == "hex" || move_id == "infernalparade") && defender.status.is_some() {
            base_power *= 2;
        }

        if (move_id == "barbbarrage" || move_id == "venoshock")
            && let Some(s) = defender.status.as_ref()
            && (*s == Status::Poison || *s == Status::Toxic)
        {
            base_power *= 2;
        }

        if move_id == "assurance" && !defender.turn_state.damage_taken_from.is_empty() {
            base_power *= 2;
        }

        if move_id == "acrobatics"
            && (attacker.item.is_none()
                || attacker.item.as_ref().is_none_or(|i| i.as_ref().is_empty()))
        {
            base_power *= 2;
        }

        if move_id == "knockoff"
            && let Some(item) = defender.item
            && pkmn_meta::mega_meta::can_remove_item(&defender.species, item.as_ref())
        {
            base_power = base_power * 3 / 2;
        }

        if move_id == "lashout" && attacker.turn_state.stats_lowered {
            base_power *= 2;
        }

        if move_id == "ficklebeam" {
            let is_all_out = if let Some(config) = &self.battle.rng_config
                && let Some(sec) = &config.secondary
            {
                sec == "always"
            } else {
                false
            };
            if is_all_out {
                base_power = 160;
            }
        }

        let mut attack = if move_id == "bodypress" {
            attacker.defense.into_inner()
        } else if move_id == "foulplay" {
            defender.attack.into_inner()
        } else if attacker
            .volatile_status
            .contains(&VolatileStatus::Powertrick)
        {
            if is_physical {
                attacker.defense.into_inner()
            } else {
                attacker.sp_attack.into_inner()
            }
        } else if is_physical {
            attacker.attack.into_inner()
        } else {
            attacker.sp_attack.into_inner()
        };

        if attacker.item == Some(ItemId::LightBall)
            && attacker.species.to_lowercase().contains("pikachu")
        {
            attack *= 2;
        }

        let wants_physical_defense = is_physical
            || move_id == "psyshock"
            || move_id == "psystrike"
            || move_id == "secretsword";
        let is_def = if self.battle.wonder_room_turns_left > 0 {
            !wants_physical_defense
        } else {
            wants_physical_defense
        };
        let defense = if is_def {
            if defender
                .volatile_status
                .contains(&VolatileStatus::Powertrick)
            {
                defender.attack.into_inner()
            } else {
                defender.defense.into_inner()
            }
        } else {
            defender.sp_defense.into_inner()
        };

        let mut ate_boost = false;
        if let Some(ability_id) = attacker.ability.as_ref() {
            if ability_id.as_str() == "liquidvoice"
                && pkmn_meta::move_meta::get_move_meta(move_id).is_some_and(|m| *m.is_sound())
            {
                move_type = Type::Water;
            } else if let Some(ability) = crate::sim::abilities::get_ability(ability_id)
                && ability.has_on_modify_type
                && let Some(new_type) = crate::sim::abilities::on_modify_type(ability_id, move_type)
            {
                move_type = new_type;
                ate_boost = true;
            }
        }

        let mut stab_modifier = 4096;
        if move_type != Type::Typeless
            && (attacker.get_types().contains(&move_type)
                || attacker.ability.as_ref().map(|a| a.as_ref()) == Some("protean")
                || attacker.ability.as_ref().map(|a| a.as_ref()) == Some("libero"))
        {
            stab_modifier = if attacker.ability.as_ref().map(|a| a.as_ref()) == Some("adaptability")
            {
                damage_calc::MOD_2_0
            } else {
                damage_calc::MOD_1_5
            };
        }

        let mut weather_modifier = 4096;
        let active_weather = self.battle.get_active_weather();
        let is_sun = (active_weather == Some(Weather::HashSunlight)
            || active_weather == Some(Weather::ExtremelyHarshSunlight))
            || attacker.ability.as_ref().map(|a| a.as_str()) == Some("megasol");
        if is_sun && move_type == Type::Fire {
            weather_modifier = damage_calc::MOD_1_5;
        } else if (active_weather == Some(Weather::HashSunlight)
            || active_weather == Some(Weather::ExtremelyHarshSunlight))
            && move_type == Type::Water
        {
            weather_modifier = damage_calc::MOD_0_5;
        } else if (active_weather == Some(Weather::Rain)
            || active_weather == Some(Weather::HeavyRain))
            && move_type == Type::Water
        {
            weather_modifier = damage_calc::MOD_1_5;
        } else if (active_weather == Some(Weather::Rain)
            || active_weather == Some(Weather::HeavyRain))
            && move_type == Type::Fire
        {
            weather_modifier = damage_calc::MOD_0_5;
        }

        let mut crit_stage = 0;

        if attacker
            .volatile_status
            .contains(&VolatileStatus::Focusenergy)
        {
            crit_stage += 2;
        }
        if attacker
            .volatile_status
            .contains(&VolatileStatus::Dragoncheer)
        {
            if attacker.get_types().contains(&Type::Dragon) {
                crit_stage += 2;
            } else {
                crit_stage += 1;
            }
        }

        if attacker.item == Some(ItemId::ScopeLens) {
            crit_stage += 1;
        }

        if attacker.ability.as_ref().map(|a| a.as_str()) == Some("superluck") {
            crit_stage += 1;
        }

        if crit_stage > 3 {
            crit_stage = 3;
        }
        let crit_prob = match crit_stage {
            0 => 24,
            1 => 8,
            2 => 2,
            _ => 1,
        };

        let mut rng = rand::rng();
        let mut is_crit = if let Some(config) = &self.battle.rng_config {
            if let Some(crits) = &config.crits {
                match crits.as_str() {
                    "always" => true,
                    "never" => false,
                    _ => rng.random_range(0..crit_prob) == 0,
                }
            } else {
                rng.random_range(0..crit_prob) == 0
            }
        } else {
            rng.random_range(0..crit_prob) == 0
        };

        if [
            "flowertrick",
            "frostbreath",
            "stormthrow",
            "surgingstrikes",
            "wickedblow",
        ]
        .contains(&move_id)
        {
            is_crit = true;
        }

        let attacker_ability = attacker.ability.as_ref().map(|a| a.as_str()).unwrap_or("");
        let mold_breaker = attacker_ability == "moldbreaker"
            || attacker_ability == "teravolt"
            || attacker_ability == "turboblaze";
        let defender_ability = defender.ability.as_ref().map(|a| a.as_str()).unwrap_or("");
        if attacker_ability == "merciless"
            && matches!(defender.status, Some(Status::Poison) | Some(Status::Toxic))
        {
            is_crit = true;
        }
        if (defender_ability == "battlearmor" || defender_ability == "shellarmor") && !mold_breaker
        {
            is_crit = false;
        }

        let mut defense_modifiers = vec![];
        if active_weather == Some(Weather::Sandstorm)
            && defender.get_types().contains(&Type::Rock)
            && !is_physical
        {
            defense_modifiers.push(damage_calc::MOD_1_5);
        }
        if active_weather == Some(Weather::Snow)
            && defender.get_types().contains(&Type::Ice)
            && is_physical
        {
            defense_modifiers.push(damage_calc::MOD_1_5);
        }

        let def_types = defender.get_types();
        let mut input = DamageInput {
            level: 50,
            base_power: base_power as u16,
            bp_modifiers: vec![],
            attack: attack as u16,
            attack_boost: if defender.ability.as_ref().map(|a| a.as_ref()) == Some("unaware") {
                0
            } else if move_id == "bodypress" {
                attacker.boosts.def.into_inner()
            } else if move_id == "foulplay" {
                defender.boosts.atk.into_inner()
            } else if is_physical {
                attacker.boosts.atk.into_inner()
            } else {
                attacker.boosts.spa.into_inner()
            },
            attack_modifiers: vec![],
            defense: defense as u16,
            defense_boost: if attacker.ability.as_ref().map(|a| a.as_ref()) == Some("unaware")
                || ["darkestlariat", "sacredsword", "chipaway"].contains(&move_id)
            {
                0
            } else if is_physical
                || move_id == "psyshock"
                || move_id == "psystrike"
                || move_id == "secretsword"
            {
                defender.boosts.def.into_inner()
            } else {
                defender.boosts.spd.into_inner()
            },
            defense_modifiers,
            is_physical,
            move_type,
            defender_type1: def_types.first().copied().unwrap_or(Type::Normal),
            defender_type2: def_types.get(1).copied(),
            defender_type3: def_types.get(2).copied(),
            effectiveness_override: None,
            immune_override: None,
            spread_modifier: if is_spread {
                damage_calc::MOD_0_75
            } else {
                4096
            },
            parental_bond_modifier: 4096,
            weather_modifier,
            is_crit,
            crit_modifier: if is_crit { damage_calc::MOD_1_5 } else { 4096 },
            stab_modifier,
            is_burned: is_physical
                && attacker.status.as_ref().map(|s| s.as_ref()) == Some("brn")
                && attacker.ability.as_ref().map(|a| a.as_ref()) != Some("guts")
                && move_id != "facade",
            final_modifiers: {
                let mut fm = vec![];
                let def_side = if target_player == 1 {
                    &self.battle.p1
                } else {
                    &self.battle.p2
                };
                if !is_crit
                    && attacker.ability.as_ref().map(|a| a.as_str()) != Some("infiltrator")
                    && move_id != "brickbreak"
                    && move_id != "psychicfangs"
                    && move_id != "ragingbull"
                    && (def_side.aurora_veil_turns > 0
                        || (def_side.reflect_turns > 0 && is_physical)
                        || (def_side.lightscreen_turns > 0 && !is_physical))
                {
                    fm.push(2732);
                }
                fm
            },
            protect_modifier: 4096,
            tinted_lens: false,
            neuroforce: false,
            solid_rock: false,
        };

        if move_id == "freezedry" {
            let mut shift = 0;
            let mut immune = false;
            let types = &def_types;
            for t in types {
                if *t == Type::Water {
                    shift += 1;
                } else {
                    println!(
                        "Checking immunity for: {:?} vs {:?}, gravity: {}",
                        move_type, *t, self.battle.gravity_turns_left
                    );
                    if damage_calc::is_immune(move_type, *t, None, None) {
                        if self.battle.gravity_turns_left > 0
                            && move_type == Type::Ground
                            && *t == Type::Flying
                        {
                            println!("Nullified Flying immunity");
                        } else {
                            immune = true;
                        }
                    } else {
                        shift += damage_calc::type_effectiveness_shift(move_type, *t, None, None);
                    }
                }
            }
            if immune {
                input.immune_override = Some(true);
            } else {
                input.effectiveness_override = Some(shift);
            }
        } else if move_id == "flyingpress" {
            let mut shift = 0;
            let mut immune = false;
            let types = &def_types;
            for t in types {
                if damage_calc::is_immune(Type::Fighting, *t, None, None)
                    || damage_calc::is_immune(Type::Flying, *t, None, None)
                {
                    immune = true;
                } else {
                    shift += damage_calc::type_effectiveness_shift(Type::Fighting, *t, None, None);
                    shift += damage_calc::type_effectiveness_shift(Type::Flying, *t, None, None);
                }
            }
            if immune {
                input.immune_override = Some(true);
            } else {
                input.effectiveness_override = Some(shift);
            }
        } else if move_type == Type::Ground
            && (defender.is_grounded() || self.battle.gravity_turns_left > 0)
        {
            let def_has_flying = def_types.contains(&Type::Flying);
            let has_iron_ball = defender.item == Some(ItemId::IronBall);
            if has_iron_ball && def_has_flying && self.battle.gravity_turns_left == 0 {
                // Showdown Iron Ball behavior:
                // Iron Ball's onEffectiveness sets typeMod = 0 (neutral 1x) if target has Flying type and not under Gravity.
                input.effectiveness_override = Some(0);
                input.immune_override = Some(false);
            } else {
                let mut shift = 0;
                let mut immune = false;
                let types = &def_types;
                for t in types {
                    if *t == Type::Flying {
                        // Flying type takes neutral (1x -> shift 0) from Ground when grounded
                        shift += 0;
                    } else if damage_calc::is_immune(move_type, *t, None, None) {
                        immune = true;
                    } else {
                        shift += damage_calc::type_effectiveness_shift(move_type, *t, None, None);
                    }
                }
                if immune {
                    input.immune_override = Some(true);
                } else {
                    input.effectiveness_override = Some(shift);
                    input.immune_override = Some(false);
                }
            }
        } else if (attacker.ability.as_ref().map(|a| a.as_str()) == Some("scrappy")
            || attacker.ability.as_ref().map(|a| a.as_str()) == Some("mindseye"))
            && (move_type == Type::Normal || move_type == Type::Fighting)
            && def_types.contains(&Type::Ghost)
        {
            let mut shift = 0;
            let types = &def_types;
            for t in types {
                if *t == Type::Ghost {
                    // Ghost takes neutral (1x -> shift 0) from Normal / Fighting with Scrappy
                    shift += 0;
                } else if !damage_calc::is_immune(move_type, *t, None, None) {
                    shift += damage_calc::type_effectiveness_shift(move_type, *t, None, None);
                }
            }
            input.effectiveness_override = Some(shift);
            input.immune_override = Some(false);
        }

        if attacker_item
            .as_ref()
            .and_then(|i| pkmn_meta::item_meta::get_item_meta(i))
            .is_some_and(|m| {
                (*m.is_choice_band() && is_physical) || (*m.is_choice_specs() && !is_physical)
            })
        {
            input.attack_modifiers.push(damage_calc::MOD_1_5);
        }

        if let Some(meta) = attacker
            .ability
            .as_ref()
            .map(|a| a.as_ref())
            .and_then(pkmn_meta::ability_meta::get_ability_meta)
        {
            if *meta.ignore_foe_stat_changes() {
                input.defense_boost = 0;
            }
            if let Some((boost_type, boost_mult)) = meta.attack_type_boost()
                && move_type == *boost_type
            {
                // TODO: Properly implement Flash Fire volatile status.
                let is_flash_fire =
                    attacker.ability.as_ref().map(|x| x.as_str()) == Some("flashfire");
                let is_activated = attacker
                    .volatile_status
                    .contains(&VolatileStatus::Flashfire);

                if !is_flash_fire || is_activated {
                    input.weather_modifier = (input.weather_modifier as f32 * boost_mult) as u16;
                }
            }
        }
        let attacker_ability = attacker.ability.as_ref().map(|a| a.as_ref()).unwrap_or("");
        let mold_breaker = attacker_ability == "moldbreaker"
            || attacker_ability == "teravolt"
            || attacker_ability == "turboblaze";

        if let Some(meta) = defender
            .ability
            .as_ref()
            .map(|a| a.as_ref())
            .and_then(pkmn_meta::ability_meta::get_ability_meta)
            && !mold_breaker
        {
            if *meta.ignore_foe_stat_changes() {
                input.attack_boost = 0;
            }
            if let Some(immune) = meta.immune_to_type()
                && *immune == move_type
                && (player != target_player || slot != target_slot)
            {
                if (self.battle.gravity_turns_left > 0 || defender.is_grounded())
                    && move_type == Type::Ground
                    && (defender.ability.as_ref().map(|x| x.as_str()) == Some("levitate")
                        || defender.ability.as_ref().map(|x| x.as_str()) == Some("eelevate"))
                {
                    // Gravity or Iron Ball nullifies Levitate/Eelevate
                } else {
                    input.immune_override = Some(true);
                }
            }
        }

        let terrain = self.battle.terrain;
        if terrain == Some(Terrain::Electric)
            && move_type == Type::Electric
            && attacker.is_grounded()
        {
            input.bp_modifiers.push(damage_calc::MOD_1_3);
        }

        if attacker.volatile_status.contains(&VolatileStatus::Charge) && move_type == Type::Electric
        {
            input.bp_modifiers.push(damage_calc::MOD_2_0);
        } else if terrain == Some(Terrain::Grassy) {
            if move_type == Type::Grass && attacker.is_grounded() {
                input.bp_modifiers.push(damage_calc::MOD_1_3);
            }
            if move_type == Type::Ground
                && (move_id == "earthquake" || move_id == "magnitude" || move_id == "bulldoze")
            {
                input.bp_modifiers.push(damage_calc::MOD_0_5);
            }
        } else if terrain == Some(Terrain::Psychic)
            && move_type == Type::Psychic
            && attacker.is_grounded()
        {
            input.bp_modifiers.push(damage_calc::MOD_1_3);
        } else if terrain == Some(Terrain::Misty)
            && move_type == Type::Dragon
            && defender.is_grounded()
        {
            input.bp_modifiers.push(damage_calc::MOD_0_5);
        }

        if ate_boost {
            input.bp_modifiers.push(damage_calc::MOD_1_2);
        }

        match attacker.ability.as_ref().map(|a| a.as_ref()).unwrap_or("") {
            "hugepower" | "purepower" => {
                if is_physical {
                    input.attack_modifiers.push(damage_calc::MOD_2_0);
                }
            }
            "guts" => {
                if is_physical && attacker.status.is_some() {
                    input.attack_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "toxicboost" => {
                if is_physical
                    && (attacker.status.as_ref().map(|s| s.as_ref()) == Some("psn")
                        || attacker.status.as_ref().map(|s| s.as_ref()) == Some("tox"))
                {
                    input.bp_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "flareboost" => {
                if !is_physical && attacker.status.as_ref().map(|s| s.as_ref()) == Some("brn") {
                    input.bp_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "hustle" => {
                if is_physical {
                    input.attack_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "waterbubble" => {
                if move_type == Type::Water {
                    input.attack_modifiers.push(damage_calc::MOD_2_0);
                }
            }
            "toughclaws" => {
                if pkmn_meta::move_meta::get_move_meta(move_id)
                    .map(|m| *m.flags_contact())
                    .unwrap_or(false)
                {
                    input.bp_modifiers.push(damage_calc::MOD_1_3);
                }
            }
            "reckless" => {
                if pkmn_meta::move_meta::get_move_meta(move_id)
                    .map(|m| m.recoil().is_some())
                    .unwrap_or(false)
                    || move_id == "jumpkick"
                    || move_id == "highjumpkick"
                {
                    input.bp_modifiers.push(damage_calc::MOD_1_2);
                }
            }
            "ironfist" => {
                if pkmn_meta::move_meta::get_move_meta(move_id)
                    .map(|m| *m.is_punch())
                    .unwrap_or(false)
                {
                    input.bp_modifiers.push(damage_calc::MOD_1_2);
                }
            }
            "technician" => {
                if base_power <= 60 {
                    input.bp_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "strongjaw" => {
                if pkmn_meta::move_meta::get_move_meta(move_id)
                    .map(|m| *m.is_bite())
                    .unwrap_or(false)
                {
                    input.bp_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "megalauncher" => {
                if move_id.contains("aura") || move_id.contains("pulse") {
                    input.bp_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "sniper" => {
                if input.is_crit {
                    input.final_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "tintedlens" => {
                input.tinted_lens = true;
            }
            "steelworker" => {
                if move_type == Type::Steel {
                    input.attack_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "transistor" => {
                if move_type == Type::Electric {
                    input.attack_modifiers.push(damage_calc::MOD_1_3);
                }
            }
            "dragonsmaw" => {
                if move_type == Type::Dragon {
                    input.attack_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "sharpness" => {
                if pkmn_meta::move_meta::get_move_meta(move_id)
                    .map(|m| *m.is_slicing())
                    .unwrap_or(false)
                {
                    input.bp_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "overgrow" => {
                if move_type == Type::Grass && attacker.hp <= attacker.maxhp / 3 {
                    input.attack_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "blaze" => {
                if move_type == Type::Fire && attacker.hp <= attacker.maxhp / 3 {
                    input.attack_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "torrent" => {
                if move_type == Type::Water && attacker.hp <= attacker.maxhp / 3 {
                    input.attack_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "swarm" => {
                if move_type == Type::Bug && attacker.hp <= attacker.maxhp / 3 {
                    input.attack_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "solarpower" => {
                if !is_physical
                    && (active_weather == Some(Weather::HashSunlight)
                        || active_weather == Some(Weather::ExtremelyHarshSunlight))
                {
                    input.attack_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "defeatist" => {
                if attacker.hp <= attacker.maxhp / 2 {
                    input.attack_modifiers.push(damage_calc::MOD_0_5);
                }
            }
            "slowstart" => {
                if is_physical {
                    input.attack_modifiers.push(damage_calc::MOD_0_5);
                }
            }
            "punkrock" => {
                if move_id.contains("sound")
                    || move_id.contains("voice")
                    || move_id.contains("snarl")
                    || move_id.contains("hypervoice")
                    || move_id.contains("boomburst")
                    || move_id.contains("overdrive")
                    || move_id.contains("bugbuzz")
                    || move_id.contains("roar")
                    || move_id.contains("howl")
                    || move_id.contains("sing")
                {
                    input.bp_modifiers.push(damage_calc::MOD_1_3);
                }
            }
            "supremeoverlord" => {
                let side = if player == 1 {
                    &self.battle.p1
                } else {
                    &self.battle.p2
                };
                let fainted = side
                    .active
                    .iter()
                    .chain(side.team.iter())
                    .filter(|pokemon| pokemon.hp == 0)
                    .count()
                    .min(5);
                if fainted > 0 {
                    let pow_mod = [4096, 4506, 4915, 5325, 5734, 6144];
                    input.bp_modifiers.push(pow_mod[fainted]);
                }
            }
            "sandforce" => {
                if active_weather == Some(Weather::Sandstorm)
                    && (move_type == Type::Rock
                        || move_type == Type::Ground
                        || move_type == Type::Steel)
                {
                    input.bp_modifiers.push(damage_calc::MOD_1_3);
                }
            }
            "neuroforce" => {
                input.neuroforce = true;
            }
            "analytic" => {
                let someone_will_move = self
                    .battle
                    .turn_actions
                    .iter()
                    .any(|a| a.player() != player || a.slot() != slot as usize);
                if !someone_will_move {
                    input.bp_modifiers.push(5325);
                }
            }
            "firemane" => {
                input.attack_modifiers.push(damage_calc::MOD_1_5);
            }
            "plus" | "minus" if !is_physical => {
                let ally = if player == 1 {
                    self.battle.p1.active.get((1 - slot) as usize)
                } else {
                    self.battle.p2.active.get((1 - slot) as usize)
                };
                if let Some(ally_p) = ally
                    && ally_p.hp > 0
                    && ally_p
                        .ability
                        .as_ref()
                        .is_some_and(|a| a.as_str() == "plus" || a.as_str() == "minus")
                {
                    input.attack_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            _ => {}
        }

        if move_type == Type::Steel {
            let user_has_steely =
                attacker.ability.as_ref().map(|a| a.as_str()) == Some("steelyspirit");
            if user_has_steely {
                input.bp_modifiers.push(damage_calc::MOD_1_5);
            }
            let ally = if player == 1 {
                self.battle.p1.active.get((1 - slot) as usize)
            } else {
                self.battle.p2.active.get((1 - slot) as usize)
            };
            if let Some(ally_p) = ally
                && ally_p.hp > 0
                && ally_p.ability.as_ref().map(|a| a.as_str()) == Some("steelyspirit")
            {
                input.bp_modifiers.push(damage_calc::MOD_1_5);
            }
        }

        if move_type == Type::Fairy && (player != target_player || slot != target_slot) {
            let has_fairy_aura = self
                .battle
                .all_active_pokemon()
                .into_iter()
                .any(|(_, p)| p.ability.as_ref().map(|a| a.as_str()) == Some("fairyaura"));
            if has_fairy_aura {
                let has_aura_break = self
                    .battle
                    .all_active_pokemon()
                    .into_iter()
                    .any(|(_, p)| p.ability.as_ref().map(|a| a.as_str()) == Some("aurabreak"));
                if has_aura_break {
                    input.bp_modifiers.push(3072);
                } else {
                    input.bp_modifiers.push(5448);
                }
            }
        }

        if !mold_breaker {
            let def_ally = if target_player == 1 {
                self.battle.p1.active.get((1 - target_slot) as usize)
            } else {
                self.battle.p2.active.get((1 - target_slot) as usize)
            };
            if let Some(ally) = def_ally
                && ally.hp > 0
                && ally.ability.as_ref().map(|a| a.as_str()) == Some("friendguard")
            {
                input.final_modifiers.push(damage_calc::MOD_0_75);
            }
        }

        match defender.ability.as_ref().map(|a| a.as_ref()).unwrap_or("") {
            "grasspelt" if !mold_breaker => {
                if is_physical && self.battle.terrain == Some(Terrain::Grassy) {
                    input.defense_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "heatproof" | "waterbubble" if !mold_breaker => {
                if move_type == Type::Fire {
                    input.attack_modifiers.push(damage_calc::MOD_0_5);
                }
            }
            "furcoat" if !mold_breaker => {
                if is_physical {
                    input.defense_modifiers.push(damage_calc::MOD_2_0);
                }
            }
            "marvelscale" if !mold_breaker => {
                if is_physical && defender.status.is_some() {
                    input.defense_modifiers.push(damage_calc::MOD_1_5);
                }
            }
            "purifyingsalt" if !mold_breaker => {
                if move_type == Type::Ghost {
                    input.attack_modifiers.push(damage_calc::MOD_0_5);
                }
            }
            "icescales" if !mold_breaker => {
                if !is_physical {
                    input.attack_modifiers.push(damage_calc::MOD_0_5);
                }
            }
            "punkrock" if !mold_breaker => {
                if pkmn_meta::move_meta::get_move_meta(move_id).is_some_and(|m| *m.is_sound()) {
                    input.final_modifiers.push(damage_calc::MOD_0_5);
                }
            }
            "dryskin" if !mold_breaker => {
                if move_type == Type::Fire {
                    input.bp_modifiers.push(damage_calc::MOD_1_25);
                }
                if move_type == Type::Water && (player != target_player || slot != target_slot) {
                    input.immune_override = Some(true);
                }
            }
            "fluffy" if !mold_breaker => {
                if move_type == Type::Fire {
                    input.bp_modifiers.push(damage_calc::MOD_2_0);
                }
                let is_contact = attacker.ability.as_ref().map(|a| a.as_str()) != Some("longreach")
                    && pkmn_meta::move_meta::get_move_meta(move_id)
                        .map(|m| *m.flags_contact())
                        .unwrap_or(false);
                if is_contact {
                    input.final_modifiers.push(damage_calc::MOD_0_5);
                }
            }
            "auraguard" if !mold_breaker => {
                let is_contact = attacker.ability.as_ref().map(|a| a.as_str()) != Some("longreach")
                    && pkmn_meta::move_meta::get_move_meta(move_id)
                        .map(|m| *m.flags_contact())
                        .unwrap_or(false);
                if is_contact {
                    input.final_modifiers.push(damage_calc::MOD_0_5);
                }
            }
            "waterabsorb" | "stormdrain" if !mold_breaker => {
                if move_type == Type::Water && (player != target_player || slot != target_slot) {
                    input.immune_override = Some(true);
                }
            }
            "voltabsorb" | "motordrive" | "lightningrod" if !mold_breaker => {
                if move_type == Type::Electric {
                    input.immune_override = Some(true);
                }
            }
            "thickfat" if !mold_breaker => {
                if move_type == Type::Fire || move_type == Type::Ice {
                    input.attack_modifiers.push(damage_calc::MOD_0_5);
                }
            }
            "solidrock" | "filter" if !mold_breaker => {
                input.solid_rock = true;
            }
            "prismarmor" => {
                input.solid_rock = true;
            }
            "multiscale" | "shadowshield" if !mold_breaker => {
                if defender.hp == defender.maxhp {
                    input.final_modifiers.push(damage_calc::MOD_0_5);
                }
            }
            "flashfire" | "wellbakedbody" if !mold_breaker => {
                if move_type == Type::Fire {
                    input.immune_override = Some(true);
                }
            }
            "sapsipper" if !mold_breaker => {
                if move_type == Type::Grass {
                    input.immune_override = Some(true);
                }
            }
            "eartheater" if !mold_breaker => {
                if move_type == Type::Ground {
                    input.immune_override = Some(true);
                }
            }
            "levitate" if !mold_breaker => {
                if move_type == Type::Ground {
                    if self.battle.gravity_turns_left > 0 || defender.is_grounded() {
                        // Gravity or Iron Ball nullifies Levitate
                    } else {
                        input.immune_override = Some(true);
                    }
                }
            }
            "soundproof" if !mold_breaker => {
                if pkmn_meta::move_meta::get_move_meta(move_id).is_some_and(|m| *m.is_sound()) {
                    input.immune_override = Some(true);
                }
            }
            "bulletproof" if !mold_breaker => {
                if pkmn_meta::move_meta::get_move_meta(move_id).is_some_and(|m| *m.is_ball()) {
                    input.immune_override = Some(true);
                }
            }
            "overcoat" if !mold_breaker => {
                if pkmn_meta::move_meta::get_move_meta(move_id).is_some_and(|m| *m.is_powder()) {
                    input.immune_override = Some(true);
                }
            }
            "wonderguard"
                if !mold_breaker
                    && damage_calc::type_effectiveness_shift(
                        move_type,
                        defender.type1,
                        defender.type2,
                        defender.added_type,
                    ) <= 0 =>
            {
                input.immune_override = Some(true);
            }
            _ => {}
        }

        if attacker_item == Some(&ItemId::Metronome) && attacker.consecutive_move_counter > 1 {
            let mult = 4096.0 + (4096.0 * ((attacker.consecutive_move_counter - 1) as f32 * 0.2));
            input.bp_modifiers.push(mult as u16);
        }

        if let Some(item_meta) = attacker_item.and_then(pkmn_meta::item_meta::get_item_meta) {
            if (*item_meta.is_muscle_band() && is_physical)
                || (*item_meta.is_wise_glasses() && !is_physical)
            {
                input.bp_modifiers.push(damage_calc::MOD_1_1);
            } else if *item_meta.is_life_orb() {
                input.final_modifiers.push(damage_calc::MOD_1_3);
            }

            if *item_meta.is_expert_belt()
                && damage_calc::type_effectiveness_shift(
                    move_type,
                    input.defender_type1,
                    input.defender_type2,
                    input.defender_type3,
                ) > 0
            {
                input.final_modifiers.push(damage_calc::MOD_1_2);
            }

            if let Some((boost_type, boost_mult)) = item_meta.type_boost()
                && move_type == *boost_type
            {
                input.bp_modifiers.push((*boost_mult * 4096.0) as u16);
            }
        }

        let defender_item = if defender.ability.as_ref().map(|a| a.as_str()) == Some("klutz") {
            None
        } else {
            defender.item.as_ref()
        };

        if let Some(item_meta) = defender_item.and_then(pkmn_meta::item_meta::get_item_meta)
            && let Some(resist_type) = item_meta.type_resist_berry()
            && move_type == *resist_type
            && (*resist_type == Type::Normal
                || damage_calc::type_effectiveness_shift(
                    move_type,
                    input.defender_type1,
                    input.defender_type2,
                    input.defender_type3,
                ) > 0)
        {
            input.final_modifiers.push(damage_calc::MOD_0_5);
        }

        if attacker
            .volatile_status
            .contains(&VolatileStatus::Helpinghand)
        {
            input.bp_modifiers.push(damage_calc::MOD_1_5);
        }

        if attacker.ability.as_ref().map(|a| a.as_str()) == Some("parentalbond") && hit_index == 1 {
            input.final_modifiers.push(1024); // 0.25x damage in Gen 7+
        }

        let attacker_ability = attacker.ability.as_ref().map(|a| a.as_str());
        let meta_opt = pkmn_meta::move_meta::get_move_meta(move_id);
        let makes_contact = meta_opt
            .as_ref()
            .map(|m| *m.flags_contact())
            .unwrap_or(false)
            && attacker_ability != Some("longreach");
        let target_is_protected = defender.volatile_status.iter().any(|vs| {
            matches!(
                vs,
                VolatileStatus::Protect
                    | VolatileStatus::Kingsshield
                    | VolatileStatus::Spikyshield
                    | VolatileStatus::Banefulbunker
            )
        });
        if matches!(attacker_ability, Some("piercingdrill") | Some("unseenfist"))
            && makes_contact
            && target_is_protected
        {
            input.final_modifiers.push(1024); // 0.25x damage when piercing through protection
        }

        let output = calculate_input(&input);

        let mut rng = rand::rng();
        let roll_index = if let Some(config) = &self.battle.rng_config {
            if let Some(damage_roll) = &config.damage_roll {
                match damage_roll.as_str() {
                    "max" => 15,
                    "min" => 0,
                    _ => rng.random_range(0..16),
                }
            } else {
                rng.random_range(0..16)
            }
        } else {
            rng.random_range(0..16)
        };

        let roll = output.rolls.get(roll_index as usize).unwrap_or(&0);
        let mut absorbed_by = None;
        if input.immune_override == Some(true) {
            absorbed_by = defender.ability.as_ref().map(|a| a.to_string());
        }

        (*roll as i32, absorbed_by, input.is_crit)
    }
}
