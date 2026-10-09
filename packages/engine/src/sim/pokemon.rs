use crate::sim::values::*;
use crate::wasm_api::Boosts;
use indexmap::IndexMap;
use pkmn_meta::types::*;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Clone, Debug)]
pub struct Pokemon {
    pub ident: String,
    pub species: String,
    pub hp: Hp,
    pub maxhp: MaxHp,
    pub speed: Speed,
    pub attack: Attack,
    pub defense: Defense,
    pub sp_attack: SpecialAttack,
    pub sp_defense: SpecialDefense,
    pub boosts: Boosts,
    pub item: Option<ItemId>,
    pub ability: Option<Ability>,
    pub status: Option<Status>,
    pub volatile_status: Vec<VolatileStatus>,
    pub type1: Type,
    pub type2: Option<Type>,
    pub added_type: Option<Type>,
    pub weight: Weight,
    pub moves: Vec<String>,
    pub evs: PokemonEvs,
    pub nature: Option<Nature>,
    pub is_mega: bool,

    // Tracking fields
    pub last_move_used: Option<String>,
    pub consecutive_move_counter: u8,
    pub pp_used: IndexMap<String, u8>,
    pub turn_state: PokemonTurnState,
    pub tox_counter: u8,
    pub sleep_turns: u8,
    pub eaten_berry: bool,
    pub cud_chew_berry: Option<ItemId>,
    pub cud_chew_counter: u8,
    pub last_consumed_berry: Option<ItemId>,
    pub disguise_busted: bool,
    pub libero_activated: bool,
    pub partially_trapped_by: Option<PokemonIdent>,
    pub leech_seeded_by: Option<PokemonIdent>,
    pub partially_trapped_turns: u8,
    pub trapped_by: Option<PokemonIdent>,
    pub disabled_move: Option<String>,
    pub disable_turns: u8,
    pub encored_move: Option<String>,
    pub encore_turns: u8,
    pub taunt_turns: u8,
    pub yawn_turns: u8,
    pub perish_turns: u8,
    pub magnet_rise_turns: u8,
    pub telekinesis_turns: u8,
    pub syrup_bomb_turns: u8,
    pub syrup_bomb_source: Option<PokemonIdent>,
    pub uproar_turns: u8,
    pub locked_move_turns: u8,
    pub active_turns: u16,
    pub substitute_hp: i32,
}

#[derive(Clone, Debug, Default)]
pub struct PokemonTurnState {
    pub damage_taken_from: Vec<(u8, u8, i32, Category)>,
    pub stats_raised: bool,
    pub stats_lowered: bool,
    pub acted_this_turn: bool,
}

impl PokemonTurnState {
    pub fn clear(&mut self) {
        self.damage_taken_from.clear();
        self.stats_raised = false;
        self.stats_lowered = false;
        self.acted_this_turn = false;
    }
}

impl Pokemon {
    pub fn is_semi_invulnerable(&self) -> bool {
        self.volatile_status.iter().any(|v| {
            matches!(
                v.as_ref(),
                "dig" | "fly" | "bounce" | "dive" | "phantomforce" | "shadowforce" | "skydrop"
            )
        })
    }

    pub fn get_types(&self) -> Vec<Type> {
        let mut types = Vec::new();
        let roosted = self.volatile_status.contains(&VolatileStatus::Roost);

        if self.type1 != Type::Flying || !roosted {
            types.push(self.type1);
        }
        if let Some(t2) = self.type2
            && (t2 != Type::Flying || !roosted)
            && !types.contains(&t2)
        {
            types.push(t2);
        }
        if let Some(at) = self.added_type
            && (at != Type::Flying || !roosted)
            && !types.contains(&at)
        {
            types.push(at);
        }

        // If it was pure Flying and roosted, it becomes Normal type (Gen 5+)
        if types.is_empty() {
            types.push(Type::Normal);
        }

        types
    }

    pub fn is_grounded(&self) -> bool {
        if self.is_semi_invulnerable() {
            return false;
        }
        if self.item == Some(ItemId::IronBall) {
            return true;
        }
        if self.item == Some(ItemId::AirBalloon) {
            return false;
        }
        if self.get_types().contains(&Type::Flying)
            || self
                .ability
                .as_ref()
                .map(|a| a.as_str() == "levitate" || a.as_str() == "eelevate")
                .unwrap_or(false)
        {
            return false;
        }
        true
    }

    pub fn mega_evolve(&mut self, mega_species: &str, mega_ability: &str) {
        if let Some(meta) = pkmn_meta::pokemon_meta::get_pokemon_meta(mega_species) {
            self.species = mega_species.to_string();
            self.ability = Some(mega_ability.to_string().into());
            self.type1 = *meta.type1();
            self.type2 = *meta.type2();
            self.added_type = None;
            self.weight = (*meta.weight()).into();
            self.is_mega = true;

            // Recalculate stats with new base stats: Base + 20 + EV, then nature
            let base_atk = meta.base_stats()[1] + 20;
            let base_def = meta.base_stats()[2] + 20;
            let base_spa = meta.base_stats()[3] + 20;
            let base_spd = meta.base_stats()[4] + 20;
            let base_spe = meta.base_stats()[5] + 20;

            let pre_nature_atk = base_atk + self.evs.atk.unwrap_or(0) as u32;
            let pre_nature_def = base_def + self.evs.def.unwrap_or(0) as u32;
            let pre_nature_spa = base_spa + self.evs.spa.unwrap_or(0) as u32;
            let pre_nature_spd = base_spd + self.evs.spd.unwrap_or(0) as u32;
            let pre_nature_spe = base_spe + self.evs.spe.unwrap_or(0) as u32;

            let apply_nature = |val: u32, is_buff: bool, is_nerf: bool| -> i32 {
                let mut stat = val as i32;
                if is_buff {
                    stat = (stat * 11) / 10;
                } else if is_nerf {
                    stat = (stat * 9) / 10;
                }
                stat
            };

            let (buff, nerf) = self.nature.map(|n| n.modifiers()).unwrap_or((0, 0));

            self.attack = apply_nature(pre_nature_atk, buff == 1, nerf == 1).into();
            self.defense = apply_nature(pre_nature_def, buff == 2, nerf == 2).into();
            self.sp_attack = apply_nature(pre_nature_spa, buff == 3, nerf == 3).into();
            self.sp_defense = apply_nature(pre_nature_spd, buff == 4, nerf == 4).into();
            self.speed = apply_nature(pre_nature_spe, buff == 5, nerf == 5).into();
        }
    }

    pub fn swap_offensive_defensive_stats(&mut self) {
        let atk = self.attack.into_inner();
        let def = self.defense.into_inner();
        let spa = self.sp_attack.into_inner();
        let spd = self.sp_defense.into_inner();
        self.attack = def.into();
        self.defense = atk.into();
        self.sp_attack = spd.into();
        self.sp_defense = spa.into();
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]

pub struct PokemonIdent {
    pub player: u8,
    pub slot: usize,
}

impl std::fmt::Display for PokemonIdent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let p = if self.player == 1 { "p1" } else { "p2" };
        let s = if self.slot == 0 { "a" } else { "b" };
        write!(f, "{}{}", p, s)
    }
}
