use crate::sim::abilities::{Condition, get_ability};
use crate::sim::items::get_item;
use pkmn_meta::types::*;
use serde::{Deserialize, Serialize};
use tsify::Tsify;
fn format_type(t: &Type) -> String {
    format!("{:?}", t)
}

use wasm_bindgen::prelude::*;

#[derive(Serialize, Tsify)]
pub struct ConditionJs {
    pub name: String,
    pub has_on_modify_priority: bool,
    pub has_on_modify_atk: bool,
    pub has_on_modify_def: bool,
    pub has_on_modify_spa: bool,
    pub has_on_modify_spd: bool,
    pub has_on_base_power: bool,
    pub boosts_spa: Option<i32>,
}

#[derive(Serialize, Deserialize)]
pub struct PokemonState {
    pub species: String,
    pub ability: Option<String>,
    pub item: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct BattleState {
    pub p1: PokemonState,
    pub p2: PokemonState,
}

fn side_data(side: &crate::sim::battle::Side) -> SideData {
    SideData {
        tailwind: side.is_tailwind(),
        tailwind_turns: side.tailwind_turns(),
        aurora_veil_turns: side.aurora_veil_turns,
        reflect_turns: side.reflect_turns,
        lightscreen_turns: side.lightscreen_turns,
        safeguard_turns: side.safeguard_turns,
        spikes: side.spikes,
        toxic_spikes: side.toxic_spikes,
        stealth_rock: side.stealth_rock,
        sticky_web: side.sticky_web,
        mega_used: side.mega_used,
        active: side.active.iter().map(convert_pokemon).collect(),
        team: side.team.iter().map(convert_pokemon).collect(),
    }
}

fn battle_logs_to_ts(
    battle: &crate::sim::battle::Battle,
) -> Result<tsify::Ts<crate::sim::log::BattleLogs>, wasm_bindgen::JsError> {
    let events = battle
        .log
        .iter()
        .cloned()
        .map(crate::sim::log::BattleLogEvent::new)
        .collect();
    let logs = crate::sim::log::BattleLogs { events };
    tsify::Ts::from_rust(&logs).map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))
}

impl From<Condition> for ConditionJs {
    fn from(cond: Condition) -> Self {
        ConditionJs {
            name: cond.name,
            has_on_modify_priority: cond.has_on_modify_priority,
            has_on_modify_atk: cond.has_on_modify_atk,
            has_on_modify_def: cond.has_on_modify_def,
            has_on_modify_spa: cond.has_on_modify_spa,
            has_on_modify_spd: cond.has_on_modify_spd,
            has_on_base_power: cond.has_on_base_power,
            boosts_spa: cond.boosts_spa,
        }
    }
}

fn condition_to_ts(cond: Option<Condition>) -> Option<tsify::Ts<ConditionJs>> {
    cond.map(|c| tsify::Ts::from_rust(&ConditionJs::from(c)).unwrap())
}

#[wasm_bindgen]
pub fn check_ability(id: &str) -> Option<tsify::Ts<ConditionJs>> {
    condition_to_ts(get_ability(id))
}

#[wasm_bindgen]
pub fn check_item(id: &str) -> Option<tsify::Ts<ConditionJs>> {
    condition_to_ts(get_item(id))
}
use crate::sim::moves_effects::get_move_effect;

#[wasm_bindgen]
pub fn check_move_effect(id: &str) -> Option<tsify::Ts<ConditionJs>> {
    if let Some(cond) = get_move_effect(id) {
        let js = ConditionJs {
            name: cond.name().to_owned(),
            has_on_modify_priority: cond.has_on_modify_priority().to_owned(),
            has_on_modify_atk: cond.has_on_modify_atk().to_owned(),
            has_on_modify_def: cond.has_on_modify_def().to_owned(),
            has_on_modify_spa: cond.has_on_modify_spa().to_owned(),
            has_on_modify_spd: cond.has_on_modify_spd().to_owned(),
            has_on_base_power: cond.has_on_base_power().to_owned(),
            boosts_spa: None,
        };
        Some(tsify::Ts::from_rust(&js).unwrap())
    } else {
        None
    }
}
pub use pkmn_meta::Boosts;

#[derive(Serialize, Tsify, Clone)]
pub struct PokemonData {
    pub ident: String,
    pub species: String,
    pub hp: i32,
    pub maxhp: i32,
    pub speed: i32,
    pub attack: i32,
    pub defense: i32,
    pub sp_attack: i32,
    pub sp_defense: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ability: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    pub type1: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub type2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub added_type: Option<String>,
    pub boosts: Boosts,
    pub volatile_status: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_move_used: Option<String>,
    pub consecutive_move_counter: u8,
    pub pp_used: std::collections::HashMap<String, u8>,
    pub taunt_turns: u8,
    pub is_mega: bool,
    #[serde(default)]
    pub moves: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evs: Option<PokemonEvs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nature: Option<Nature>,
    #[serde(default)]
    pub substitute_hp: i32,
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
    pub evs: Option<PokemonEvs>,
    pub nature: Option<Nature>,
    pub substitute_hp: i32,
}

