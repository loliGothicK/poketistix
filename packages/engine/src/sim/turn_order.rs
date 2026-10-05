use crate::sim::battle::{Battle, Pokemon};
use pkmn_meta::types::*;

pub struct TurnOrderResolver<'a> {
    battle: &'a Battle,
}

impl<'a> TurnOrderResolver<'a> {
    pub fn new(battle: &'a Battle) -> Self {
        Self { battle }
    }

    pub fn get_move_priority(&self, move_id: &str, pkmn: &Pokemon) -> i32 {
        let meta = pkmn_meta::move_meta::get_move_meta(move_id);
        let mut priority = meta.as_ref().map(|m| *m.priority()).unwrap_or(0);

        let is_prankster = pkmn.ability.as_ref().map(|x| x.as_ref()) == Some("prankster");
        let is_status = pkmn_meta::move_meta::get_move_meta(move_id)
            .is_some_and(|m| *m.category() == Category::Status);

        let is_galewings = pkmn.ability.as_ref().map(|a| a.as_str()) == Some("galewings")
            && pkmn.hp.into_inner() == pkmn.maxhp.into_inner()
            && pkmn_meta::move_meta::get_move_meta(move_id)
                .is_some_and(|m| *m.move_type() == Type::Flying);

        if (is_prankster && is_status) || is_galewings {
            priority += 1;
        } else if pkmn.ability.as_ref().map(|x| x.as_ref()) == Some("triage")
            && (move_id == "recover"
                || move_id == "roost"
                || move_id == "synthesise"
                || move_id == "softboiled"
                || move_id == "floralhealing")
        {
            priority += 3;
        }
        priority
    }

    pub fn check_speed_modifiers(
        &self,
        pkmn: &Pokemon,
        mut speed: crate::sim::values::Speed,
    ) -> crate::sim::values::Speed {
        if pkmn.status.as_ref().map(|s| s.as_ref()) == Some("par") {
            speed = speed / 2;
        }

        let is_p1 = self.battle.p1.active.iter().any(|p| p.ident == pkmn.ident);
        if (is_p1 && self.battle.p1.tailwind) || (!is_p1 && self.battle.p2.tailwind) {
            speed = speed * 2.0;
        }

        if let Some(item_meta) = pkmn
            .item
            .as_ref()
            .and_then(pkmn_meta::item_meta::get_item_meta)
        {
            if *item_meta.is_choice_scarf() {
                speed = speed * 1.5;
            } else if *item_meta.is_speed_drop() {
                speed = speed / 2;
            }
        }

        let pkmn_ability = pkmn.ability.as_ref().map(|a| a.as_ref());
        let active_weather = self.battle.get_active_weather();
        if (pkmn_ability == Some("swiftswim")
            && (active_weather == Some(Weather::Rain)
                || active_weather == Some(Weather::HeavyRain)))
            || (pkmn_ability == Some("chlorophyll")
                && (active_weather == Some(Weather::HashSunlight)
                    || active_weather == Some(Weather::ExtremelyHarshSunlight)))
            || (pkmn_ability == Some("sandrush") && active_weather == Some(Weather::Sandstorm))
            || (pkmn_ability == Some("slushrush") && active_weather == Some(Weather::Snow))
            || (pkmn_ability == Some("surgesurfer")
                && self.battle.terrain == Some(Terrain::Electric))
        {
            speed = speed * 2.0;
        }

        if pkmn_ability == Some("quickfeet") && pkmn.status.is_some() {
            speed = speed * 1.5;
            if pkmn.status.as_ref().map(|s| s.as_ref()) == Some("par") {
                speed = speed * 2.0;
            }
        }

        speed
    }
}
