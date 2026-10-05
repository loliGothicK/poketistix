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
    pub active_turns: u16,
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