impl Default for PokemonData {
    fn default() -> Self {
        PokemonData {
            ident: "p1a".to_string(),
            species: "pikachu".to_string(),
            hp: 100,
            maxhp: 100,
            speed: 100,
            attack: 100,
            defense: 100,
            sp_attack: 100,
            sp_defense: 100,
            item: None,
            ability: None,
            status: None,
            type1: "Normal".to_string(),
            type2: None,
            added_type: None,
            boosts: Boosts::default(),
            volatile_status: vec![],
            last_move_used: None,
            consecutive_move_counter: 0,
            pp_used: std::collections::HashMap::new(),
            taunt_turns: 0,
            is_mega: false,
            moves: vec![],
            evs: None,
            nature: None,
            substitute_hp: 0,
        }
    }
}

#[derive(Serialize, Tsify, Default)]
pub struct SideData {
    pub active: Vec<PokemonData>,
    pub team: Vec<PokemonData>,
    pub tailwind: bool,
    pub tailwind_turns: u8,
    pub aurora_veil_turns: u8,
    pub reflect_turns: u8,
    pub lightscreen_turns: u8,
    pub safeguard_turns: u8,
    pub spikes: u8,
    pub toxic_spikes: u8,
    pub stealth_rock: bool,
    pub sticky_web: bool,
    pub mega_used: bool,
}

#[derive(Serialize, Tsify, Default)]
pub struct FullBattleState {
    pub turn_state: String,
    pub p1: SideData,
    pub p2: SideData,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weather: Option<String>,
    pub weather_turns_left: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terrain: Option<String>,
    pub terrain_turns_left: u8,
    pub trick_room: bool,
    #[serde(default)]
    pub trick_room_turns_left: u8,
    pub gravity_turns_left: u8,
    pub fairy_lock_turns: u8,
}

#[derive(Deserialize, Tsify, Default)]
#[serde(default)]
pub struct InputSideData {
    pub active: Vec<InputPokemonData>,
    pub team: Vec<InputPokemonData>,
    pub tailwind: bool,
    pub tailwind_turns: u8,
    pub aurora_veil_turns: u8,
    pub reflect_turns: u8,
    pub lightscreen_turns: u8,
    pub safeguard_turns: u8,
    pub spikes: u8,
    pub toxic_spikes: u8,
    pub stealth_rock: bool,
    pub sticky_web: bool,
    pub mega_used: bool,
}

#[derive(Deserialize, Tsify, Default)]
#[serde(default)]
pub struct InputFullBattleState {
    pub p1: InputSideData,
    pub p2: InputSideData,
    #[serde(default)]
    pub weather: Option<String>,
    #[serde(default)]
    pub weather_turns_left: u8,
    #[serde(default)]
    pub terrain: Option<String>,
    #[serde(default)]
    pub terrain_turns_left: u8,
    #[serde(default)]
    pub trick_room: bool,
    #[serde(default)]
    pub trick_room_turns_left: u8,
    #[serde(default)]
    pub gravity_turns_left: u8,
    #[serde(default)]
    pub fairy_lock_turns: u8,
}

impl From<InputPokemonData> for PokemonData {
    fn from(input: InputPokemonData) -> Self {
        Self {
            ident: input.ident,
            species: input.species,
            hp: input.hp,
            maxhp: input.maxhp,
            speed: input.speed,
            attack: input.attack,
            defense: input.defense,
            sp_attack: input.sp_attack,
            sp_defense: input.sp_defense,
            item: input.item,
            ability: input.ability,
            status: input.status,
            type1: input.type1,
            type2: input.type2,
            added_type: input.added_type,
            boosts: input.boosts,
            volatile_status: input.volatile_status,
            last_move_used: input.last_move_used,
            consecutive_move_counter: input.consecutive_move_counter,
            pp_used: input.pp_used,
            taunt_turns: input.taunt_turns,
            is_mega: input.is_mega,
            moves: input.moves,
            evs: input.evs,
            nature: input.nature,
            substitute_hp: input.substitute_hp,
        }
    }
}

