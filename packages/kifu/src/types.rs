use serde::{Deserialize, Serialize};
use tsify::Tsify;

pub use pkmn_meta::Boosts;
pub use pkmn_meta::types::{Nature, PokemonEvs};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, Tsify)]
pub struct PokemonIdent {
    pub player: u8,
    pub slot: usize,
}

impl PokemonIdent {
    pub const P1A: Self = Self { player: 1, slot: 0 };
    pub const P1B: Self = Self { player: 1, slot: 1 };
    pub const P2A: Self = Self { player: 2, slot: 0 };
    pub const P2B: Self = Self { player: 2, slot: 1 };
}

impl From<&str> for PokemonIdent {
    fn from(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "p1b" => Self::P1B,
            "p2a" => Self::P2A,
            "p2b" => Self::P2B,
            _ => Self::P1A,
        }
    }
}

impl std::fmt::Display for PokemonIdent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let p = if self.player == 1 { "p1" } else { "p2" };
        let s = if self.slot == 0 { "a" } else { "b" };
        write!(f, "{}{}", p, s)
    }
}

#[derive(Serialize, Deserialize, Tsify, Clone, Debug, Default, PartialEq, Eq)]
pub struct SlotActionJs {
    pub choice: String,
    pub target: i8,
    pub mega: bool,
}

#[derive(Serialize, Deserialize, Tsify, Clone, Debug, Default, PartialEq, Eq)]
pub struct PlayerActionJs {
    pub slot_a: SlotActionJs,
    pub slot_b: SlotActionJs,
}

#[derive(Serialize, Deserialize, Tsify, Clone, Debug, Default)]
#[serde(default)]
pub struct InputPokemonData {
    pub ident: String,
    pub species: String,
    pub hp: i32,
    pub maxhp: i32,
    pub speed: i32,
    pub attack: i32,
    pub defense: i32,
    pub sp_attack: i32,
    pub sp_defense: i32,
    pub item: Option<String>,
    pub ability: Option<String>,
    pub status: Option<String>,
    pub type1: String,
    pub type2: Option<String>,
    pub added_type: Option<String>,
    pub boosts: Boosts,
    pub volatile_status: Vec<String>,
    pub last_move_used: Option<String>,
    pub consecutive_move_counter: u8,
    pub pp_used: std::collections::HashMap<String, u8>,
    pub taunt_turns: u8,
    pub moves: Vec<String>,
    pub is_mega: bool,
    #[serde(default)]
    pub substitute_hp: i32,
    pub evs: Option<PokemonEvs>,
    pub nature: Option<Nature>,
}

#[derive(Serialize, Deserialize, Tsify, Clone, Debug)]
pub struct PvStepJs {
    pub turn: usize,
    pub p1_action: PlayerActionJs,
    pub p2_action: PlayerActionJs,
}

#[derive(Serialize, Deserialize, Tsify, Clone, Debug)]
pub struct CandidateAnalysisJs {
    pub rank: usize,
    pub action: PlayerActionJs,
    pub win_rate: f64,
    pub visits: usize,
    pub pv: Vec<PvStepJs>,
    pub is_mate: bool,
}

#[derive(Serialize, Deserialize, Tsify, Clone, Debug)]
pub struct PositionAnalysisJs {
    pub current_eval: f64,
    pub total_simulations: usize,
    pub candidates: Vec<CandidateAnalysisJs>,
    pub best_action: PlayerActionJs,
}
