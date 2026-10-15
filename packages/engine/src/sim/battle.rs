use pkmn_meta::types::*;
use typed_builder::TypedBuilder;

pub use crate::sim::log::*;
pub use crate::sim::pokemon::*;
pub use crate::sim::values::*;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EventId {
    BeforeApplyAddedType,
    AfterApplyAddedType,
    BeforeApplyVolatile,
    AfterApplyVolatile,
    BeforeTakeDamage,
    AfterTakeDamage,
    BeforeApplyStatus,
    AfterApplyStatus,
    BeforeConsumeItem,
    AfterConsumeItem,
    AfterStatChange,
    EndOfTurn,
}

#[derive(TypedBuilder, Clone, Debug)]
pub struct EventContext {
    pub target: PokemonIdent,
    #[builder(default)]
    pub source: Option<PokemonIdent>,
    #[builder(default)]
    pub string_val: String,
    #[builder(default)]
    pub volatile_status_val: Option<VolatileStatus>,
    #[builder(default)]
    pub status_val: Option<Status>,
    #[builder(default)]
    pub num_val: i32,
    #[builder(default)]
    pub type_val: Option<Type>,
    #[builder(default)]
    pub canceled: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stat {
    Atk,
    Def,
    Spa,
    Spd,
    Spe,
    Accuracy,
    Evasion,
}

#[derive(Clone, Debug, Default)]
pub struct Side {
    pub active: Vec<Pokemon>,
    pub team: Vec<Pokemon>,
    pub tailwind: Option<std::num::NonZeroU8>,
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

impl Side {
    #[inline]
    pub fn is_tailwind(&self) -> bool {
        self.tailwind.is_some()
    }

