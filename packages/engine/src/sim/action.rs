use crate::sim::battle::Battle;
use std::fmt::Debug;

#[derive(Debug, Clone)]
pub struct SwitchAction {
    pub player: u8,
    pub slot: usize,
    pub target_slot: usize,
    pub priority: i32,
    pub speed: i32,
}

#[derive(Debug, Clone)]
pub struct MoveAction {
    pub player: u8,
    pub slot: usize,
    pub move_id: String,
    pub original_move_id: String,
    pub target_player: u8,
    pub target_slot: u8,
    pub priority: i32,
    pub speed: i32,
    pub is_bounced: bool,
}

#[derive(Debug, Clone)]
pub struct MegaAction {
    pub player: u8,
    pub slot: usize,
    pub priority: i32,
    pub speed: i32,
}

#[derive(Debug, Clone)]
pub enum Action {
    Switch(SwitchAction),
    Mega(MegaAction),
    Move(MoveAction),
}

impl Action {
    pub fn player(&self) -> u8 {
        match self {
            Action::Switch(a) => a.player,
            Action::Mega(a) => a.player,
            Action::Move(a) => a.player,
        }
    }

    pub fn slot(&self) -> usize {
        match self {
            Action::Switch(a) => a.slot,
            Action::Mega(a) => a.slot,
            Action::Move(a) => a.slot,
        }
    }

    pub fn priority(&self) -> i32 {
        match self {
            Action::Switch(a) => a.priority,
            Action::Mega(a) => a.priority,
            Action::Move(a) => a.priority,
        }
    }

    pub fn speed(&self) -> i32 {
        match self {
            Action::Switch(a) => a.speed,
            Action::Mega(a) => a.speed,
            Action::Move(a) => a.speed,
        }
    }

    pub fn order(&self) -> u32 {
        match self {
            Action::Switch(_) => 103,
            Action::Mega(_) => 104,
            Action::Move(_) => 200,
        }
    }

    pub fn is_switch(&self) -> bool {
        match self {
            Action::Switch(_) => true,
            Action::Mega(_) | Action::Move(_) => false,
        }
    }

    pub fn execute(&self, battle: &mut Battle) -> Result<(), String> {
        match self {
            Action::Switch(s) => {
                {
                    let (active, team) = if s.player == 1 {
                        (&mut battle.p1.active, &mut battle.p1.team)
                    } else {
                        (&mut battle.p2.active, &mut battle.p2.team)
                    };
                    // removed debug

                    // removed debug

                    if s.target_slot >= active.len() {
                        let bench_idx = s.target_slot - active.len();
                        if bench_idx < team.len() {
                            active[s.slot].active_turns = 0;
                            active[s.slot].boosts = pkmn_meta::Boosts::default();
                            active[s.slot].volatile_status.clear();
                            active[s.slot].leech_seeded_by = None;
                            active[s.slot].last_move_used = None;
                            active[s.slot].consecutive_move_counter = 0;

                            if active[s.slot].ability.as_ref().map(|a| a.as_str())
                                == Some("naturalcure")
                                && active[s.slot].status.is_some()
                            {
                                active[s.slot].status = None;
                                battle.log.push(crate::sim::log::BattleLogEvent::new(
                                    crate::sim::log::BattleLog::CureStatus {
                                        target: crate::sim::battle::PokemonIdent {
                                            player: s.player,
                                            slot: s.slot,
                                        },
                                    },
                                ));
                            }
                            if active[s.slot].ability.as_ref().map(|a| a.as_str())
                                == Some("regenerator")
                                && active[s.slot].hp > 0
                            {
                                let heal = std::cmp::max(1, active[s.slot].maxhp.into_inner() / 3);
                                active[s.slot].hp = std::cmp::min(
                                    active[s.slot].maxhp.into_inner(),
                                    active[s.slot].hp.into_inner() + heal,
                                )
                                .into();
                            }

                            std::mem::swap(&mut active[s.slot], &mut team[bench_idx]);
                            let prefix = if s.player == 1 { "p1" } else { "p2" };
                            active[s.slot].ident =
                                format!("{}{}", prefix, if s.slot == 0 { "a" } else { "b" });
                        }
                    } else {
                        active.swap(s.slot, s.target_slot);
                        let prefix = if s.player == 1 { "p1" } else { "p2" };
                        active[s.slot].ident =
                            format!("{}{}", prefix, if s.slot == 0 { "a" } else { "b" });
                        active[s.target_slot].ident =
                            format!("{}{}", prefix, if s.target_slot == 0 { "a" } else { "b" });
                    }
                }

                // You must call run_switch_in AFTER mutable borrow is dropped, so we do it outside.
                battle.run_switch_in(s.player, s.slot);
                Ok(())
            }
            Action::Mega(m) => {
                battle.run_mega_evolution(m.player, m.slot);
                Ok(())
            }
            Action::Move(m) => battle.execute_move(m),
        }
    }
}
