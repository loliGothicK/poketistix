use crate::sim::battle::{Battle, BattleLog, EventContext, EventId, PokemonIdent, Stat};
use crate::wasm_api::Boosts;
use pkmn_meta::types::Type;

/// Applies a stat change, handling abilities like Clear Body, Simple, Contrary, Defiant, etc.
/// Returns true if the stat was successfully changed.
pub fn apply_stat_change(
    battle: &mut Battle,
    target_player: u8,
    target_slot: usize,
    stat: Stat,
    mut amount: i8,
    source_player: u8,
    source_effect: Option<&str>,
) -> bool {
    // Check if target is alive
    let target = if target_player == 1 {
        battle.p1.active.get(target_slot)
    } else {
        battle.p2.active.get(target_slot)
    };
    if target.is_none() || target.unwrap().hp == 0 {
        return false;
    }

    // Extract target's ability
    let target_ability = if target_player == 1 {
        battle
            .p1
            .active
            .get(target_slot)
            .and_then(|p| p.ability.clone())
    } else {
        battle
            .p2
            .active
            .get(target_slot)
            .and_then(|p| p.ability.clone())
    };

    // Execute Condition Hooks
    let mut blocked_immune = false;
    let mut blocked_fail = false;
    if let Some(ability) = &target_ability {
        let ability_id = ability.as_ref();
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        let source_ident = PokemonIdent {
            player: source_player,
            slot: 0,
        };
        amount = crate::sim::abilities::on_modify_boost(
            ability_id,
            battle,
            target_ident,
            stat,
            amount,
            source_effect,
        );

        let is_foe = source_player != target_player;
        if is_foe && amount < 0 {
            let side = if target_player == 1 {
                &battle.p1.active
            } else {
                &battle.p2.active
            };
            let target_is_grass = side.get(target_slot).is_some_and(|p| {
                p.type1 == Type::Grass
                    || p.type2 == Some(Type::Grass)
                    || p.added_type == Some(Type::Grass)
            });
            let side_has_flower_veil = side
                .iter()
                .any(|p| p.hp > 0 && p.ability.as_ref().map(|a| a.as_str()) == Some("flowerveil"));
            if target_is_grass && side_has_flower_veil {
                return false;
            }

            if ability_id == "mirrorarmor" && source_effect != Some("mirrorarmor") {
                // Reflect stat drop to opponent
                battle.apply_stat_change(
                    source_player,
                    0,
                    vec![(stat, amount)],
                    target_player,
                    Some("mirrorarmor"),
                );
                return false;
            }

            let source_ability = battle
                .get_pokemon(source_ident)
                .and_then(|p| p.ability.as_ref())
                .map(|a| a.as_str());
            let source_has_mold_breaker = matches!(
                source_ability,
                Some("moldbreaker") | Some("teravolt") | Some("turboblaze")
            ) && source_player != target_player;

            if !source_has_mold_breaker
                && !crate::sim::abilities::on_try_boost(
                    ability_id,
                    battle,
                    target_ident,
                    source_ident,
                    stat,
                    amount,
                    source_effect,
                )
            {
                if source_effect == Some("intimidate")
                    && matches!(
                        ability_id,
                        "innerfocus" | "oblivious" | "owntempo" | "scrappy"
                    )
                {
                    blocked_immune = true;
                } else {
                    blocked_fail = true;
                }
            }
        }
    }

    let target_ident = PokemonIdent {
        player: target_player,
        slot: target_slot,
    };

    if blocked_immune {
        battle.log.push(BattleLog::Immune {
            target: target_ident,
        });
        return false;
    }

    if blocked_fail {
        battle.log.push(BattleLog::Fail {
            target: target_ident,
        });
        return false;
    }

    // Apply the change
    let mut actual_change = 0;
    let mut success = false;

    let apply_to_boosts = |boosts: &mut Boosts, stat: Stat, amt: i8| -> (bool, i8) {
        let old_val = match stat {
            Stat::Atk => boosts.atk.into_inner(),
            Stat::Def => boosts.def.into_inner(),
            Stat::Spa => boosts.spa.into_inner(),
            Stat::Spd => boosts.spd.into_inner(),
            Stat::Spe => boosts.spe.into_inner(),
            Stat::Accuracy => boosts.accuracy.into_inner(),
            Stat::Evasion => boosts.evasion.into_inner(),
        };
        let new_val = (old_val + amt).clamp(-6, 6);
        match stat {
            Stat::Atk => boosts.atk = new_val.into(),
            Stat::Def => boosts.def = new_val.into(),
            Stat::Spa => boosts.spa = new_val.into(),
            Stat::Spd => boosts.spd = new_val.into(),
            Stat::Spe => boosts.spe = new_val.into(),
            Stat::Accuracy => boosts.accuracy = new_val.into(),
            Stat::Evasion => boosts.evasion = new_val.into(),
        }
        (new_val != old_val, new_val - old_val)
    };

    if target_player == 1 {
        if let Some(p) = battle.p1.active.get_mut(target_slot) {
            let res = apply_to_boosts(&mut p.boosts, stat, amount);
            success = res.0;
            actual_change = res.1;
            if actual_change > 0 {
                p.turn_state.stats_raised = true;
            } else if actual_change < 0 {
                p.turn_state.stats_lowered = true;
            }
        }
    } else {
        if let Some(p) = battle.p2.active.get_mut(target_slot) {
            let res = apply_to_boosts(&mut p.boosts, stat, amount);
            success = res.0;
            actual_change = res.1;
            if actual_change > 0 {
                p.turn_state.stats_raised = true;
            } else if actual_change < 0 {
                p.turn_state.stats_lowered = true;
            }
        }
    }

    if success {
        let stat_name = match stat {
            Stat::Atk => "atk",
            Stat::Def => "def",
            Stat::Spa => "spa",
            Stat::Spd => "spd",
            Stat::Spe => "spe",
            Stat::Accuracy => "accuracy",
            Stat::Evasion => "evasion",
        }
        .to_string();
        battle.log.push(BattleLog::StatChange {
            target: PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            stat: stat_name.clone(),
            amount: actual_change as i32,
        });

        battle.event_queue.push_back((
            EventId::AfterStatChange,
            EventContext::builder()
                .target(PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                })
                .source(Some(PokemonIdent {
                    player: source_player,
                    slot: 0,
                }))
                .num_val(actual_change as i32)
                .string_val(stat_name)
                .build(),
        ));

        // Opportunist check: when opponent gets a stat boost
        if actual_change > 0 && source_effect != Some("opportunist") {
            let opp_player = if target_player == 1 { 2 } else { 1 };
            let opp_actives = if opp_player == 1 {
                battle
                    .p1
                    .active
                    .iter()
                    .enumerate()
                    .map(|(idx, p)| (idx, p.hp > 0, p.ability.clone()))
                    .collect::<Vec<_>>()
            } else {
                battle
                    .p2
                    .active
                    .iter()
                    .enumerate()
                    .map(|(idx, p)| (idx, p.hp > 0, p.ability.clone()))
                    .collect::<Vec<_>>()
            };
            for (idx, alive, ability) in opp_actives {
                if alive && ability.as_ref().map(|a| a.as_str()) == Some("opportunist") {
                    battle.apply_stat_change(
                        opp_player,
                        idx,
                        vec![(stat, actual_change)],
                        opp_player,
                        Some("opportunist"),
                    );
                }
            }
        }
    }

    battle.process_event_queue();

    success
}