impl From<InputSideData> for SideData {
    fn from(input: InputSideData) -> Self {
        Self {
            active: input.active.into_iter().map(Into::into).collect(),
            team: input.team.into_iter().map(Into::into).collect(),
            tailwind: input.tailwind,
            tailwind_turns: input.tailwind_turns,
            aurora_veil_turns: input.aurora_veil_turns,
            reflect_turns: input.reflect_turns,
            lightscreen_turns: input.lightscreen_turns,
            safeguard_turns: input.safeguard_turns,
            spikes: input.spikes,
            toxic_spikes: input.toxic_spikes,
            stealth_rock: input.stealth_rock,
            sticky_web: input.sticky_web,
            mega_used: input.mega_used,
        }
    }
}

impl From<InputFullBattleState> for FullBattleState {
    fn from(input: InputFullBattleState) -> Self {
        Self {
            turn_state: "Ready".to_string(),
            p1: input.p1.into(),
            p2: input.p2.into(),
            weather: input.weather,
            weather_turns_left: input.weather_turns_left,
            terrain: input.terrain,
            terrain_turns_left: input.terrain_turns_left,
            trick_room: input.trick_room,
            trick_room_turns_left: input.trick_room_turns_left,
            gravity_turns_left: input.gravity_turns_left,
            fairy_lock_turns: input.fairy_lock_turns,
        }
    }
}

#[derive(Serialize, Deserialize, Tsify)]
pub struct TurnActions {
    pub p1a: String,
    pub p1a_target: i8,
    #[serde(default)]
    pub p1a_mega: bool,
    pub p1b: String,
    pub p1b_target: i8,
    #[serde(default)]
    pub p1b_mega: bool,
    pub p2a: String,
    pub p2a_target: i8,
    #[serde(default)]
    pub p2a_mega: bool,
    pub p2b: String,
    pub p2b_target: i8,
    #[serde(default)]
    pub p2b_mega: bool,
}
#[derive(Serialize, Deserialize, Tsify, Clone, Debug)]
pub struct SlotActionJs {
    pub choice: String,
    pub target: i8,
    pub mega: bool,
}

#[derive(Serialize, Deserialize, Tsify, Clone, Debug)]
pub struct PlayerActionJs {
    pub slot_a: SlotActionJs,
    pub slot_b: SlotActionJs,
}

#[derive(Serialize, Deserialize, Tsify, Clone, Debug)]
pub struct AiSearchResultJs {
    pub best_action: PlayerActionJs,
    pub win_rate: f64,
    pub total_simulations: usize,
}

#[derive(Serialize, Deserialize, Tsify, Clone, Debug)]
pub struct LegalActionsJs {
    pub actions: Vec<PlayerActionJs>,
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

#[derive(Deserialize, Tsify, Clone, Debug)]
pub struct Config {
    #[serde(default)]
    #[tsify(optional, type = "'min' | 'max'")]
    pub damage_roll: Option<String>,
    #[serde(default)]
    #[tsify(optional, type = "'always' | 'never'")]
    pub crits: Option<String>,
    #[serde(default)]
    #[tsify(optional, type = "'always' | 'never'")]
    pub accuracy: Option<String>,
    #[serde(default)]
    #[tsify(optional)]
    pub secondary: Option<String>,
    #[serde(default)]
    #[tsify(optional, type = "string[]")]
    pub stat_choices: Option<Vec<String>>,
}

#[wasm_bindgen]
pub struct Simulator {
    battle: crate::sim::battle::Battle,
}

#[wasm_bindgen]
impl Simulator {
    #[wasm_bindgen(constructor)]
    pub fn new(config: Option<tsify::Ts<Config>>) -> Result<Simulator, wasm_bindgen::JsError> {
        let mut battle = crate::sim::battle::Battle::new();
        if let Some(c) = config {
            battle.rng_config = Some(c.to_rust().unwrap());
        }
        Ok(Self { battle })
    }

