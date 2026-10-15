use crate::sim::battle::Battle;
use pkmn_meta::types::*;
use rand::RngExt;

#[allow(clippy::too_many_arguments)]
pub fn execute_turn(
    battle: &mut Battle,
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
    battle.rng_config = rng_config;
    let mut actions = vec![];

    let inputs = [
        (1, 0, p1_a.trim(), p1_a_target, p1_a_mega),
        (1, 1, p1_b.trim(), p1_b_target, p1_b_mega),
        (2, 0, p2_a.trim(), p2_a_target, p2_a_mega),
        (2, 1, p2_b.trim(), p2_b_target, p2_b_mega),
    ];

    for (player, slot, choice, target_slot, want_mega) in inputs {
        if choice.is_empty() || choice == "pass" {
            continue;
        }
        let team = if player == 1 { &battle.p1 } else { &battle.p2 };
        if slot >= team.active.len() {
            continue;
        }
        let pkmn = &team.active[slot];

        let is_switch = choice == "switch";
        let priority = if is_switch {
            6
        } else {
            crate::sim::turn_order::TurnOrderResolver::new(battle).get_move_priority(choice, pkmn)
        };
        let (target_player, actual_target_slot) = if is_switch {
            (player, target_slot as u8)
        } else if target_slot < 0 {
            let s = if target_slot == -1 { 0 } else { 1 };
            (player, s)
        } else {
            (if player == 1 { 2 } else { 1 }, target_slot as u8)
        };

        let speed = battle
            .check_speed_modifiers(pkmn, pkmn.speed.apply_boost(pkmn.boosts.spe))
            .into_inner();

        if want_mega
            && !is_switch
            && !team.mega_used
            && !pkmn.is_mega
            && pkmn.hp > 0
            && pkmn.item.is_some_and(|item| {
                pkmn_meta::mega_meta::is_matching_mega_stone(&pkmn.species, item.as_ref())
            })
        {
            actions.push(crate::sim::action::Action::Mega(
                crate::sim::action::MegaAction {
                    player,
                    slot,
                    priority: 0,
                    speed,
                },
            ));
        }

        let action: crate::sim::action::Action = if is_switch {
            crate::sim::action::Action::Switch(crate::sim::action::SwitchAction {
                player,
                slot,
                target_slot: actual_target_slot as usize,
                priority,
                speed,
            })
        } else {
            crate::sim::action::Action::Move(crate::sim::action::MoveAction {
                player,
                slot,
                move_id: choice.to_string(),
                original_move_id: choice.to_string(),
                target_player,
                target_slot: actual_target_slot,
                priority,
                speed,
                is_bounced: false,
                quick_draw: false,
            })
        };
        actions.push(action);
    }

    let is_trick_room = battle.is_trick_room();

    // Resolve Quick Draw (30% chance on attacking moves) and Quick Claw
    let mut rng = rand::rng();
    let force_secondary_always = battle
        .rng_config
        .as_ref()
        .and_then(|c| c.secondary.as_deref())
        == Some("always");
    let force_secondary_never = battle
        .rng_config
        .as_ref()
        .and_then(|c| c.secondary.as_deref())
        == Some("never");

    for a in actions.iter_mut() {
        if let crate::sim::action::Action::Move(m) = a {
            let pkmn = if m.player == 1 {
                battle.p1.active.get(m.slot)
            } else {
                battle.p2.active.get(m.slot)
            };
            if let Some(pkmn) = pkmn {
                let is_attacking = pkmn_meta::move_meta::get_move_meta(&m.move_id)
                    .map(|meta| matches!(meta.category(), Category::Physical | Category::Special))
                    .unwrap_or(false);

                if is_attacking && pkmn.ability.as_ref().map(|a| a.as_str()) == Some("quickdraw") {
                    let activated = if force_secondary_always {
                        true
                    } else if force_secondary_never {
                        false
                    } else {
                        rng.random_range(1..=100) <= 30
                    };

                    if activated {
                        m.quick_draw = true;
                        battle.log.push(crate::sim::log::BattleLog::Activate {
                            target: crate::sim::pokemon::PokemonIdent {
                                player: m.player,
                                slot: m.slot,
                            },
                            effect: "Quick Draw".to_string(),
                        });
                    }
                }
            }
        }
    }

    actions.sort_by(|a, b| compare_actions(a, b, is_trick_room));

    let is_resuming = !battle.turn_actions.is_empty();

    if is_resuming {
        actions.append(&mut battle.turn_actions);
        battle.turn_actions = actions;
        battle.turn_state = crate::sim::battle::TurnState::Ready;
    } else {
        battle.turn_actions = actions;

        let mut beakblast_users = vec![];
        let mut focuspunch_users = vec![];
        for a in &battle.turn_actions {
            if let crate::sim::action::Action::Move(m) = a {
                if m.move_id == "beakblast" {
                    beakblast_users.push(crate::sim::pokemon::PokemonIdent {
                        player: m.player,
                        slot: m.slot,
                    });
                } else if m.move_id == "focuspunch" {
                    focuspunch_users.push(crate::sim::pokemon::PokemonIdent {
                        player: m.player,
                        slot: m.slot,
                    });
                }
            }
        }
        for ident in focuspunch_users {
            battle.log.push(crate::sim::log::BattleLog::SingleTurn {
                target: ident,
                effect: "move: Focus Punch".to_string(),
            });
        }
        for ident in beakblast_users {
            battle.section_apply_volatile(ident, VolatileStatus::Beakblast);
            let pkmn_name = battle
                .get_pokemon(ident)
                .map(|p| p.ident.clone())
                .unwrap_or_default();
            battle.log.push(crate::sim::log::BattleLog::Text {
                message: format!("|-anim|{}|Beak Blast", pkmn_name),
            });
            battle.log.push(crate::sim::log::BattleLog::Text {
                message: format!("|-singleturn|{}|move: Beak Blast", pkmn_name),
            });
        }
    }

    process_turn_actions(battle)
}

