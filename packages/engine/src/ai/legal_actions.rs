use crate::sim::battle::Battle;
use pkmn_meta::types::{Category, Range, Type};

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct SlotAction {
    pub choice: String, // move_id (e.g. "thunderbolt"), "switch", or "pass"
    pub target: i8, // 0, 1 for opponents; -1, -2 for allies; or bench index + active_len for switch
    pub mega: bool,
}

impl SlotAction {
    pub fn pass() -> Self {
        Self {
            choice: "pass".to_string(),
            target: 0,
            mega: false,
        }
    }

    pub fn is_pass(&self) -> bool {
        self.choice == "pass" || self.choice.is_empty()
    }

    pub fn is_switch(&self) -> bool {
        self.choice == "switch"
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PlayerAction {
    pub a: SlotAction,
    pub b: SlotAction,
}

impl PlayerAction {
    pub fn pass() -> Self {
        Self {
            a: SlotAction::pass(),
            b: SlotAction::pass(),
        }
    }
}

/// Generates all legal slot actions for a specific slot on `player`'s side.
pub fn get_slot_actions(battle: &Battle, player: u8, slot: usize) -> Vec<SlotAction> {
    let side = if player == 1 { &battle.p1 } else { &battle.p2 };
    if slot >= side.active.len() {
        return vec![SlotAction::pass()];
    }

    let pkmn = &side.active[slot];
    if pkmn.hp.into_inner() <= 0 {
        return vec![SlotAction::pass()];
    }

    let mut actions = Vec::new();

    // Determine if mega evolution is available for this Pokémon
    let can_mega = !side.mega_used
        && !pkmn.is_mega
        && pkmn.item.is_some_and(|item| {
            pkmn_meta::mega_meta::is_matching_mega_stone(&pkmn.species, item.as_ref())
        });

    let opp_side = if player == 1 { &battle.p2 } else { &battle.p1 };
    let opp_alive: Vec<i8> = opp_side
        .active
        .iter()
        .enumerate()
        .filter(|(_, p)| p.hp.into_inner() > 0)
        .map(|(i, _)| i as i8)
        .collect();

    // 1. Move actions
    let mut usable_moves = Vec::new();
    for move_id in &pkmn.moves {
        // Disabled move check
        if pkmn.disabled_move.as_deref() == Some(move_id.as_str()) && pkmn.disable_turns > 0 {
            continue;
        }

        // Encore check
        if let Some(ref enc) = pkmn.encored_move
            && pkmn.encore_turns > 0
            && enc != move_id
        {
            continue;
        }

        // Taunt check
        if pkmn.taunt_turns > 0
            && let Some(meta) = pkmn_meta::move_meta::get_move_meta(move_id)
            && *meta.category() == Category::Status
        {
            continue;
        }

        // PP check
        let pp_used = pkmn.pp_used.get(move_id).copied().unwrap_or(0);
        let max_pp = pkmn_meta::move_meta::get_move_meta(move_id)
            .map(|m| *m.pp())
            .unwrap_or(0);
        if max_pp > 0 && pp_used >= max_pp {
            continue;
        }

        usable_moves.push(move_id.clone());
    }

    // If no moves are usable, Struggle is used
    if usable_moves.is_empty() {
        let targets = if opp_alive.is_empty() {
            vec![0]
        } else {
            opp_alive.clone()
        };
        for t in targets {
            actions.push(SlotAction {
                choice: "struggle".to_string(),
                target: t,
                mega: false,
            });
        }
    } else {
        for move_id in usable_moves {
            let meta_opt = pkmn_meta::move_meta::get_move_meta(&move_id);
            let range = meta_opt
                .as_ref()
                .map(|m| *m.range())
                .unwrap_or(Range::SingleTarget);

            let targets: Vec<i8> = match range {
                Range::SingleTarget => {
                    if opp_alive.is_empty() {
                        vec![0]
                    } else {
                        opp_alive.clone()
                    }
                }
                Range::SingleAlly => {
                    let ally_slot = if slot == 0 { 1 } else { 0 };
                    if ally_slot < side.active.len() && side.active[ally_slot].hp.into_inner() > 0 {
                        vec![if slot == 0 { -2 } else { -1 }]
                    } else {
                        vec![0]
                    }
                }
                Range::Self_
                | Range::UserSSide
                | Range::EntireField
                | Range::AllOpponents
                | Range::AllPokemon
                | Range::OpponentSSide
                | Range::AllAllies
                | Range::RandomOpponent
                | Range::Varies => vec![0],
            };

            for &t in &targets {
                actions.push(SlotAction {
                    choice: move_id.clone(),
                    target: t,
                    mega: false,
                });
                if can_mega {
                    actions.push(SlotAction {
                        choice: move_id.clone(),
                        target: t,
                        mega: true,
                    });
                }
            }
        }
    }

    // 2. Switch actions
    // Check if the Pokémon is trapped
    let is_trapped = pkmn.trapped_by.is_some()
        || (pkmn.partially_trapped_by.is_some() && pkmn.partially_trapped_turns > 0);

    // Shadow Tag check
    let opp_has_shadow_tag = opp_side.active.iter().any(|p| {
        p.hp.into_inner() > 0 && p.ability.as_ref().map(|a| a.as_str()) == Some("shadowtag")
    });
    let is_ghost = pkmn.get_types().contains(&Type::Ghost);
    let cannot_switch = is_trapped || (opp_has_shadow_tag && !is_ghost);

    if !cannot_switch {
        let active_len = side.active.len();
        for (bench_idx, bench_pkmn) in side.team.iter().enumerate() {
            if bench_pkmn.hp.into_inner() > 0 {
                actions.push(SlotAction {
                    choice: "switch".to_string(),
                    target: (active_len + bench_idx) as i8,
                    mega: false,
                });
            }
        }
    }

    if actions.is_empty() {
        actions.push(SlotAction::pass());
    }

    actions
}

/// Generates all valid joint player actions for `player` in the current battle state.
pub fn get_player_actions(battle: &Battle, player: u8) -> Vec<PlayerAction> {
    let side = if player == 1 { &battle.p1 } else { &battle.p2 };

    let actions_a = if side.active.first().is_some_and(|p| p.hp.into_inner() > 0) {
        get_slot_actions(battle, player, 0)
    } else {
        vec![SlotAction::pass()]
    };

    let actions_b = if side.active.get(1).is_some_and(|p| p.hp.into_inner() > 0) {
        get_slot_actions(battle, player, 1)
    } else {
        vec![SlotAction::pass()]
    };

    let mut joint_actions = Vec::with_capacity(actions_a.len() * actions_b.len());

    for a in &actions_a {
        for b in &actions_b {
            // Cannot both mega evolve in the same turn
            if a.mega && b.mega {
                continue;
            }
            // Cannot both switch to the same bench Pokémon
            if a.is_switch() && b.is_switch() && a.target == b.target {
                continue;
            }

            joint_actions.push(PlayerAction {
                a: a.clone(),
                b: b.clone(),
            });
        }
    }

    if joint_actions.is_empty() {
        joint_actions.push(PlayerAction::pass());
    }

    joint_actions
}