    #[wasm_bindgen]
    pub fn set_state(
        &mut self,
        state: tsify::Ts<InputFullBattleState>,
    ) -> Result<(), wasm_bindgen::JsError> {
        let state: InputFullBattleState = state.to_rust().unwrap();
        self.battle.p1.active.clear();
        self.battle.p2.active.clear();
        self.battle.p1.team.clear();
        self.battle.p2.team.clear();

        self.battle.weather = state
            .weather
            .clone()
            .filter(|s| !s.is_empty())
            .and_then(|s| std::str::FromStr::from_str(&s).ok());
        self.battle.weather_turns_left = state.weather_turns_left;
        self.battle.terrain = state
            .terrain
            .clone()
            .filter(|s| !s.is_empty())
            .and_then(|s| std::str::FromStr::from_str(&s).ok());
        self.battle.terrain_turns_left = state.terrain_turns_left;
        self.battle.trick_room = if state.trick_room {
            std::num::NonZeroU8::new(if state.trick_room_turns_left > 0 {
                state.trick_room_turns_left
            } else {
                5
            })
        } else {
            None
        };
        self.battle.gravity_turns_left = state.gravity_turns_left;
        self.battle.fairy_lock_turns = state.fairy_lock_turns;
        self.battle.p1.tailwind = if state.p1.tailwind {
            std::num::NonZeroU8::new(if state.p1.tailwind_turns > 0 {
                state.p1.tailwind_turns
            } else {
                4
            })
        } else {
            None
        };
        self.battle.p1.aurora_veil_turns = state.p1.aurora_veil_turns;
        self.battle.p1.reflect_turns = state.p1.reflect_turns;
        self.battle.p1.lightscreen_turns = state.p1.lightscreen_turns;
        self.battle.p1.safeguard_turns = state.p1.safeguard_turns;
        self.battle.p1.spikes = state.p1.spikes;
        self.battle.p1.toxic_spikes = state.p1.toxic_spikes;
        self.battle.p1.stealth_rock = state.p1.stealth_rock;
        self.battle.p1.sticky_web = state.p1.sticky_web;
        self.battle.p1.mega_used = state.p1.mega_used;
        self.battle.p2.tailwind = if state.p2.tailwind {
            std::num::NonZeroU8::new(if state.p2.tailwind_turns > 0 {
                state.p2.tailwind_turns
            } else {
                4
            })
        } else {
            None
        };
        self.battle.p2.aurora_veil_turns = state.p2.aurora_veil_turns;
        self.battle.p2.reflect_turns = state.p2.reflect_turns;
        self.battle.p2.lightscreen_turns = state.p2.lightscreen_turns;
        self.battle.p2.safeguard_turns = state.p2.safeguard_turns;
        self.battle.p2.spikes = state.p2.spikes;
        self.battle.p2.toxic_spikes = state.p2.toxic_spikes;
        self.battle.p2.stealth_rock = state.p2.stealth_rock;
        self.battle.p2.sticky_web = state.p2.sticky_web;
        self.battle.p2.mega_used = state.p2.mega_used;

        for p in &state.p1.team {
            self.battle.p1.team.push(build_pokemon(p));
        }
        for p in &state.p1.active {
            self.battle.p1.active.push(build_pokemon(p));
        }
        for p in &state.p2.team {
            self.battle.p2.team.push(build_pokemon(p));
        }
        for p in &state.p2.active {
            self.battle.p2.active.push(build_pokemon(p));
        }
        Ok(())
    }

    #[wasm_bindgen]
    pub fn start_battle(&mut self) -> Result<(), wasm_bindgen::JsError> {
        self.battle.run_switch_in(1, 0);
        self.battle.run_switch_in(1, 1);
        self.battle.run_switch_in(2, 0);
        self.battle.run_switch_in(2, 1);
        self.battle.update_forecast();
        Ok(())
    }

    #[wasm_bindgen]
    pub fn submit_switch_choice(
        &mut self,
        player: u8,
        active_slot: usize,
        team_slot: usize,
    ) -> Result<tsify::Ts<crate::sim::log::BattleLogs>, wasm_bindgen::JsError> {
        self.battle.log.clear();

        let pass_stats = if let crate::sim::battle::TurnState::WaitingForSwitch {
            player: p,
            pass_stats: ps,
        } = self.battle.turn_state
        {
            if p != player {
                return Err(wasm_bindgen::JsError::new("Not waiting for this switch"));
            }
            ps
        } else {
            return Err(wasm_bindgen::JsError::new("Not waiting for a switch"));
        };

        let side = if player == 1 {
            &mut self.battle.p1
        } else {
            &mut self.battle.p2
        };
        if active_slot >= side.active.len() || team_slot >= side.team.len() {
            return Err(wasm_bindgen::JsError::new("Invalid switch slot"));
        }

        let mut old = side.active.remove(active_slot);
        let mut new = side.team.remove(team_slot);

        if pass_stats {
            new.boosts = old.boosts.clone();
            // We should also pass specific volatile statuses here later
        }

        // Clear boosts of old pokemon entering the bench
        old.boosts = pkmn_meta::Boosts::default();
        old.volatile_status.clear();
        old.active_turns = 0;

        if old.species == "aegislash-blade" {
            old.species = "aegislash-shield".to_string();
            old.swap_offensive_defensive_stats();
        }

        side.active.insert(active_slot, new);
        side.team.insert(team_slot, old);

        self.battle.run_switch_in(player, active_slot);
        self.battle.turn_state = crate::sim::battle::TurnState::Ready;

        crate::sim::turn::process_turn_actions(&mut self.battle)
            .map_err(|e| wasm_bindgen::JsError::new(&e))?;

        battle_logs_to_ts(&self.battle)
    }