pub fn sort_turn_actions(battle: &mut Battle) {
    let is_trick_room = battle.is_trick_room();
    // Update speeds and priorities for remaining actions based on current battle state
    let mut updates = Vec::with_capacity(battle.turn_actions.len());
    for action in &battle.turn_actions {
        let player = action.player();
        let slot = action.slot();
        if let Some(pkmn) = battle.get_pokemon(crate::sim::pokemon::PokemonIdent { player, slot }) {
            let speed = battle
                .check_speed_modifiers(pkmn, pkmn.speed.apply_boost(pkmn.boosts.spe))
                .into_inner();
            let priority = match action {
                crate::sim::action::Action::Switch(s) => s.priority,
                crate::sim::action::Action::Mega(m) => m.priority,
                crate::sim::action::Action::Move(m) => {
                    crate::sim::turn_order::TurnOrderResolver::new(battle)
                        .get_move_priority(&m.move_id, pkmn)
                }
            };
            updates.push(Some((speed, priority)));
        } else {
            updates.push(None);
        }
    }

    for (action, update) in battle.turn_actions.iter_mut().zip(updates) {
        if let Some((speed, priority)) = update {
            match action {
                crate::sim::action::Action::Switch(s) => {
                    s.speed = speed;
                    s.priority = priority;
                }
                crate::sim::action::Action::Mega(m) => {
                    m.speed = speed;
                    m.priority = priority;
                }
                crate::sim::action::Action::Move(m) => {
                    m.speed = speed;
                    m.priority = priority;
                }
            }
        }
    }

    battle
        .turn_actions
        .sort_by(|a, b| compare_actions(a, b, is_trick_room));
}

/// Order actions by priority (high first), then speed (reversed under Trick Room).
fn compare_actions(
    a: &crate::sim::action::Action,
    b: &crate::sim::action::Action,
    is_trick_room: bool,
) -> std::cmp::Ordering {
    let a_order = a.order();
    let b_order = b.order();
    if a_order != b_order {
        return a_order.cmp(&b_order);
    }

    let p1_prio = a.priority();
    let p2_prio = b.priority();
    if p1_prio != p2_prio {
        return p2_prio.cmp(&p1_prio);
    }

    // Within the same priority bracket, Quick Draw actions act before non-Quick Draw actions
    let a_qd = a.quick_draw();
    let b_qd = b.quick_draw();
    if a_qd != b_qd {
        return b_qd.cmp(&a_qd); // true > false
    }

    let p1_spe = a.speed();
    let p2_spe = b.speed();
    if p1_spe != p2_spe {
        if is_trick_room {
            return p1_spe.cmp(&p2_spe);
        } else {
            return p2_spe.cmp(&p1_spe);
        }
    }
    std::cmp::Ordering::Equal
}

pub fn process_turn_actions(battle: &mut Battle) -> Result<(), String> {
    while !battle.turn_actions.is_empty() {
        if matches!(
            battle.turn_state,
            crate::sim::battle::TurnState::WaitingForSwitch { .. }
        ) {
            return Ok(());
        }
        sort_turn_actions(battle);
        let action = battle.turn_actions.remove(0);
        if let crate::sim::action::Action::Move(m) = &action
            && let Some(p) = battle.get_pokemon_mut(crate::sim::pokemon::PokemonIdent {
                player: m.player,
                slot: m.slot,
            })
        {
            p.turn_state.acted_this_turn = true;
        }
        action.execute(battle)?;
    }

    if matches!(battle.turn_state, crate::sim::battle::TurnState::Ready) {
        crate::sim::end_of_turn_phase::EndOfTurnPhase::execute(battle);

        for p in battle.p1.active.iter_mut() {
            p.turn_state.clear();
            p.volatile_status
                .retain(|s| s != &VolatileStatus::Beakblast);
            p.active_turns += 1;
        }
        for p in battle.p2.active.iter_mut() {
            p.turn_state.clear();
            p.volatile_status
                .retain(|s| s != &VolatileStatus::Beakblast);
            p.active_turns += 1;
        }
    }
    Ok(())
}