    #[inline]
    pub fn tailwind_turns(&self) -> u8 {
        self.tailwind.map_or(0, |t| t.get())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TurnState {
    Ready,
    WaitingForSwitch { player: u8, pass_stats: bool },
}

#[derive(Clone, Debug)]
pub struct FutureSightAttack {
    pub target: PokemonIdent,
    pub damage: i32,
    pub turns_left: u8,
}

#[derive(Clone, Debug)]
pub struct WishEffect {
    pub target: PokemonIdent,
    pub heal_amount: i32,
    pub turns_left: u8,
}

#[derive(Clone, Debug)]
pub struct Battle {
    pub turn_state: TurnState,
    pub p1: Side,
    pub p2: Side,
    pub log: Vec<BattleLog>,
    pub weather: Option<Weather>,
    pub weather_turns_left: u8,
    pub terrain: Option<Terrain>,
    pub terrain_turns_left: u8,
    pub trick_room: Option<std::num::NonZeroU8>,
    pub magic_room_turns_left: u8,
    pub wonder_room_turns_left: u8,
    pub gravity_turns_left: u8,
    pub fairy_lock_turns: u8,
    pub global_last_move_used: Option<String>,
    pub rng_config: Option<crate::wasm_api::Config>,
    pub event_queue: std::collections::VecDeque<(EventId, EventContext)>,
    pub turn_actions: Vec<crate::sim::action::Action>,
    pub future_sight_attacks: Vec<FutureSightAttack>,
    pub wish_effects: Vec<WishEffect>,
}

impl Default for Battle {
    fn default() -> Self {
        Self::new()
    }
}

impl Battle {
    pub fn get_pokemon(&self, ident: PokemonIdent) -> Option<&Pokemon> {
        if ident.player == 1 {
            self.p1.active.get(ident.slot)
        } else {
            self.p2.active.get(ident.slot)
        }
    }

    /// Current and max HP of the pokemon, or (0, 0) if it is not on the field.
    pub fn hp_and_max(
        &self,
        ident: PokemonIdent,
    ) -> (crate::sim::values::Hp, crate::sim::values::MaxHp) {
        self.get_pokemon(ident)
            .map(|p| (p.hp, p.maxhp))
            .unwrap_or((0.into(), 0.into()))
    }

    #[inline]
    pub fn is_trick_room(&self) -> bool {
        self.trick_room.is_some()
    }

    #[inline]
    pub fn trick_room_turns_left(&self) -> u8 {
        self.trick_room.map_or(0, |t| t.get())
    }

    pub fn get_pokemon_mut(&mut self, ident: PokemonIdent) -> Option<&mut Pokemon> {
        if ident.player == 1 {
            self.p1.active.get_mut(ident.slot)
        } else {
            self.p2.active.get_mut(ident.slot)
        }
    }

    pub fn all_active_pokemon(&self) -> Vec<(PokemonIdent, &Pokemon)> {
        let mut result = Vec::new();
        for (i, p) in self.p1.active.iter().enumerate() {
            if p.hp.into_inner() > 0 {
                result.push((PokemonIdent { player: 1, slot: i }, p));
            }
        }
        for (i, p) in self.p2.active.iter().enumerate() {
            if p.hp.into_inner() > 0 {
                result.push((PokemonIdent { player: 2, slot: i }, p));
            }
        }
        result
    }

    pub fn new() -> Self {
        Self {
            turn_state: TurnState::Ready,
            p1: Side::default(),
            p2: Side::default(),
            log: vec![],
            weather: None,
            weather_turns_left: 0,
            terrain: None,
            terrain_turns_left: 0,
            trick_room: None,
            magic_room_turns_left: 0,
            wonder_room_turns_left: 0,
            gravity_turns_left: 0,
            fairy_lock_turns: 0,
            global_last_move_used: None,
            rng_config: None,
            event_queue: std::collections::VecDeque::new(),
            turn_actions: vec![],
            future_sight_attacks: vec![],
            wish_effects: vec![],
        }
    }

    /// Applies a stat change, handling abilities like Clear Body, Simple, Contrary, Defiant, etc.
    /// Returns true if the stat was successfully changed.
    pub fn apply_stat_change(
        &mut self,
        target_player: u8,
        target_slot: usize,
        stats: Vec<(Stat, i8)>,
        source_player: u8,
        source_effect: Option<&str>,
    ) {
        for (stat, amount) in stats {
            crate::sim::sections::stat::apply_stat_change(
                self,
                target_player,
                target_slot,
                stat,
                amount,
                source_player,
                source_effect,
            );
        }
    }

    pub fn process_event_queue(&mut self) {
        while let Some((event_id, mut ctx)) = self.event_queue.pop_front() {
            self.trigger_event(event_id, &mut ctx);
        }
    }

    pub fn trigger_event(&mut self, event_id: EventId, ctx: &mut EventContext) {
        // [Phase A: Snapshot Active Handlers]
        // We collect all active items and abilities to avoid borrowing `self` during execution.
        let mut active_items = vec![];
        let mut active_abilities = vec![];

        for (i, p) in self.p1.active.iter().enumerate() {
            if p.item.is_some() {
                active_items.push((PokemonIdent { player: 1, slot: i }, p.item));
            }
            if p.ability.is_some() {
                active_abilities.push((PokemonIdent { player: 1, slot: i }, p.ability.clone()));
            }
        }

        for (i, p) in self.p2.active.iter().enumerate() {
            if p.item.is_some() {
                active_items.push((PokemonIdent { player: 2, slot: i }, p.item));
            }
            if p.ability.is_some() {
                active_abilities.push((PokemonIdent { player: 2, slot: i }, p.ability.clone()));
            }
        }

        // [Phase B: Dispatch]
        for (ident, item) in active_items {
            if let Some(item_name) = item {
                crate::sim::items::execute_item(self, ident, item_name.as_ref(), &event_id, ctx);
            }
        }

        for (ident, ability) in active_abilities {
            if let Some(ability_name) = ability {
                crate::sim::abilities::execute_ability(
                    self,
                    ident,
                    ability_name.as_str(),
                    &event_id,
                    ctx,
                );
            }
        }
    }

    pub fn section_apply_added_type(&mut self, target: PokemonIdent, added_type: Type) {
        let mut ctx = EventContext::builder()
            .target(target)
            .type_val(Some(added_type))
            .build();

        self.trigger_event(EventId::BeforeApplyAddedType, &mut ctx);

        if !ctx.canceled {
            if ctx.target.player == 1 {
                if let Some(t) = self.p1.active.get_mut(ctx.target.slot) {
                    t.added_type = ctx.type_val;
                }
            } else {
                if let Some(t) = self.p2.active.get_mut(ctx.target.slot) {
                    t.added_type = ctx.type_val;
                }
            }

            self.trigger_event(EventId::AfterApplyAddedType, &mut ctx);
        }
    }

    pub fn section_apply_volatile(&mut self, target: PokemonIdent, volatile: VolatileStatus) {
        let mut ctx = EventContext::builder()
            .target(target)
            .volatile_status_val(Some(volatile))
            .string_val(volatile.to_string())
            .build();

        self.trigger_event(EventId::BeforeApplyVolatile, &mut ctx);

        if !ctx.canceled {
            let v_val = ctx.volatile_status_val.unwrap();
            if v_val == VolatileStatus::Yawn {
                let side_active = if ctx.target.player == 1 {
                    &self.p1.active
                } else {
                    &self.p2.active
                };
                let has_flower_veil = side_active.iter().any(|p| {
                    p.hp > 0 && p.ability.as_ref().map(|a| a.as_str()) == Some("flowerveil")
                });
                let is_grass = self
                    .get_pokemon(ctx.target)
                    .is_some_and(|p| p.get_types().contains(&Type::Grass));
                let has_sweet_veil = side_active.iter().any(|p| {
                    p.hp > 0 && p.ability.as_ref().map(|a| a.as_str()) == Some("sweetveil")
                });
                let target_ability = self
                    .get_pokemon(ctx.target)
                    .and_then(|p| p.ability.as_ref().map(|a| a.as_str()));
                let has_sleep_immunity =
                    matches!(target_ability, Some("insomnia") | Some("vitalspirit"));
                if has_sleep_immunity {
                    self.log.push(BattleLog::Immune { target: ctx.target });
                    return;
                }
                if (has_flower_veil && is_grass) || has_sweet_veil {
                    return;
                }
            }
            let mut applied = false;

            let side = if ctx.target.player == 1 {
                &mut self.p1
            } else {
                &mut self.p2
            };
            if let Some(t) = side.active.get_mut(ctx.target.slot)
                && !t.volatile_status.contains(&v_val)
            {
                t.volatile_status.push(v_val);
                if v_val == VolatileStatus::Partiallytrapped {
                    t.partially_trapped_turns = 5;
                } else if v_val == VolatileStatus::Yawn {
                    t.yawn_turns = 2;
                } else if v_val == VolatileStatus::Perishsong {
                    t.perish_turns = 3;
                } else if v_val == VolatileStatus::Magnetrise {
                    t.magnet_rise_turns = 5;
                } else if v_val == VolatileStatus::Telekinesis {
                    t.telekinesis_turns = 3;
                } else if v_val == VolatileStatus::Syrupbomb {
                    t.syrup_bomb_turns = 3;
                    t.syrup_bomb_source = ctx.source;
                }
                applied = true;
            }

            if applied && v_val != VolatileStatus::Flinch {
                self.log.push(BattleLog::Start {
                    target: ctx.target,
                    effect: v_val.to_string(),
                });
            }

            self.trigger_event(EventId::AfterApplyVolatile, &mut ctx);
        } else {
            let target_ability = self
                .get_pokemon(ctx.target)
                .and_then(|p| p.ability.as_ref().map(|a| a.as_str()));
            if matches!(
                target_ability,
                Some("owntempo") | Some("oblivious") | Some("innerfocus")
            ) {
                self.log.push(BattleLog::Immune { target: ctx.target });
            }
        }
    }

    pub fn section_take_damage(&mut self, target: PokemonIdent, damage: i32) {
        crate::sim::sections::damage::section_take_damage(self, target, damage);
    }

    pub fn section_heal(&mut self, target: PokemonIdent, heal_amount: Hp) {
        if heal_amount > 0 {
            if let Some(p) = self.get_pokemon(target)
                && p.volatile_status.contains(&VolatileStatus::Healblock)
            {
                return;
            }
            let mut actual_heal = 0;
            if target.player == 1 {
                if let Some(t) = self.p1.active.get_mut(target.slot) {
                    let old_hp = t.hp.into_inner();
                    t.hp = std::cmp::min(
                        t.maxhp.into_inner(),
                        t.hp.into_inner() + heal_amount.into_inner(),
                    )
                    .into();
                    actual_heal = t.hp.into_inner() - old_hp;
                }
            } else {
                if let Some(t) = self.p2.active.get_mut(target.slot) {
                    let old_hp = t.hp.into_inner();
                    t.hp = std::cmp::min(
                        t.maxhp.into_inner(),
                        t.hp.into_inner() + heal_amount.into_inner(),
                    )
                    .into();
                    actual_heal = t.hp.into_inner() - old_hp;
                }
            }

            if actual_heal > 0 {
                self.log.push(BattleLog::Heal {
                    target,
                    amount: actual_heal,
                });
            }
        }
    }

    pub fn section_apply_status(
        &mut self,
        target: PokemonIdent,
        status: Status,
        source: Option<PokemonIdent>,
    ) {
        if let Some(src) = source
            && src != target
        {
            let target_side = if target.player == 1 {
                &self.p1
            } else {
                &self.p2
            };
            let is_infiltrator = self
                .get_pokemon(src)
                .and_then(|p| p.ability.as_ref().map(|a| a.as_str()))
                == Some("infiltrator");
            if target_side.safeguard_turns > 0 && !is_infiltrator {
                self.log.push(BattleLog::Text {
                    message: format!("|-activate|{}|move: Safeguard", target),
                });
                return;
            }

            let side_active = if target.player == 1 {
                &self.p1.active
            } else {
                &self.p2.active
            };
            let has_flower_veil = side_active
                .iter()
                .any(|p| p.hp > 0 && p.ability.as_ref().map(|a| a.as_str()) == Some("flowerveil"));
            let is_grass = self
                .get_pokemon(target)
                .is_some_and(|p| p.get_types().contains(&Type::Grass));
            if has_flower_veil && is_grass {
                return;
            }
        }

        if let Some(target_p) = self.get_pokemon(target) {
            let target_types = target_p.get_types();
            let source_corrosion = source
                .and_then(|src| self.get_pokemon(src))
                .and_then(|p| p.ability.as_ref().map(|a| a.as_str()))
                == Some("corrosion");

            let is_type_immune = match status {
                Status::Poison | Status::Toxic => {
                    !source_corrosion
                        && (target_types.contains(&Type::Poison)
                            || target_types.contains(&Type::Steel))
                }
                _ => false,
            };

            if is_type_immune {
                return;
            }

            if status == Status::Sleep {
                let has_uproar = self
                    .p1
                    .active
                    .iter()
                    .chain(self.p2.active.iter())
                    .any(|p| p.hp > 0 && p.volatile_status.contains(&VolatileStatus::Uproar));
                if has_uproar {
                    return;
                }
            }
        }

        let mut ctx = EventContext::builder()
            .target(target)
            .status_val(Some(status))
            .string_val(status.to_string())
            .build();

        self.trigger_event(EventId::BeforeApplyStatus, &mut ctx);

        if !ctx.canceled {
            let s_val = ctx.status_val.unwrap();
            let mut applied = false;
            if ctx.target.player == 1 {
                if let Some(t) = self.p1.active.get_mut(ctx.target.slot)
                    && t.status.is_none()
                {
                    t.status = Some(s_val);
                    if s_val == Status::Toxic {
                        t.tox_counter = 0;
                    } else if s_val == Status::Sleep {
                        t.sleep_turns = 3;
                    }
                    applied = true;
                }
            } else {
                if let Some(t) = self.p2.active.get_mut(ctx.target.slot)
                    && t.status.is_none()
                {
                    t.status = Some(s_val);
                    if s_val == Status::Toxic {
                        t.tox_counter = 0;
                    } else if s_val == Status::Sleep {
                        t.sleep_turns = 3;
                    }
                    applied = true;
                }
            }
            if applied {
                let status_str = match s_val {
                    Status::Paralysis => "par",
                    Status::Burn => "brn",
                    Status::Frozen => "frz",
                    Status::Sleep => "slp",
                    Status::Poison => "psn",
                    Status::Toxic => "tox",
                }
                .to_string();
                self.log.push(crate::sim::log::BattleLog::StatusInflicted {
                    target: ctx.target,
                    status: status_str,
                });
            }

            self.trigger_event(EventId::AfterApplyStatus, &mut ctx);
        } else {
            self.log.push(BattleLog::Immune { target: ctx.target });
        }
    }

    pub fn section_consume_item(&mut self, target: PokemonIdent) {
        let mut ctx = EventContext::builder().target(target).build();

        self.trigger_event(EventId::BeforeConsumeItem, &mut ctx);

        if !ctx.canceled {
            let mut was_berry = false;
            let mut consumed_item = None;

            if ctx.target.player == 1 {
                if let Some(t) = self.p1.active.get_mut(ctx.target.slot) {
                    if let Some(i) = &t.item {
                        was_berry = i.as_ref().ends_with("berry");
                        consumed_item = Some(*i);
                    }
                    t.item = None;
                    if was_berry {
                        t.eaten_berry = true;
                    }
                }
            } else {
                if let Some(t) = self.p2.active.get_mut(ctx.target.slot) {
                    if let Some(i) = &t.item {
                        was_berry = i.as_ref().ends_with("berry");
                        consumed_item = Some(*i);
                    }
                    t.item = None;
                    if was_berry {
                        t.eaten_berry = true;
                    }
                }
            }

            if let Some(item_id) = consumed_item {
                self.log.push(BattleLog::EndItem {
                    target: ctx.target,
                    item: item_id.as_ref().to_string(),
                });
            }

            self.trigger_event(EventId::AfterConsumeItem, &mut ctx);

            if was_berry {
                let (has_cheek_pouch, has_cud_chew, maxhp) = self
                    .get_pokemon(ctx.target)
                    .map(|p| {
                        (
                            p.ability.as_ref().map(|a| a.as_str()) == Some("cheekpouch"),
                            p.ability.as_ref().map(|a| a.as_str()) == Some("cudchew"),
                            p.maxhp,
                        )
                    })
                    .unwrap_or((false, false, 0.into()));
                if has_cheek_pouch {
                    self.section_heal(ctx.target, (maxhp / 3).into());
                }
                if let Some(p) = self.get_pokemon_mut(ctx.target) {
                    p.last_consumed_berry = consumed_item;
                    if has_cud_chew && p.cud_chew_berry.is_none() {
                        p.cud_chew_berry = consumed_item;
                        p.cud_chew_counter = 2;
                    }
                }
            }
        }
    }

    pub fn section_cure_status(&mut self, target: PokemonIdent) {
        let ctx = EventContext::builder().target(target).build();

        let had_status = if let Some(t) = self.get_pokemon_mut(ctx.target) {
            let s = t.status.take();
            t.tox_counter = 0;
            s.is_some()
        } else {
            false
        };

        if had_status {
            self.log.push(BattleLog::CureStatus { target: ctx.target });
        }
    }

    pub fn can_switch(&self, ident: PokemonIdent) -> bool {
        let pkmn = match self.get_pokemon(ident) {
            Some(p) if p.hp.into_inner() > 0 => p,
            _ => return true,
        };

        // Ghost-type Pokemon can always switch
        if pkmn.get_types().contains(&Type::Ghost) {
            return true;
        }

        // Holding Shed Shell allows switching
        if pkmn.item == Some(ItemId::ShedShell) {
            return true;
        }

        // Trapped by move effect or partially trapped
        if pkmn.trapped_by.is_some()
            || (pkmn.partially_trapped_by.is_some() && pkmn.partially_trapped_turns > 0)
        {
            return false;
        }

        // Shadow Tag check
        let opp_side = if ident.player == 1 {
            &self.p2
        } else {
            &self.p1
        };

        let pkmn_has_shadow_tag = pkmn.ability.as_ref().map(|a| a.as_str()) == Some("shadowtag");
        let opp_has_shadow_tag = opp_side.active.iter().any(|p| {
            p.hp.into_inner() > 0 && p.ability.as_ref().map(|a| a.as_str()) == Some("shadowtag")
        });

        if opp_has_shadow_tag && !pkmn_has_shadow_tag {
            return false;
        }

        true
    }

    #[allow(clippy::too_many_arguments)]
    pub fn execute_turn(
        &mut self,
        p1_a: &str,
        p1_a_target: i8,
        p1_a_mega: bool,
        p1_b: &str,
        p1_b_target: i8,
        p1_b_mega: bool,
        p2_a: &str,
        p2_a_target: i8,
        p2_a_mega: bool,
        p2_b: &str,
        p2_b_target: i8,
        p2_b_mega: bool,
        rng_config: Option<crate::wasm_api::Config>,
    ) -> Result<(), String> {
        crate::sim::turn::execute_turn(
            self,
            p1_a,
            p1_a_target,
            p1_a_mega,
            p1_b,
            p1_b_target,
            p1_b_mega,
            p2_a,
            p2_a_target,
            p2_a_mega,
            p2_b,
            p2_b_target,
            p2_b_mega,
            rng_config,
        )
    }
    pub fn get_active_weather(&self) -> Option<Weather> {
        crate::sim::sections::field::get_active_weather(self)
    }

    pub fn force_switch_random(&mut self, target: PokemonIdent) {
        let (active, team) = if target.player == 1 {
            (&mut self.p1.active, &mut self.p1.team)
        } else {
            (&mut self.p2.active, &mut self.p2.team)
        };

        // Find available bench pokemon
        let mut available: Vec<usize> = Vec::new();
        for (i, p) in team.iter().enumerate() {
            if p.hp.into_inner() > 0 {
                available.push(i);
            }
        }

        if available.is_empty() {
            return; // Cannot force switch if bench is empty or fainted
        }

        // In Pokemon, roar/whirlwind etc. are random, but we will just pick the first available for simplicity,
        // since showdown's RNG is hard to sync exactly and tests use deterministic 1-bench setups.
        // Wait, actually, let's use the battle RNG to pick one.
        use rand::RngExt;
        let bench_idx = if available.len() > 1 {
            let mut rng = rand::rng();
            available[rng.random_range(0..available.len())]
        } else {
            available[0]
        };

        std::mem::swap(&mut active[target.slot], &mut team[bench_idx]);
        let prefix = if target.player == 1 { "p1" } else { "p2" };
        active[target.slot].ident =
            format!("{}{}", prefix, if target.slot == 0 { "a" } else { "b" });

        self.log.push(BattleLog::Drag { target });

        self.run_switch_in(target.player, target.slot);
    }

    pub fn run_switch_in(&mut self, player: u8, slot: usize) {
        crate::sim::sections::switch::run_switch_in(self, player, slot);
    }
    pub fn check_speed_modifiers(
        &self,
        pkmn: &Pokemon,
        speed: crate::sim::values::Speed,
    ) -> crate::sim::values::Speed {
        crate::sim::turn_order::TurnOrderResolver::new(self).check_speed_modifiers(pkmn, speed)
    }

    pub fn update_forecast(&mut self) {
        let weather = self.weather;
        for p in self.p1.active.iter_mut().chain(self.p2.active.iter_mut()) {
            if p.hp.into_inner() > 0
                && p.ability.as_ref().map(|a| a.as_str()) == Some("forecast")
                && p.species.starts_with("castform")
            {
                match weather {
                    Some(Weather::HashSunlight) | Some(Weather::ExtremelyHarshSunlight) => {
                        p.type1 = Type::Fire;
                        p.type2 = None;
                    }
                    Some(Weather::Rain) | Some(Weather::HeavyRain) => {
                        p.type1 = Type::Water;
                        p.type2 = None;
                    }
                    Some(Weather::Snow) => {
                        p.type1 = Type::Ice;
                        p.type2 = None;
                    }
                    _ => {
                        p.type1 = Type::Normal;
                        p.type2 = None;
                    }
                }
            }
        }
    }

    pub fn update_mimicry(&mut self) {
        let terrain = self.terrain;
        for p in self.p1.active.iter_mut().chain(self.p2.active.iter_mut()) {
            if p.hp.into_inner() > 0 && p.ability.as_ref().map(|a| a.as_str()) == Some("mimicry") {
                match terrain {
                    Some(Terrain::Electric) => {
                        p.type1 = Type::Electric;
                        p.type2 = None;
                    }
                    Some(Terrain::Grassy) => {
                        p.type1 = Type::Grass;
                        p.type2 = None;
                    }
                    Some(Terrain::Misty) => {
                        p.type1 = Type::Fairy;
                        p.type2 = None;
                    }
                    Some(Terrain::Psychic) => {
                        p.type1 = Type::Psychic;
                        p.type2 = None;
                    }
                    None => {
                        // Restore Galarian Stunfisk's original types: Ground/Steel
                        if p.species.contains("stunfisk") {
                            p.type1 = Type::Ground;
                            p.type2 = Some(Type::Steel);
                        }
                    }
                }
            }
        }
    }

    pub fn run_mega_evolution(&mut self, player: u8, slot: usize) -> bool {
        let side = if player == 1 {
            &mut self.p1
        } else {
            &mut self.p2
        };

        if side.mega_used {
            return false;
        }

        let Some(p) = side.active.get_mut(slot) else {
            return false;
        };

        if p.hp <= 0 || p.is_mega {
            return false;
        }

        let Some(item) = p.item else {
            return false;
        };

        let Some(details) = pkmn_meta::mega_meta::get_mega_details(&p.species, item.as_ref())
        else {
            return false;
        };

        let mega_species = details.mega_species.to_string();
        let mega_ability = details.ability.to_string();
        let item_name = item.to_string();
        p.mega_evolve(&mega_species, &mega_ability);

        side.mega_used = true;

        let ident = PokemonIdent { player, slot };
        // Format species name properly for Showdown: capitalize words
        let species_display = if pkmn_meta::pokemon_meta::get_pokemon_meta(&mega_species).is_some()
        {
            // Capitalize parts separated by hyphen
            mega_species
                .split('-')
                .map(|part| {
                    let mut s = part.to_string();
                    if !s.is_empty() {
                        s[..1].make_ascii_uppercase();
                    }
                    s
                })
                .collect::<Vec<_>>()
                .join("-")
        } else {
            mega_species.clone()
        };

        // Format item name properly: capitalize
        let item_display = {
            let mut s = item_name.clone();
            if !s.is_empty() {
                s[..1].make_ascii_uppercase();
            }
            s
        };

        self.log.push(BattleLog::Mega {
            target: ident,
            species: species_display,
            item: item_display,
        });

        crate::sim::sections::switch::trigger_switch_in_ability(self, player, slot);
        true
    }
}