    #[wasm_bindgen]
    pub fn get_state(&self) -> Result<tsify::Ts<FullBattleState>, wasm_bindgen::JsError> {
        let out = FullBattleState {
            turn_state: match self.battle.turn_state {
                crate::sim::battle::TurnState::Ready => "Ready".to_string(),
                crate::sim::battle::TurnState::WaitingForSwitch { .. } => {
                    "WaitingForSwitch".to_string()
                }
            },
            p1: side_data(&self.battle.p1),
            p2: side_data(&self.battle.p2),
            weather: self.battle.weather.as_ref().map(|w| w.to_string()),
            weather_turns_left: self.battle.weather_turns_left,
            terrain: self.battle.terrain.as_ref().map(|t| t.to_string()),
            terrain_turns_left: self.battle.terrain_turns_left,
            trick_room: self.battle.is_trick_room(),
            trick_room_turns_left: self.battle.trick_room_turns_left(),
            gravity_turns_left: self.battle.gravity_turns_left,
            fairy_lock_turns: self.battle.fairy_lock_turns,
        };

        Ok(tsify::Ts::from_rust(&out)?)
    }

    #[wasm_bindgen]
    pub fn run_turn(
        &mut self,
        actions: tsify::Ts<TurnActions>,
        config: Option<tsify::Ts<Config>>,
    ) -> Result<tsify::Ts<crate::sim::log::BattleLogs>, wasm_bindgen::JsError> {
        let actions = actions.to_rust().unwrap();
        let config = config.map(|c| c.to_rust().unwrap());
        let mut errors = Vec::new();

        self.battle.log.clear();

        let parse_move_choice = |raw: &str, explicit_mega: bool| -> (String, bool) {
            let s = raw.trim();
            if let Some(rest) = s.strip_suffix(" mega") {
                (rest.trim().to_string(), true)
            } else if let Some(rest) = s.strip_suffix(" megax") {
                (rest.trim().to_string(), true)
            } else if let Some(rest) = s.strip_suffix(" megay") {
                (rest.trim().to_string(), true)
            } else {
                (s.to_string(), explicit_mega)
            }
        };

        let (p1a_move, p1a_mega) = parse_move_choice(&actions.p1a, actions.p1a_mega);
        let (p1b_move, p1b_mega) = parse_move_choice(&actions.p1b, actions.p1b_mega);
        let (p2a_move, p2a_mega) = parse_move_choice(&actions.p2a, actions.p2a_mega);
        let (p2b_move, p2b_mega) = parse_move_choice(&actions.p2b, actions.p2b_mega);

        let mut check_move = |m: &str| {
            if !m.is_empty()
                && m != "pass"
                && m != "switch"
                && m != "recharge"
                && pkmn_meta::move_meta::get_move_meta(m).is_none()
            {
                errors.push(format!("UNKNOWN_MOVE_ERROR: [{}]", m));
            }
        };
        check_move(&p1a_move);
        check_move(&p1b_move);
        check_move(&p2a_move);
        check_move(&p2b_move);

        for p in self
            .battle
            .p1
            .active
            .iter()
            .chain(self.battle.p2.active.iter())
        {
            if !p.species.is_empty() && !pkmn_meta::pokemon_meta::is_valid_pokemon(&p.species) {
                errors.push(format!("Pokemon not found in database: {}", p.species));
            }
            if let Some(ref ability) = p.ability
                && !ability.is_empty()
                && pkmn_meta::ability_meta::get_ability_meta(ability).is_none()
            {
                errors.push(format!("Ability not found in database: {}", ability));
            }
            if let Some(ref item_id) = p.item
                && pkmn_meta::item_meta::get_item_meta(item_id).is_none()
            {
                errors.push(format!("Item not found in database: {}", item_id.as_ref()));
            }
        }

        if !errors.is_empty() {
            return Err(wasm_bindgen::JsError::new(&errors.join(", ")));
        }

        let rng_config = config.or(self.battle.rng_config.clone());

        self.battle
            .execute_turn(
                &p1a_move,
                actions.p1a_target,
                p1a_mega,
                &p1b_move,
                actions.p1b_target,
                p1b_mega,
                &p2a_move,
                actions.p2a_target,
                p2a_mega,
                &p2b_move,
                actions.p2b_target,
                p2b_mega,
                rng_config,
            )
            .map_err(|e| wasm_bindgen::JsError::new(&e))?;

        battle_logs_to_ts(&self.battle)
    }

    #[wasm_bindgen]
    pub fn get_legal_actions(
        &self,
        player: u8,
    ) -> Result<tsify::Ts<LegalActionsJs>, wasm_bindgen::JsError> {
        let actions = crate::solver::get_player_actions(&self.battle, player);
        let js_actions: Vec<PlayerActionJs> = actions
            .into_iter()
            .map(|act| PlayerActionJs {
                slot_a: SlotActionJs {
                    choice: act.a.choice,
                    target: act.a.target,
                    mega: act.a.mega,
                },
                slot_b: SlotActionJs {
                    choice: act.b.choice,
                    target: act.b.target,
                    mega: act.b.mega,
                },
            })
            .collect();
        let out = LegalActionsJs {
            actions: js_actions,
        };
        Ok(tsify::Ts::from_rust(&out)?)
    }

    #[wasm_bindgen]
    pub fn evaluate_state(&self, player: u8) -> f64 {
        crate::solver::evaluate_for_player(&self.battle, player)
    }

    #[wasm_bindgen]
    pub fn search_best_action(
        &self,
        player: u8,
        iterations: Option<usize>,
    ) -> Result<tsify::Ts<AiSearchResultJs>, wasm_bindgen::JsError> {
        let mut config = crate::solver::IsmctsConfig::default();
        if let Some(iters) = iterations {
            config.iterations = iters;
        }
        let ismcts = crate::solver::Ismcts::new(config);
        let result = ismcts.search(&self.battle, player);

        let out = AiSearchResultJs {
            best_action: PlayerActionJs {
                slot_a: SlotActionJs {
                    choice: result.best_action.a.choice,
                    target: result.best_action.a.target,
                    mega: result.best_action.a.mega,
                },
                slot_b: SlotActionJs {
                    choice: result.best_action.b.choice,
                    target: result.best_action.b.target,
                    mega: result.best_action.b.mega,
                },
            },
            win_rate: result.win_rate,
            total_simulations: result.total_simulations,
        };

        Ok(tsify::Ts::from_rust(&out)?)
    }

    #[wasm_bindgen]
    pub fn analyze_position(
        &self,
        player: u8,
        iterations: Option<usize>,
    ) -> Result<tsify::Ts<PositionAnalysisJs>, wasm_bindgen::JsError> {
        let mut config = crate::solver::IsmctsConfig::default();
        if let Some(iters) = iterations {
            config.iterations = iters;
        }
        let ismcts = crate::solver::Ismcts::new(config);
        let analysis = ismcts.analyze(&self.battle, player);

        let convert_action = |act: &crate::solver::PlayerAction| PlayerActionJs {
            slot_a: SlotActionJs {
                choice: act.a.choice.clone(),
                target: act.a.target,
                mega: act.a.mega,
            },
            slot_b: SlotActionJs {
                choice: act.b.choice.clone(),
                target: act.b.target,
                mega: act.b.mega,
            },
        };

        let candidates = analysis
            .candidates
            .into_iter()
            .map(|cand| CandidateAnalysisJs {
                rank: cand.rank,
                action: convert_action(&cand.action),
                win_rate: cand.win_rate,
                visits: cand.visits,
                pv: cand
                    .pv
                    .into_iter()
                    .map(|step| PvStepJs {
                        turn: step.turn,
                        p1_action: convert_action(&step.p1_action),
                        p2_action: convert_action(&step.p2_action),
                    })
                    .collect(),
                is_mate: cand.is_mate,
            })
            .collect();

        let out = PositionAnalysisJs {
            current_eval: analysis.current_eval,
            total_simulations: analysis.total_simulations,
            candidates,
            best_action: convert_action(&analysis.best_action),
        };

        Ok(tsify::Ts::from_rust(&out)?)
    }
}

pub use pkmn_meta::types::{Nature, PokemonEvs};

#[wasm_bindgen]
pub fn create_pokemon(
    ident: String,
    species: String,
    evs: tsify::Ts<PokemonEvs>,
    nature: Option<tsify::Ts<Nature>>,
) -> Result<tsify::Ts<PokemonData>, wasm_bindgen::JsError> {
    let evs = evs
        .to_rust()
        .map_err(|e| wasm_bindgen::JsError::new(&format!("{}", e)))?;
    let nature_opt = nature.map(|n| n.to_rust().unwrap());

    let meta = pkmn_meta::pokemon_meta::get_pokemon_meta(&species)
        .ok_or_else(|| wasm_bindgen::JsError::new(&format!("Unknown species: {}", species)))?;

    // Math for Level 50 and 31 IVs:
    // Base stat at 0 EVs:
    // HP = floor((2 * Base + 31) * 50 / 100) + 50 + 10 = Base + 75
    // Other = floor((2 * Base + 31) * 50 / 100) + 5 = Base + 20

    let base_hp = meta.base_stats()[0] + 75;
    let base_atk = meta.base_stats()[1] + 20;
    let base_def = meta.base_stats()[2] + 20;
    let base_spa = meta.base_stats()[3] + 20;
    let base_spd = meta.base_stats()[4] + 20;
    let base_spe = meta.base_stats()[5] + 20;

    let pre_nature_hp = base_hp + evs.hp.unwrap_or(0) as u32;
    let pre_nature_atk = base_atk + evs.atk.unwrap_or(0) as u32;
    let pre_nature_def = base_def + evs.def.unwrap_or(0) as u32;
    let pre_nature_spa = base_spa + evs.spa.unwrap_or(0) as u32;
    let pre_nature_spd = base_spd + evs.spd.unwrap_or(0) as u32;
    let pre_nature_spe = base_spe + evs.spe.unwrap_or(0) as u32;

    let mut hp = pre_nature_hp as i32;
    if species.to_lowercase().replace("-", "") == "shedinja" {
        hp = 1;
    }

    let apply_nature = |val: u32, is_buff: bool, is_nerf: bool| -> i32 {
        let mut stat = val as i32;
        if is_buff {
            stat = (stat * 11) / 10;
        } else if is_nerf {
            stat = (stat * 9) / 10;
        }
        stat
    };

    let nature_enum = nature_opt.unwrap_or(Nature::Hardy);
    let (buff, nerf) = nature_enum.modifiers();

    let atk = apply_nature(pre_nature_atk, buff == 1, nerf == 1);
    let def = apply_nature(pre_nature_def, buff == 2, nerf == 2);
    let spa = apply_nature(pre_nature_spa, buff == 3, nerf == 3);
    let spd = apply_nature(pre_nature_spd, buff == 4, nerf == 4);
    let spe = apply_nature(pre_nature_spe, buff == 5, nerf == 5);

    let data = PokemonData {
        ident,
        species,
        hp,
        maxhp: hp,
        attack: atk,
        defense: def,
        sp_attack: spa,
        sp_defense: spd,
        speed: spe,
        item: None,
        ability: None,
        status: None,
        type1: format!("{:?}", meta.type1()),
        type2: meta.type2().map(|s| format!("{:?}", s)),
        added_type: None,
        boosts: Boosts::default(),
        volatile_status: vec![],
        last_move_used: None,
        consecutive_move_counter: 0,
        pp_used: std::collections::HashMap::new(),
        taunt_turns: 0,
        is_mega: false,
        moves: vec![],
        evs: Some(evs),
        nature: nature_opt,
        substitute_hp: 0,
    };

    Ok(tsify::Ts::from_rust(&data).unwrap())
}

pub fn build_pokemon(p: &InputPokemonData) -> crate::sim::pokemon::Pokemon {
    let parse_type = |t: &str| -> damage_calc::types::Type {
        match t.to_lowercase().as_str() {
            "normal" => damage_calc::types::Type::Normal,
            "fire" => damage_calc::types::Type::Fire,
            "water" => damage_calc::types::Type::Water,
            "electric" => damage_calc::types::Type::Electric,
            "grass" => damage_calc::types::Type::Grass,
            "ice" => damage_calc::types::Type::Ice,
            "fighting" => damage_calc::types::Type::Fighting,
            "poison" => damage_calc::types::Type::Poison,
            "ground" => damage_calc::types::Type::Ground,
            "flying" => damage_calc::types::Type::Flying,
            "psychic" => damage_calc::types::Type::Psychic,
            "bug" => damage_calc::types::Type::Bug,
            "rock" => damage_calc::types::Type::Rock,
            "ghost" => damage_calc::types::Type::Ghost,
            "dragon" => damage_calc::types::Type::Dragon,
            "dark" => damage_calc::types::Type::Dark,
            "steel" => damage_calc::types::Type::Steel,
            "fairy" => damage_calc::types::Type::Fairy,
            _ => damage_calc::types::Type::Normal,
        }
    };
    crate::sim::pokemon::Pokemon {
        ident: p.ident.clone(),
        species: p.species.clone(),
        hp: p.hp.into(),
        maxhp: p.maxhp.into(),
        speed: p.speed.into(),
        attack: p.attack.into(),
        defense: p.defense.into(),
        sp_attack: p.sp_attack.into(),
        sp_defense: p.sp_defense.into(),
        item: p
            .item
            .as_ref()
            .filter(|s| !s.is_empty())
            .and_then(|s| std::str::FromStr::from_str(s).ok()),
        ability: p
            .ability
            .clone()
            .filter(|s| !s.is_empty())
            .map(crate::sim::values::Ability::from),
        status: p
            .status
            .as_ref()
            .filter(|s| !s.is_empty())
            .and_then(|s| std::str::FromStr::from_str(s).ok()),
        weight: pkmn_meta::pokemon_meta::get_pokemon_meta(&p.species)
            .map(|m| *m.weight())
            .unwrap_or(0)
            .into(),
        type1: parse_type(&p.type1),
        type2: p
            .type2
            .as_ref()
            .filter(|t| !t.is_empty())
            .map(|t| parse_type(t)),
        added_type: p
            .added_type
            .as_ref()
            .filter(|t| !t.is_empty())
            .map(|t| parse_type(t)),
        boosts: p.boosts.clone(),
        volatile_status: p
            .volatile_status
            .iter()
            .filter_map(|s| std::str::FromStr::from_str(s).ok())
            .collect(),
        last_move_used: p.last_move_used.clone(),
        consecutive_move_counter: p.consecutive_move_counter,
        pp_used: p.pp_used.clone().into_iter().collect(),
        turn_state: crate::sim::pokemon::PokemonTurnState::default(),
        active_turns: 0,
        tox_counter: if p.status.as_deref() == Some("tox") {
            1
        } else {
            0
        },
        sleep_turns: if p.status.as_deref() == Some("slp") {
            3
        } else {
            0
        },
        eaten_berry: false,
        cud_chew_berry: None,
        cud_chew_counter: 0,
        last_consumed_berry: None,
        disguise_busted: false,
        libero_activated: false,
        partially_trapped_by: None,
        leech_seeded_by: None,
        partially_trapped_turns: 0,
        trapped_by: None,
        disabled_move: None,
        disable_turns: 0,
        encored_move: None,
        encore_turns: 0,
        taunt_turns: p.taunt_turns,
        yawn_turns: 0,
        perish_turns: 0,
        magnet_rise_turns: 0,
        telekinesis_turns: 0,
        syrup_bomb_turns: 0,
        syrup_bomb_source: None,
        uproar_turns: 0,
        locked_move_turns: 0,
        moves: p.moves.clone(),
        is_mega: p.is_mega,
        evs: p.evs.unwrap_or_default(),
        nature: p.nature,
        substitute_hp: p.substitute_hp,
    }
}

fn convert_pokemon(p: &crate::sim::pokemon::Pokemon) -> PokemonData {
    PokemonData {
        ident: p.ident.clone(),
        species: p.species.clone(),
        hp: p.hp.into_inner(),
        maxhp: p.maxhp.into_inner(),
        speed: p.speed.into_inner(),
        attack: p.attack.into_inner(),
        defense: p.defense.into_inner(),
        sp_attack: p.sp_attack.into_inner(),
        sp_defense: p.sp_defense.into_inner(),
        item: p.item.as_ref().map(|i| i.to_string()),
        ability: p.ability.as_ref().map(|a| a.to_string()),
        status: p.status.as_ref().map(|s| s.to_string()),
        type1: format_type(&p.type1),
        type2: p.type2.as_ref().map(format_type),
        added_type: p.added_type.as_ref().map(format_type),
        boosts: p.boosts.clone(),
        volatile_status: p.volatile_status.iter().map(|s| s.to_string()).collect(),
        last_move_used: p.last_move_used.clone(),
        consecutive_move_counter: p.consecutive_move_counter,
        pp_used: p.pp_used.clone().into_iter().collect(),
        taunt_turns: p.taunt_turns,
        is_mega: p.is_mega,
        moves: p.moves.clone(),
        evs: Some(p.evs),
        nature: p.nature,
        substitute_hp: p.substitute_hp,
    }
}

#[wasm_bindgen]
pub fn get_kifu_snapshot(
    kifu: tsify::Ts<crate::kifu::BattleKifu>,
    turn_index: usize,
) -> Result<tsify::Ts<crate::kifu::TurnSnapshotView>, wasm_bindgen::JsError> {
    let kifu_rust: crate::kifu::BattleKifu = kifu
        .to_rust()
        .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
    let belief = crate::solver::belief::BeliefState::from_kifu_up_to_turn(&kifu_rust, turn_index);
    let snapshot = belief.to_snapshot_view();
    tsify::Ts::from_rust(&snapshot).map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn analyze_kifu_turn(
    kifu: tsify::Ts<crate::kifu::BattleKifu>,
    turn_index: usize,
    iterations: Option<usize>,
) -> Result<tsify::Ts<crate::kifu::TurnEvaluationReport>, wasm_bindgen::JsError> {
    let kifu_rust: crate::kifu::BattleKifu = kifu
        .to_rust()
        .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
    let mut config = crate::solver::IsmctsConfig::default();
    if let Some(iters) = iterations {
        config.iterations = iters;
    }
    let ismcts = crate::solver::Ismcts::new(config);
    let report = ismcts.evaluate_kifu_turn(&kifu_rust, turn_index);
    tsify::Ts::from_rust(&report).map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))
}
