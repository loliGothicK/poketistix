use crate::sim::battle::{Battle, BattleLog, PokemonIdent, Stat, TurnState};
use pkmn_meta::types::*;

/// Remove the active terrain (if any) and log its end.
fn clear_terrain(battle: &mut Battle) {
    let Some(terrain) = battle.terrain else {
        return;
    };
    let terrain_name = match terrain {
        Terrain::Electric => "Electric Terrain",
        Terrain::Grassy => "Grassy Terrain",
        Terrain::Misty => "Misty Terrain",
        Terrain::Psychic => "Psychic Terrain",
    };
    battle.terrain = None;
    battle.terrain_turns_left = 0;
    battle.log.push(BattleLog::TerrainChange {
        terrain: terrain_name.to_string(),
        is_start: false,
    });
}

fn check_aroma_veil(
    battle: &mut Battle,
    target_player: u8,
    target_slot: usize,
    source_player: u8,
    source_slot: usize,
) -> bool {
    let source_ability = if source_player == 1 {
        battle
            .p1
            .active
            .get(source_slot)
            .and_then(|p| p.ability.clone())
    } else {
        battle
            .p2
            .active
            .get(source_slot)
            .and_then(|p| p.ability.clone())
    };
    let mold_breaker = source_ability
        .as_ref()
        .map(|a| a.as_str())
        .is_some_and(|a| matches!(a, "moldbreaker" | "teravolt" | "turboblaze"));
    if mold_breaker {
        return false;
    }
    let target_side = if target_player == 1 {
        &battle.p1.active
    } else {
        &battle.p2.active
    };
    let mut holder = None;
    for (slot_idx, p) in target_side.iter().enumerate() {
        if p.hp.into_inner() > 0 && p.ability.as_ref().map(|a| a.as_str()) == Some("aromaveil") {
            holder = Some(PokemonIdent {
                player: target_player,
                slot: slot_idx,
            });
            break;
        }
    }
    if let Some(h) = holder {
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        battle.log.push(BattleLog::Text {
            message: format!("|-block|{}|ability: Aroma Veil|[of] {}", target_ident, h),
        });
        return true;
    }
    false
}

pub fn handle_move_target_effect(
    battle: &mut Battle,
    move_id: &str,
    target_player: u8,
    target_slot: usize,
    source_player: u8,
    source_slot: usize,
    flung_item: Option<ItemId>,
) {
    if move_id == "clearsmog" {
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        if let Some(target_p) = battle.get_pokemon_mut(target_ident) {
            target_p.boosts = pkmn_meta::Boosts::default();
        }
        battle.log.push(BattleLog::Text {
            message: format!("|-clearboost|{}", target_ident),
        });
    } else if move_id == "metalsound" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Spd, -2)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "toxicthread" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Spe, -2)],
            source_player,
            Some(move_id),
        );
        battle.section_apply_status(
            PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            Status::Poison,
            Some(PokemonIdent {
                player: source_player,
                slot: source_slot,
            }),
        );
    } else if move_id == "helpinghand" {
        battle.section_apply_volatile(
            PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            VolatileStatus::Helpinghand,
        );
    } else if move_id == "healbell" {
        let active_len = if target_player == 1 {
            battle.p1.active.len()
        } else {
            battle.p2.active.len()
        };
        for slot in 0..active_len {
            if let Some(pokemon) = battle.get_pokemon_mut(PokemonIdent {
                player: target_player,
                slot,
            }) {
                let had_status = pokemon.status.is_some();
                pokemon.status = None;
                pokemon.tox_counter = 0;
                if had_status {
                    battle.log.push(BattleLog::CureStatus {
                        target: PokemonIdent {
                            player: target_player,
                            slot,
                        },
                    });
                }
            }
        }
    } else if move_id == "magicpowder"
        && let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        })
    {
        target.type1 = Type::Psychic;
        target.type2 = None;
        target.added_type = None;
    } else if move_id == "simplebeam"
        && let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        })
    {
        target.ability = Some("simple".to_string().into());
    } else if move_id == "worryseed"
        && let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        })
    {
        target.ability = Some("insomnia".to_string().into());
    } else if move_id == "trickortreat" {
        battle.section_apply_added_type(
            PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            Type::Ghost,
        );
    }
    if move_id == "healpulse" || move_id == "milkdrink" {
        if let Some(target_p) = battle.get_pokemon(PokemonIdent {
            player: target_player,
            slot: target_slot,
        }) {
            if target_p.hp == target_p.maxhp {
                battle.log.push(BattleLog::Fail {
                    target: PokemonIdent {
                        player: target_player,
                        slot: target_slot,
                    },
                });
            } else {
                let heal = (target_p.maxhp.into_inner() as f64 * 0.5).ceil() as i32;
                battle.section_heal(
                    PokemonIdent {
                        player: target_player,
                        slot: target_slot,
                    },
                    heal.into(),
                );
            }
        }
    } else if move_id == "painsplit"
        && let Some(target) = battle.get_pokemon(PokemonIdent {
            player: target_player,
            slot: target_slot,
        })
        && let Some(attacker) = battle.get_pokemon(PokemonIdent {
            player: source_player,
            slot: source_slot,
        })
    {
        let target_hp = target.hp.into_inner();
        let attacker_hp = attacker.hp.into_inner();
        let average = (target_hp + attacker_hp) / 2;
        if let Some(p) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        }) {
            p.hp = (average).into();
        }
        if let Some(p) = battle.get_pokemon_mut(PokemonIdent {
            player: source_player,
            slot: source_slot,
        }) {
            p.hp = (average).into();
        }
        battle.log.push(BattleLog::SetHp {
            target: PokemonIdent {
                player: source_player,
                slot: source_slot,
            },
        });
        battle.log.push(BattleLog::SetHp {
            target: PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
        });
    }

    if move_id == "lifedew" {
        for slot in 0..2 {
            if let Some(target) = battle.get_pokemon(PokemonIdent {
                player: source_player,
                slot,
            }) {
                let heal = std::cmp::max(1, (target.maxhp.into_inner() + 3) / 4);
                battle.section_heal(
                    PokemonIdent {
                        player: source_player,
                        slot,
                    },
                    heal.into(),
                );
            }
        }
    }

    if move_id == "powersplit" {
        let mut target_atk = 0;
        let mut target_spa = 0;
        if let Some(target) = battle.get_pokemon(PokemonIdent {
            player: target_player,
            slot: target_slot,
        }) {
            target_atk = target.attack.into_inner();
            target_spa = target.sp_attack.into_inner();
        }
        let mut attacker_atk = 0;
        let mut attacker_spa = 0;
        if let Some(attacker) = battle.get_pokemon(PokemonIdent {
            player: source_player,
            slot: source_slot,
        }) {
            attacker_atk = attacker.attack.into_inner();
            attacker_spa = attacker.sp_attack.into_inner();
        }

        let avg_atk = (target_atk + attacker_atk) / 2;
        let avg_spa = (target_spa + attacker_spa) / 2;

        if let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        }) {
            target.attack = (avg_atk).into();
            target.sp_attack = (avg_spa).into();
        }
        if let Some(attacker) = battle.get_pokemon_mut(PokemonIdent {
            player: source_player,
            slot: source_slot,
        }) {
            attacker.attack = (avg_atk).into();
            attacker.sp_attack = (avg_spa).into();
        }
    }

    if move_id == "powerswap" {
        let mut target_atk = 0;
        let mut target_spa = 0;
        if let Some(target) = battle.get_pokemon(PokemonIdent {
            player: target_player,
            slot: target_slot,
        }) {
            target_atk = target.boosts.atk.into_inner();
            target_spa = target.boosts.spa.into_inner();
        }
        let mut attacker_atk = 0;
        let mut attacker_spa = 0;
        if let Some(attacker) = battle.get_pokemon(PokemonIdent {
            player: source_player,
            slot: source_slot,
        }) {
            attacker_atk = attacker.boosts.atk.into_inner();
            attacker_spa = attacker.boosts.spa.into_inner();
        }
        if let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        }) {
            target.boosts.atk = (attacker_atk).into();
            target.boosts.spa = (attacker_spa).into();
            battle.log.push(BattleLog::SetBoost {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
                stat: "atk".to_string(),
                amount: attacker_atk as i32,
                from: "".to_string(),
            });
            battle.log.push(BattleLog::SetBoost {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
                stat: "spa".to_string(),
                amount: attacker_spa as i32,
                from: "".to_string(),
            });
        }
        if let Some(attacker) = battle.get_pokemon_mut(PokemonIdent {
            player: source_player,
            slot: source_slot,
        }) {
            attacker.boosts.atk = (target_atk).into();
            attacker.boosts.spa = (target_spa).into();
            battle.log.push(BattleLog::SetBoost {
                target: PokemonIdent {
                    player: source_player,
                    slot: source_slot,
                },
                stat: "atk".to_string(),
                amount: target_atk as i32,
                from: "".to_string(),
            });
            battle.log.push(BattleLog::SetBoost {
                target: PokemonIdent {
                    player: source_player,
                    slot: source_slot,
                },
                stat: "spa".to_string(),
                amount: target_spa as i32,
                from: "".to_string(),
            });
        }
    }

    if move_id == "speedswap" {
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        let attacker_ident = PokemonIdent {
            player: source_player,
            slot: source_slot,
        };
        let target_spe = battle
            .get_pokemon(target_ident)
            .map(|p| p.speed.into_inner())
            .unwrap_or(0);
        let attacker_spe = battle
            .get_pokemon(attacker_ident)
            .map(|p| p.speed.into_inner())
            .unwrap_or(0);
        if let Some(target) = battle.get_pokemon_mut(target_ident) {
            target.speed = attacker_spe.into();
        }
        if let Some(attacker) = battle.get_pokemon_mut(attacker_ident) {
            attacker.speed = target_spe.into();
        }
        battle.log.push(BattleLog::Text {
            message: format!(
                "|-swap|{}|spe|[from] move: Speed Swap|[of] {}",
                target_ident, attacker_ident
            ),
        });
    }

    if move_id == "psychup" {
        let mut target_boosts = None;
        if let Some(target) = battle.get_pokemon(PokemonIdent {
            player: target_player,
            slot: target_slot,
        }) {
            target_boosts = Some(target.boosts.clone());
        }
        if let Some(boosts) = target_boosts
            && let Some(attacker) = battle.get_pokemon_mut(PokemonIdent {
                player: source_player,
                slot: source_slot,
            })
        {
            attacker.boosts = boosts;
            battle.log.push(BattleLog::Fail {
                target: PokemonIdent {
                    player: source_player,
                    slot: source_slot,
                }, // just as a placeholder for psychup log
            });
        }
    }

    if move_id == "corrosivegas"
        && let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        })
        && target.item.is_some()
    {
        let item = target.item.take().unwrap();
        let item_str = item.to_string();
        let disp_name = if item_str == "leftovers" {
            "Leftovers".to_string()
        } else if item_str == "sitrusberry" {
            "Sitrus Berry".to_string()
        } else {
            item_str
        };

        battle.log.push(BattleLog::EndItem {
            target: PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            item: disp_name,
        });
    }

    if move_id == "feint"
        && let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        })
    {
        let removed = target.volatile_status.iter().any(|vs| {
            matches!(
                vs,
                VolatileStatus::Protect
                    | VolatileStatus::Kingsshield
                    | VolatileStatus::Spikyshield
                    | VolatileStatus::Banefulbunker
            )
        });

        if removed {
            target.volatile_status.retain(|vs| {
                !matches!(
                    vs,
                    VolatileStatus::Protect
                        | VolatileStatus::Kingsshield
                        | VolatileStatus::Spikyshield
                        | VolatileStatus::Banefulbunker
                )
            });
            battle.log.push(BattleLog::Text {
                message: format!(
                    "|-activate|{}|move: Feint",
                    PokemonIdent {
                        player: target_player,
                        slot: target_slot
                    }
                ),
            });
        }
    }

    if move_id == "gravity" {
        println!("EXECUTING GRAVITY LOGIC");
        battle.gravity_turns_left = 5;
        battle.log.push(BattleLog::Text {
            message: "-fieldstart|move: Gravity".to_string(),
        });
    }

    if move_id == "entrainment" {
        let attacker_ability = battle
            .get_pokemon(PokemonIdent {
                player: source_player,
                slot: source_slot,
            })
            .and_then(|p| p.ability.clone());
        let _target_ability = battle
            .get_pokemon(PokemonIdent {
                player: target_player,
                slot: target_slot,
            })
            .and_then(|p| p.ability.clone());
        let unentrainable = [
            "disguise",
            "stancechange",
            "powerconstruct",
            "schooling",
            "shieldsdown",
            "zenmode",
            "truant",
        ]; // Add more if needed
        let mut fail = false;

        if let Some(aa) = &attacker_ability {
            if unentrainable.contains(&aa.as_str()) {
                fail = true;
            }
        } else {
            fail = true;
        }

        if fail {
            battle.log.push(BattleLog::Fail {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
            });
        } else if let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        }) {
            target.ability = attacker_ability.clone();
            battle.log.push(BattleLog::EndAbility {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
            });
            battle.log.push(BattleLog::Ability {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
                ability: attacker_ability.unwrap().as_str().to_string(),
                from_move: Some("Entrainment".to_string()),

                of: None,
            });
        }
    }

    if move_id == "electrify" {
        battle.section_apply_volatile(
            PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            VolatileStatus::Electrify,
        );
    }

    if move_id == "defog" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Evasion, -1)],
            source_player,
            Some(move_id),
        );
        // Remove terrain
        clear_terrain(battle);
        // Remove side conditions
        let mut p1_removed = vec![];
        let mut p2_removed = vec![];

        if battle.p1.aurora_veil_turns > 0 {
            battle.p1.aurora_veil_turns = 0;
            p1_removed.push("Aurora Veil");
        }
        if battle.p1.reflect_turns > 0 {
            battle.p1.reflect_turns = 0;
            p1_removed.push("Reflect");
        }
        if battle.p1.lightscreen_turns > 0 {
            battle.p1.lightscreen_turns = 0;
            p1_removed.push("Light Screen");
        }
        if battle.p1.safeguard_turns > 0 {
            battle.p1.safeguard_turns = 0;
            p1_removed.push("Safeguard");
        }

        if battle.p2.aurora_veil_turns > 0 {
            battle.p2.aurora_veil_turns = 0;
            p2_removed.push("Aurora Veil");
        }
        if battle.p2.reflect_turns > 0 {
            battle.p2.reflect_turns = 0;
            p2_removed.push("Reflect");
        }
        if battle.p2.lightscreen_turns > 0 {
            battle.p2.lightscreen_turns = 0;
            p2_removed.push("Light Screen");
        }
        if battle.p2.safeguard_turns > 0 {
            battle.p2.safeguard_turns = 0;
            p2_removed.push("Safeguard");
        }

        for condition in p1_removed {
            battle.log.push(BattleLog::SideEnd {
                player: 1,
                effect: condition.to_string(),
            });
        }
        for condition in p2_removed {
            battle.log.push(BattleLog::SideEnd {
                player: 2,
                effect: condition.to_string(),
            });
        }
    }

    if move_id == "block"
        || move_id == "meanlook"
        || move_id == "spiderweb"
        || move_id == "spiritshackle"
    {
        battle.log.push(BattleLog::Activate {
            target: PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            effect: "trapped".to_string(),
        });
    }

    if move_id == "jawlock" {
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        let target_alive = battle
            .get_pokemon(target_ident)
            .is_some_and(|p| p.hp.into_inner() > 0);
        if target_alive {
            let attacker_ident = PokemonIdent {
                player: source_player,
                slot: source_slot,
            };

            let source_is_ghost = battle
                .get_pokemon(attacker_ident)
                .map(|p| p.get_types().contains(&Type::Ghost))
                .unwrap_or(false);
            if !source_is_ghost {
                if let Some(p) = battle.get_pokemon_mut(attacker_ident) {
                    p.trapped_by = Some(target_ident);
                }
                battle.log.push(BattleLog::Activate {
                    target: attacker_ident,
                    effect: "trapped".to_string(),
                });
            }

            let target_is_ghost = battle
                .get_pokemon(target_ident)
                .map(|p| p.get_types().contains(&Type::Ghost))
                .unwrap_or(false);
            if !target_is_ghost {
                if let Some(p) = battle.get_pokemon_mut(target_ident) {
                    p.trapped_by = Some(attacker_ident);
                }
                battle.log.push(BattleLog::Activate {
                    target: target_ident,
                    effect: "trapped".to_string(),
                });
            }
        }
    }

    if move_id == "spikes" {
        let side = if target_player == 1 {
            &mut battle.p1
        } else {
            &mut battle.p2
        };
        if side.spikes < 3 {
            side.spikes += 1;
            battle.log.push(BattleLog::SideStart {
                player: target_player,
                effect: "Spikes".to_string(),
            });
        } else {
            battle.log.push(BattleLog::Fail {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
            });
        }
    }

    if move_id == "toxicspikes" {
        let side = if target_player == 1 {
            &mut battle.p1
        } else {
            &mut battle.p2
        };
        if side.toxic_spikes < 2 {
            side.toxic_spikes += 1;
            battle.log.push(BattleLog::SideStart {
                player: target_player,
                effect: "Toxic Spikes".to_string(),
            });
        } else {
            battle.log.push(BattleLog::Fail {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
            });
        }
    }

    if move_id == "stealthrock" {
        let side = if target_player == 1 {
            &mut battle.p1
        } else {
            &mut battle.p2
        };
        if side.stealth_rock {
            battle.log.push(BattleLog::Fail {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
            });
        } else {
            side.stealth_rock = true;
            battle.log.push(BattleLog::SideStart {
                player: target_player,
                effect: "Stealth Rock".to_string(),
            });
        }
    }

    if move_id == "stickyweb" {
        let side = if target_player == 1 {
            &mut battle.p1
        } else {
            &mut battle.p2
        };
        if side.sticky_web {
            battle.log.push(BattleLog::Fail {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
            });
        } else {
            side.sticky_web = true;
            battle.log.push(BattleLog::SideStart {
                player: target_player,
                effect: "Sticky Web".to_string(),
            });
        }
    }

    if move_id == "leechseed"
        && let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        })
    {
        target.leech_seeded_by = Some(PokemonIdent {
            player: source_player,
            slot: source_slot,
        });
    }

    if (move_id == "rapidspin" || move_id == "mortalspin")
        && let Some(side) = if source_player == 1 {
            Some(&mut battle.p1)
        } else {
            Some(&mut battle.p2)
        }
    {
        side.spikes = 0;
        side.toxic_spikes = 0;
        side.stealth_rock = false;
        side.sticky_web = false;
    }

    if move_id == "steelroller" {
        clear_terrain(battle);
    }

    if move_id == "stoneaxe" {
        let side = if target_player == 1 {
            &mut battle.p1
        } else {
            &mut battle.p2
        };
        if !side.stealth_rock {
            side.stealth_rock = true;
            battle.log.push(BattleLog::SideStart {
                player: target_player,
                effect: "Stealth Rock".to_string(),
            });
        }
    }

    if move_id == "trickroom" {
        if battle.trick_room.is_some() {
            battle.trick_room = None;
            battle.log.push(BattleLog::Text {
                message: "|-fieldend|move: Trick Room".to_string(),
            });
        } else {
            battle.trick_room = std::num::NonZeroU8::new(5);
            battle.log.push(BattleLog::Text {
                message: "|-fieldstart|move: Trick Room".to_string(),
            });
        }
    }

    if move_id == "imprison" {
        battle.section_apply_volatile(
            PokemonIdent {
                player: source_player,
                slot: source_slot,
            },
            VolatileStatus::Imprison,
        );
    }

    if move_id == "ingrain" {
        battle.section_apply_volatile(
            PokemonIdent {
                player: source_player,
                slot: source_slot,
            },
            VolatileStatus::Ingrain,
        );
    }

    if move_id == "roar"
        || move_id == "whirlwind"
        || move_id == "circlethrow"
        || move_id == "dragontail"
    {
        // Circle Throw / Dragon Tail only force switch if target survives. Roar/Whirlwind don't do damage, so target is usually alive.
        if let Some(target_pkmn) = battle.get_pokemon(PokemonIdent {
            player: target_player,
            slot: target_slot,
        }) && target_pkmn.hp > 0
        {
            let has_suction_cups =
                target_pkmn.ability.as_ref().map(|a| a.as_str()) == Some("suctioncups");
            if !has_suction_cups {
                battle.force_switch_random(PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                });
            }
        }
    }

    if move_id == "trick" || move_id == "switcheroo" {
        // Swap items - simplified version
        battle.log.push(BattleLog::SingleTurn {
            target: PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            effect: "trick".to_string(),
        });
    }

    if move_id == "spite" {
        battle.log.push(BattleLog::SingleTurn {
            target: PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            effect: "spite".to_string(),
        });
    }

    if move_id == "octolock" {
        battle.section_apply_volatile(
            PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            VolatileStatus::Octolock,
        );
    }

    if move_id == "torment" {
        if check_aroma_veil(
            battle,
            target_player,
            target_slot,
            source_player,
            source_slot,
        ) {
            return;
        }
        battle.section_apply_volatile(
            PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            VolatileStatus::Torment,
        );
    }

    if move_id == "substitute" {
        let ident = PokemonIdent {
            player: source_player,
            slot: source_slot,
        };
        if let Some(user) = battle.get_pokemon_mut(ident) {
            let max_hp = user.maxhp.into_inner();
            let cost = max_hp / 4;
            if user.volatile_status.contains(&VolatileStatus::Substitute)
                || user.hp.into_inner() <= cost
            {
                battle.log.push(BattleLog::Fail { target: ident });
            } else {
                user.hp = (user.hp.into_inner() - cost).into();
                user.substitute_hp = cost;
                user.volatile_status.push(VolatileStatus::Substitute);
                battle.log.push(BattleLog::Start {
                    target: ident,
                    effect: "Substitute".to_string(),
                });
            }
        }
    }

    if move_id == "recycle" {
        battle.log.push(BattleLog::SingleTurn {
            target: PokemonIdent {
                player: source_player,
                slot: source_slot,
            },
            effect: "recycle".to_string(),
        });
    }

    if move_id == "soak"
        && let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        })
    {
        target.type1 = Type::Water;
        target.type2 = None;
        target.added_type = None;
    }

    if move_id == "instruct" {
        battle.log.push(BattleLog::SingleTurn {
            target: PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            effect: "instruct".to_string(),
        });
    }

    if move_id == "outrage"
        || move_id == "thrash"
        || move_id == "petaldance"
        || move_id == "ragingfury"
    {
        // Multiturn moves
        if let Some(user) = battle.get_pokemon_mut(PokemonIdent {
            player: source_player,
            slot: source_slot,
        }) && !user.volatile_status.contains(&VolatileStatus::Lockedmove)
        {
            user.volatile_status.push(VolatileStatus::Lockedmove);
            user.locked_move_turns = 3;
        }
        battle.log.push(BattleLog::SingleTurn {
            target: PokemonIdent {
                player: source_player,
                slot: source_slot,
            },
            effect: "lockedmove".to_string(),
        });
    }

    if move_id == "teatime" {
        battle.log.push(BattleLog::SingleTurn {
            target: PokemonIdent {
                player: source_player,
                slot: source_slot,
            },
            effect: "teatime".to_string(),
        });
    }

    if move_id == "stockpile" {
        battle.section_apply_volatile(
            PokemonIdent {
                player: source_player,
                slot: source_slot,
            },
            VolatileStatus::Stockpile,
        );
    }

    if move_id == "swallow" || move_id == "spitup" {
        battle.log.push(BattleLog::SingleTurn {
            target: PokemonIdent {
                player: source_player,
                slot: source_slot,
            },
            effect: "swallow".to_string(),
        });
    }

    if move_id == "transform" {
        let user_ident = PokemonIdent {
            player: source_player,
            slot: source_slot,
        };
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        let success =
            crate::sim::sections::transform::section_transform(battle, user_ident, target_ident);
        if !success {
            battle.log.push(BattleLog::Fail { target: user_ident });
        }
    }

    if move_id == "uproar" {
        if let Some(user) = battle.get_pokemon_mut(PokemonIdent {
            player: source_player,
            slot: source_slot,
        }) && !user.volatile_status.contains(&VolatileStatus::Uproar)
        {
            user.volatile_status.push(VolatileStatus::Uproar);
            user.uproar_turns = 3;
        }
        battle.log.push(BattleLog::SingleTurn {
            target: PokemonIdent {
                player: source_player,
                slot: source_slot,
            },
            effect: "uproar".to_string(),
        });
    }

    if move_id == "wish" {
        let user_ident = PokemonIdent {
            player: source_player,
            slot: source_slot,
        };
        let is_heal_blocked = battle
            .get_pokemon(user_ident)
            .map(|p| p.volatile_status.contains(&VolatileStatus::Healblock))
            .unwrap_or(false);
        let already_wished = battle.wish_effects.iter().any(|w| w.target == user_ident);

        if is_heal_blocked {
            battle.log.push(BattleLog::Cant {
                target: user_ident,
                reason: "Heal Block".to_string(),
                move_id: Some("wish".to_string()),
            });
        } else if already_wished {
            battle.log.push(BattleLog::Fail { target: user_ident });
        } else if let Some(user) = battle.get_pokemon(user_ident) {
            let heal_amount = (user.maxhp.into_inner() / 2).max(1);
            battle.wish_effects.push(crate::sim::battle::WishEffect {
                target: user_ident,
                heal_amount,
                turns_left: 2,
            });
            battle.log.push(BattleLog::SingleTurn {
                target: user_ident,
                effect: "wish".to_string(),
            });
        }
    }

    if move_id == "curse" {
        let is_ghost = battle
            .get_pokemon(PokemonIdent {
                player: source_player,
                slot: source_slot,
            })
            .map(|p| p.get_types().contains(&Type::Ghost))
            .unwrap_or(false);
        if !is_ghost
            && let Some(target) = battle.get_pokemon_mut(PokemonIdent {
                player: target_player,
                slot: target_slot,
            })
        {
            target
                .volatile_status
                .retain(|s| *s != VolatileStatus::Curse);
        }
        if is_ghost {
            let damage = battle
                .get_pokemon(PokemonIdent {
                    player: source_player,
                    slot: source_slot,
                })
                .unwrap()
                .maxhp
                .into_inner()
                / 2;
            battle.section_take_damage(
                PokemonIdent {
                    player: source_player,
                    slot: source_slot,
                },
                damage,
            );
            battle.log.push(BattleLog::Damage {
                target: PokemonIdent {
                    player: source_player,
                    slot: source_slot,
                },
                damage,
                effectiveness: 0,
                is_crit: false,
                absorbed: false,
                from_effect: None,
            });
            battle.section_apply_volatile(
                PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
                VolatileStatus::Curse,
            );
        } else {
            battle.apply_stat_change(
                source_player,
                source_slot,
                vec![(Stat::Atk, 1), (Stat::Def, 1), (Stat::Spe, -1)],
                source_player,
                Some(move_id),
            );
        }
    }

    if move_id == "reflecttype" {
        let target_types = battle
            .get_pokemon(PokemonIdent {
                player: target_player,
                slot: target_slot,
            })
            .map(|p| (p.type1, p.type2, p.added_type));
        if let Some((type1, type2, added_type)) = target_types
            && let Some(source) = battle.get_pokemon_mut(PokemonIdent {
                player: source_player,
                slot: source_slot,
            })
        {
            source.type1 = type1;
            source.type2 = type2;
            source.added_type = added_type;
        }
    }

    if move_id == "roleplay" {
        let target_ability = battle
            .get_pokemon(PokemonIdent {
                player: target_player,
                slot: target_slot,
            })
            .and_then(|p| p.ability.clone());
        if let Some(source) = battle.get_pokemon_mut(PokemonIdent {
            player: source_player,
            slot: source_slot,
        }) {
            source.ability = target_ability;
        }
    }

    if move_id == "skillswap" {
        let source_ident = PokemonIdent {
            player: source_player,
            slot: source_slot,
        };
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        let source_ability = battle
            .get_pokemon(source_ident)
            .and_then(|p| p.ability.clone());
        let target_ability = battle
            .get_pokemon(target_ident)
            .and_then(|p| p.ability.clone());
        if let Some(source) = battle.get_pokemon_mut(source_ident) {
            source.ability = target_ability;
        }
        if let Some(target) = battle.get_pokemon_mut(target_ident) {
            target.ability = source_ability;
        }
    }

    if move_id == "fling"
        && let Some(item) = flung_item
    {
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        match item.as_ref() {
            "light-ball" => {
                battle.section_apply_status(target_ident, Status::Paralysis, None);
            }
            "flame-orb" => {
                battle.section_apply_status(target_ident, Status::Burn, None);
            }
            "toxic-orb" => {
                battle.section_apply_status(target_ident, Status::Toxic, None);
            }
            "poison-barb" => {
                battle.section_apply_status(target_ident, Status::Poison, None);
            }
            "kings-rock" | "razor-fang" => {
                battle.section_apply_volatile(target_ident, VolatileStatus::Flinch);
            }
            _ => {}
        }
    }
    if move_id == "encore"
        && check_aroma_veil(
            battle,
            target_player,
            target_slot,
            source_player,
            source_slot,
        )
    {
        return;
    }
    if move_id == "encore"
        && let Some(target) = battle.get_pokemon(PokemonIdent {
            player: target_player,
            slot: target_slot,
        })
    {
        if let Some(last_move) = target.last_move_used.as_ref() {
            if target.encore_turns > 0 {
                battle.log.push(BattleLog::Fail {
                    target: PokemonIdent {
                        player: target_player,
                        slot: target_slot,
                    },
                });
                return;
            }

            let max_pp = pkmn_meta::move_meta::get_move_meta(last_move)
                .map(|m| *m.pp())
                .unwrap_or(0);
            let current_pp = *target.pp_used.get(last_move).unwrap_or(&0);

            if current_pp >= max_pp {
                battle.log.push(BattleLog::Fail {
                    target: PokemonIdent {
                        player: target_player,
                        slot: target_slot,
                    },
                });
                return;
            }

            let last_move_clone = last_move.clone();
            if let Some(target_mut) = battle.get_pokemon_mut(PokemonIdent {
                player: target_player,
                slot: target_slot,
            }) {
                target_mut.encored_move = Some(last_move_clone.clone());
                target_mut.encore_turns = 3;
            }
            battle.section_apply_volatile(
                PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
                VolatileStatus::Encore,
            );

            // If the target has a pending action this turn, update its move and priority
            let new_priority = battle
                .get_pokemon(PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                })
                .map(|pkmn| {
                    crate::sim::turn_order::TurnOrderResolver::new(battle)
                        .get_move_priority(&last_move_clone, pkmn)
                })
                .unwrap_or(0);

            for action in &mut battle.turn_actions {
                if let crate::sim::action::Action::Move(m) = action
                    && m.player == target_player
                    && m.slot == target_slot
                {
                    m.move_id = last_move_clone.clone();
                    m.priority = new_priority;
                }
            }
        } else {
            battle.log.push(BattleLog::Fail {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
            });
        }
    }

    if move_id == "disable"
        && check_aroma_veil(
            battle,
            target_player,
            target_slot,
            source_player,
            source_slot,
        )
    {
        return;
    }
    if move_id == "disable"
        && let Some(target) = battle.get_pokemon(PokemonIdent {
            player: target_player,
            slot: target_slot,
        })
    {
        if let Some(last_move) = target.last_move_used.as_ref() {
            if target.disable_turns > 0 {
                battle.log.push(BattleLog::Fail {
                    target: PokemonIdent {
                        player: target_player,
                        slot: target_slot,
                    },
                });
                return;
            }

            let last_move_clone = last_move.clone();
            if let Some(target_mut) = battle.get_pokemon_mut(PokemonIdent {
                player: target_player,
                slot: target_slot,
            }) {
                target_mut.disabled_move = Some(last_move_clone.clone());
                target_mut.disable_turns = 4;
            }
        } else {
            battle.log.push(BattleLog::Fail {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
            });
        }
    }
    if move_id == "pluck" || move_id == "bugbite" {
        let mut eaten = None;
        if let Some(target) = battle.get_pokemon_mut(PokemonIdent {
            player: target_player,
            slot: target_slot,
        }) && let Some(item) = target.item.as_ref()
        {
            let item_str = item.to_string().replace("-", "");
            if item_str.ends_with("berry") {
                eaten = Some(item_str);
                target.item = None;
            }
        }
        if let Some(item_str) = eaten {
            let item_name = if item_str == "sitrusberry" {
                "Sitrus-berry".to_string()
            } else if item_str == "oranberry" {
                "Oran-berry".to_string()
            } else {
                item_str.clone()
            };
            let move_name = if move_id == "pluck" {
                "Pluck"
            } else {
                "Bug Bite"
            };
            battle.log.push(BattleLog::Text {
                message: format!(
                    "|-enditem|{}|{}|[from] stealeat|[move] {}|[of] {}",
                    PokemonIdent {
                        player: target_player,
                        slot: target_slot
                    },
                    item_name,
                    move_name,
                    PokemonIdent {
                        player: source_player,
                        slot: source_slot
                    }
                ),
            });

            if item_str == "sitrusberry" {
                if let Some(attacker) = battle.get_pokemon(PokemonIdent {
                    player: source_player,
                    slot: source_slot,
                }) {
                    let heal = std::cmp::max(1, attacker.maxhp.into_inner() / 4);
                    battle.section_heal(
                        PokemonIdent {
                            player: source_player,
                            slot: source_slot,
                        },
                        heal.into(),
                    );
                }
            } else if item_str == "oranberry" {
                battle.section_heal(
                    PokemonIdent {
                        player: source_player,
                        slot: source_slot,
                    },
                    10.into(),
                );
            }
        }
    }

    if move_id == "acupressure" {
        let target_boosts = if target_player == 1 {
            battle.p1.active.get(target_slot).map(|p| p.boosts.clone())
        } else {
            battle.p2.active.get(target_slot).map(|p| p.boosts.clone())
        };

        if let Some(boosts) = target_boosts {
            let mut available_stats = Vec::new();
            if boosts.atk.into_inner() < 6 {
                available_stats.push(Stat::Atk);
            }
            if boosts.def.into_inner() < 6 {
                available_stats.push(Stat::Def);
            }
            if boosts.spa.into_inner() < 6 {
                available_stats.push(Stat::Spa);
            }
            if boosts.spd.into_inner() < 6 {
                available_stats.push(Stat::Spd);
            }
            if boosts.spe.into_inner() < 6 {
                available_stats.push(Stat::Spe);
            }
            if boosts.accuracy.into_inner() < 6 {
                available_stats.push(Stat::Accuracy);
            }
            if boosts.evasion.into_inner() < 6 {
                available_stats.push(Stat::Evasion);
            }

            if !available_stats.is_empty() {
                let chosen = if let Some(config) = battle.rng_config.as_mut()
                    && let Some(choices) = config.stat_choices.as_mut()
                    && !choices.is_empty()
                {
                    let stat_str = choices.remove(0);
                    match stat_str.as_str() {
                        "atk" => Stat::Atk,
                        "def" => Stat::Def,
                        "spa" => Stat::Spa,
                        "spd" => Stat::Spd,
                        "spe" => Stat::Spe,
                        "accuracy" => Stat::Accuracy,
                        "evasion" => Stat::Evasion,
                        _ => {
                            use rand::seq::IndexedRandom;
                            let mut rng = rand::rng();
                            *available_stats.choose(&mut rng).unwrap_or(&Stat::Atk)
                        }
                    }
                } else {
                    use rand::seq::IndexedRandom;
                    let mut rng = rand::rng();
                    *available_stats.choose(&mut rng).unwrap_or(&Stat::Atk)
                };

                battle.apply_stat_change(
                    target_player,
                    target_slot,
                    vec![(chosen, 2)],
                    source_player,
                    Some(move_id),
                );
            } else {
                // Fail if all stats are maxed
                battle.log.push(BattleLog::Fail {
                    target: PokemonIdent {
                        player: source_player,
                        slot: source_slot,
                    },
                });
            }
        }
    } else if move_id == "coaching" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Atk, 1), (Stat::Def, 1)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "decorate" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Atk, 2), (Stat::Spa, 2)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "screech" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Def, -2)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "faketears" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Spd, -2)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "cottonspore" || move_id == "stringshot" || move_id == "scaryface" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Spe, -2)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "eerieimpulse" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Spa, -2)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "featherdance" || move_id == "charm" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Atk, -2)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "swagger" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Atk, 2)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "flatter" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Spa, 1)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "sweetscent" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Evasion, -2)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "tearfullook" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Atk, -1), (Stat::Spa, -1)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "spicyextract" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Atk, 2), (Stat::Def, -2)],
            source_player,
            Some(move_id),
        );
    } else if move_id == "topsyturvy" {
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        if let Some(target) = battle.get_pokemon_mut(target_ident) {
            target.boosts.atk = (-target.boosts.atk.into_inner()).into();
            target.boosts.def = (-target.boosts.def.into_inner()).into();
            target.boosts.spa = (-target.boosts.spa.into_inner()).into();
            target.boosts.spd = (-target.boosts.spd.into_inner()).into();
            target.boosts.spe = (-target.boosts.spe.into_inner()).into();
            target.boosts.accuracy = (-target.boosts.accuracy.into_inner()).into();
            target.boosts.evasion = (-target.boosts.evasion.into_inner()).into();
            battle.log.push(BattleLog::Text {
                message: format!("|-invertboost|{}|[from] move: Topsy-Turvy", target_ident),
            });
        }
    } else if move_id == "strengthsap" {
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        let attacker_ident = PokemonIdent {
            player: source_player,
            slot: source_slot,
        };
        if let Some(target_p) = battle.get_pokemon(target_ident) {
            let target_atk = target_p.attack.into_inner();
            let stage = target_p.boosts.atk.into_inner() as i32;
            let final_atk = if stage >= 0 {
                target_atk * (2 + stage) / 2
            } else {
                target_atk * 2 / (2 - stage)
            };
            let is_ooze = target_p.ability.as_ref().map(|a| a.as_str()) == Some("liquidooze");
            if is_ooze {
                battle.section_take_damage(attacker_ident, final_atk);
                battle.log.push(crate::sim::log::BattleLog::Damage {
                    target: attacker_ident,
                    damage: final_atk,
                    is_crit: false,
                    effectiveness: 0,
                    absorbed: false,
                    from_effect: Some("ability: Liquid Ooze".to_string()),
                });
            } else {
                battle.section_heal(attacker_ident, final_atk.into());
            }
            battle.apply_stat_change(
                target_player,
                target_slot,
                vec![(Stat::Atk, -1)],
                source_player,
                Some(move_id),
            );
        }
    } else if move_id == "upperhand" {
        battle.section_apply_volatile(
            PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            VolatileStatus::Flinch,
        );
    } else if move_id == "throatchop" {
        battle.section_apply_volatile(
            PokemonIdent {
                player: target_player,
                slot: target_slot,
            },
            VolatileStatus::Throatchop,
        );
    } else if move_id == "sparklingaria" {
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        if let Some(target_p) = battle.get_pokemon_mut(target_ident)
            && target_p.status == Some(Status::Burn)
        {
            target_p.status = None;
            battle.log.push(BattleLog::CureStatus {
                target: target_ident,
            });
        }
    } else if move_id == "toxic" {
        let attacker_ident = PokemonIdent {
            player: source_player,
            slot: source_slot,
        };
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        let attacker_corrosion = battle
            .get_pokemon(attacker_ident)
            .and_then(|p| p.ability.as_ref().map(|a| a.as_str()))
            == Some("corrosion");
        if let Some(target) = battle.get_pokemon(target_ident) {
            let target_types = target.get_types();
            let type_immune = !attacker_corrosion
                && (target_types.contains(&Type::Poison) || target_types.contains(&Type::Steel));
            if target.status.is_none() && !type_immune {
                battle.section_apply_status(target_ident, Status::Toxic, Some(attacker_ident));
            } else {
                battle.log.push(BattleLog::Fail {
                    target: target_ident,
                });
            }
        }
    } else if move_id == "afteryou" {
        // Find the target's action in battle.turn_actions
        if let Some(idx) = battle
            .turn_actions
            .iter()
            .position(|a| a.player() == target_player && a.slot() == target_slot)
        {
            let action = battle.turn_actions.remove(idx);
            battle.turn_actions.insert(0, action);

            battle.log.push(BattleLog::Activate {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
                effect: "move: After You".to_string(),
            });
        } else {
            battle.log.push(BattleLog::Fail {
                target: PokemonIdent {
                    player: source_player,
                    slot: source_slot,
                },
            });
        }
    } else if move_id == "taunt" {
        if check_aroma_veil(
            battle,
            target_player,
            target_slot,
            source_player,
            source_slot,
        ) {
            return;
        }
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        let p = battle.get_pokemon(target_ident).unwrap();
        let source_ability = battle
            .get_pokemon(PokemonIdent {
                player: source_player,
                slot: source_slot,
            })
            .and_then(|p| p.ability.clone());
        let mold_breaker = source_ability
            .as_ref()
            .map(|a| a.as_str())
            .is_some_and(|a| matches!(a, "moldbreaker" | "teravolt" | "turboblaze"));
        if !mold_breaker && p.ability.as_ref().map(|a| a.as_str()) == Some("oblivious") {
            return;
        }
        if p.taunt_turns == 0 {
            let acted = p.turn_state.acted_this_turn;
            let turns = if acted { 4 } else { 3 };
            let p_mut = battle.get_pokemon_mut(target_ident).unwrap();
            p_mut.taunt_turns = turns;
        } else {
            battle.log.push(BattleLog::Fail {
                target: target_ident,
            });
        }
    } else if move_id == "quash" {
        // Find the target's action in battle.turn_actions
        if let Some(idx) = battle
            .turn_actions
            .iter()
            .position(|a| a.player() == target_player && a.slot() == target_slot)
        {
            let action = battle.turn_actions.remove(idx);
            battle.turn_actions.push(action);

            battle.log.push(BattleLog::Activate {
                target: PokemonIdent {
                    player: target_player,
                    slot: target_slot,
                },
                effect: "move: Quash".to_string(),
            });
        } else {
            battle.log.push(BattleLog::Fail {
                target: PokemonIdent {
                    player: source_player,
                    slot: source_slot,
                },
            });
        }
    } else if move_id == "babydolleyes" {
        battle.apply_stat_change(
            target_player,
            target_slot,
            vec![(Stat::Atk, -1)],
            source_player,
            Some(move_id),
        );
    }
}

pub fn handle_move_self_effect(
    battle: &mut Battle,
    move_id: &str,
    player: u8,
    slot: usize,
    volatile_status: Option<VolatileStatus>,
) {
    if move_id == "substitute" {
        return;
    }
    let target = PokemonIdent { player, slot };
    if let Some(volatile_status) = volatile_status {
        if volatile_status == VolatileStatus::Powertrick
            && battle
                .get_pokemon(target)
                .is_some_and(|pokemon| pokemon.volatile_status.contains(&volatile_status))
        {
            if let Some(pokemon) = battle.get_pokemon_mut(target) {
                pokemon
                    .volatile_status
                    .retain(|status| *status != volatile_status);
            }
            battle.log.push(BattleLog::VolatileStatusEnd {
                target,
                volatile_status: volatile_status.to_string(),
            });
        } else {
            battle.section_apply_volatile(target, volatile_status);
        }
    }

    match move_id {
        "shellsmash" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![
                    (Stat::Def, -1),
                    (Stat::Spd, -1),
                    (Stat::Atk, 2),
                    (Stat::Spa, 2),
                    (Stat::Spe, 2),
                ],
                player,
                Some(move_id),
            );
        }
        "burnup" | "doubleshock" => {
            let (lost_type, move_name) = if move_id == "burnup" {
                (Type::Fire, "Burn Up")
            } else {
                (Type::Electric, "Double Shock")
            };
            if let Some(p) = battle.get_pokemon_mut(PokemonIdent { player, slot }) {
                let mut changed = false;
                if p.type1 == lost_type {
                    p.type1 = Type::Typeless;
                    changed = true;
                }
                if p.type2 == Some(lost_type) {
                    p.type2 = Some(Type::Typeless);
                    changed = true;
                }
                if p.added_type == Some(lost_type) {
                    p.added_type = Some(Type::Typeless);
                    changed = true;
                }
                if changed {
                    let type_strings: Vec<String> = std::iter::once(p.type1)
                        .chain(p.type2)
                        .chain(p.added_type)
                        .map(|t| {
                            if t == Type::Typeless {
                                "???".to_string()
                            } else {
                                format!("{:?}", t)
                            }
                        })
                        .collect();

                    battle.log.push(BattleLog::Start {
                        target: PokemonIdent { player, slot },
                        effect: format!(
                            "typechange|{}|[from] move: {}",
                            type_strings.join("/"),
                            move_name
                        ),
                    });
                }
            }
        }
        "bellydrum" => {
            if let Some(p) = battle.get_pokemon(PokemonIdent { player, slot }) {
                let cost = std::cmp::max(1, p.maxhp.into_inner() / 2);
                battle.section_take_damage(PokemonIdent { player, slot }, cost);
                battle.log.push(BattleLog::Damage {
                    target: PokemonIdent { player, slot },
                    damage: cost,
                    is_crit: false,
                    effectiveness: 0,
                    absorbed: false,
                    from_effect: None,
                });
            }
            if let Some(p) = battle.get_pokemon_mut(PokemonIdent { player, slot }) {
                p.boosts.atk = 6.into();
                battle.log.push(BattleLog::SetBoost {
                    target: PokemonIdent { player, slot },
                    stat: "atk".to_string(),
                    amount: 6,
                    from: "Belly Drum".to_string(),
                });
            }
        }
        "clangoroussoul" => {
            if let Some(p) = battle.get_pokemon(PokemonIdent { player, slot }) {
                let cost = std::cmp::max(1, p.maxhp.into_inner() * 33 / 100);
                battle.section_take_damage(PokemonIdent { player, slot }, cost);
                battle.log.push(BattleLog::Damage {
                    target: PokemonIdent { player, slot },
                    damage: cost,
                    is_crit: false,
                    effectiveness: 0,
                    absorbed: false,
                    from_effect: None,
                });
            }
            battle.apply_stat_change(
                player,
                slot,
                vec![
                    (Stat::Atk, 1),
                    (Stat::Def, 1),
                    (Stat::Spa, 1),
                    (Stat::Spd, 1),
                    (Stat::Spe, 1),
                ],
                player,
                Some(move_id),
            );
        }
        "minimize" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Evasion, 2)],
                player,
                Some(move_id),
            );
        }
        "acidarmor" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Def, 2)], player, Some(move_id));
        }
        "agility" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Spe, 2)], player, Some(move_id));
        }
        "amnesia" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Spd, 2)], player, Some(move_id));
        }
        "aquaring" => {
            battle.section_apply_volatile(PokemonIdent { player, slot }, VolatileStatus::Aquaring);
        }
        "autotomize" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Spe, 2)], player, Some(move_id));
            if let Some(p) = battle.get_pokemon_mut(PokemonIdent { player, slot }) {
                if p.weight.into_inner() > 1000 {
                    p.weight = (p.weight.into_inner() - 1000).into();
                } else {
                    p.weight = 1.into();
                }
                let ident = p.ident.clone();
                battle.log.push(BattleLog::Text {
                    message: format!("|-start|{}|Autotomize", ident),
                });
            }
        }
        "swordsdance" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Atk, 2)], player, Some(move_id));
        }
        "rockpolish" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Spe, 2)], player, Some(move_id));
        }
        "healingwish" => {
            let ident = PokemonIdent { player, slot };
            let hp = battle
                .get_pokemon(ident)
                .map(|p| p.hp.into_inner())
                .unwrap_or(0);
            if hp > 0 {
                battle.section_take_damage(ident, hp);
                battle.log.push(BattleLog::Faint { target: ident });
            }
        }
        "magicroom" => {
            battle.magic_room_turns_left = 5;
            battle.log.push(BattleLog::TerrainChange {
                terrain: "move: Magic Room".to_string(),
                is_start: true,
            });
        }
        "wonderroom" => {
            battle.wonder_room_turns_left = 5;
            battle.log.push(BattleLog::TerrainChange {
                terrain: "move: Wonder Room".to_string(),
                is_start: true,
            });
        }
        "scaleshot" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Def, -1), (Stat::Spe, 1)],
                player,
                Some(move_id),
            );
        }
        "tidyup" => {
            battle.p1.spikes = 0;
            battle.p1.toxic_spikes = 0;
            battle.p1.stealth_rock = false;
            battle.p1.sticky_web = false;
            battle.p2.spikes = 0;
            battle.p2.toxic_spikes = 0;
            battle.p2.stealth_rock = false;
            battle.p2.sticky_web = false;
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Atk, 1), (Stat::Spe, 1)],
                player,
                Some(move_id),
            );
        }
        "stuffcheeks" => {
            let target = PokemonIdent { player, slot };
            if let Some(p) = battle.get_pokemon_mut(target) {
                let item = p.item.take();
                if let Some(item_name) = item {
                    battle.log.push(BattleLog::Text {
                        message: format!("|-enditem|{}|{}|[eat]", target, item_name),
                    });
                }
            }
            battle.apply_stat_change(player, slot, vec![(Stat::Def, 2)], player, Some(move_id));
        }
        "shedtail" => {
            let ident = PokemonIdent { player, slot };
            if let Some(p) = battle.get_pokemon_mut(ident) {
                let cost = (p.maxhp.into_inner() + 1) / 2;
                p.hp = std::cmp::max(0, p.hp.into_inner() - cost).into();
                battle.log.push(BattleLog::Damage {
                    target: ident,
                    damage: cost,
                    is_crit: false,
                    effectiveness: 0,
                    absorbed: false,
                    from_effect: None,
                });
                battle.section_apply_volatile(ident, VolatileStatus::Substitute);
            }
        }
        "magneticflux" => {
            let eligible = battle.get_pokemon(target).is_some_and(|p| {
                p.ability.as_ref().is_some_and(|ability| {
                    ability.as_str() == "plus" || ability.as_str() == "minus"
                })
            });
            if eligible {
                battle.apply_stat_change(
                    player,
                    slot,
                    vec![(Stat::Def, 1), (Stat::Spd, 1)],
                    player,
                    Some(move_id),
                );
            } else {
                battle.log.push(BattleLog::Fail { target });
            }
        }
        "meteorbeam" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Spa, 1)], player, Some(move_id));
        }
        "dragondance" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Atk, 1), (Stat::Spe, 1)],
                player,
                Some(move_id),
            );
        }
        "shiftgear" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Spe, 2), (Stat::Atk, 1)],
                player,
                Some(move_id),
            );
        }
        "bulkup" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Atk, 1), (Stat::Def, 1)],
                player,
                Some(move_id),
            );
        }
        "calmmind" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Spa, 1), (Stat::Spd, 1)],
                player,
                Some(move_id),
            );
        }
        "coil" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Atk, 1), (Stat::Def, 1), (Stat::Accuracy, 1)],
                player,
                Some(move_id),
            );
        }
        "cosmicpower" | "defendorder" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Def, 1), (Stat::Spd, 1)],
                player,
                Some(move_id),
            );
        }
        "cottonguard" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Def, 3)], player, Some(move_id));
        }
        "doubleteam" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Evasion, 1)],
                player,
                Some(move_id),
            );
        }
        "growth" => {
            let is_megasol = battle
                .get_pokemon(PokemonIdent { player, slot })
                .and_then(|p| p.ability.as_ref())
                .is_some_and(|a| a.as_str() == "megasol");
            let boost = if battle.weather == Some(Weather::HashSunlight)
                || battle.weather == Some(Weather::ExtremelyHarshSunlight)
                || is_megasol
            {
                2
            } else {
                1
            };
            battle.apply_stat_change(
                player,
                slot,
                vec![(Stat::Atk, boost), (Stat::Spa, boost)],
                player,
                Some(move_id),
            );
        }
        "recover" | "slackoff" | "softboiled" | "roost" | "moonlight" | "synthesis"
        | "morningsun" | "healorder" => {
            if let Some(p) = battle.get_pokemon(PokemonIdent { player, slot }) {
                if p.hp == p.maxhp {
                    battle.log.push(BattleLog::Fail {
                        target: PokemonIdent { player, slot },
                    });
                } else {
                    let is_weather_healing =
                        ["moonlight", "synthesis", "morningsun"].contains(&move_id);
                    let is_megasol = p.ability.as_ref().is_some_and(|a| a.as_str() == "megasol");
                    let heal_fraction = if is_weather_healing {
                        if is_megasol {
                            2.0 / 3.0
                        } else {
                            match battle.weather {
                                Some(Weather::HashSunlight)
                                | Some(Weather::ExtremelyHarshSunlight) => 2.0 / 3.0,
                                Some(_) => 0.25,
                                None => 0.5,
                            }
                        }
                    } else {
                        0.5
                    };
                    let heal = (p.maxhp.into_inner() as f64 * heal_fraction).ceil() as i32;
                    battle.section_heal(PokemonIdent { player, slot }, heal.into());
                    if move_id == "roost" {
                        battle.section_apply_volatile(
                            PokemonIdent { player, slot },
                            VolatileStatus::Roost,
                        );
                    }
                }
            }
        }
        "rest" => {
            let (is_max_hp, is_slp, maxhp) =
                if let Some(p) = battle.get_pokemon(PokemonIdent { player, slot }) {
                    (
                        p.hp == p.maxhp,
                        p.status.as_ref().map(|s| s.as_ref()) == Some("slp"),
                        p.maxhp.into_inner(),
                    )
                } else {
                    (false, false, 0)
                };
            if is_max_hp || is_slp {
                battle.log.push(BattleLog::Fail {
                    target: PokemonIdent { player, slot },
                });
            } else {
                battle.section_heal(PokemonIdent { player, slot }, maxhp.into());
                if let Some(mut_p) = battle.get_pokemon_mut(PokemonIdent { player, slot }) {
                    mut_p.status = Some(Status::Sleep);
                    mut_p.sleep_turns = 3;
                }
                battle.log.push(BattleLog::StatusInflicted {
                    target: PokemonIdent { player, slot },
                    status: "slp".to_string(),
                });
            }
        }
        "electricterrain" | "grassyterrain" | "mistyterrain" | "psychicterrain" | "haze"
        | "sunnyday" | "raindance" | "sandstorm" | "snowscape" | "hail" | "chillyreception" => {
            if move_id == "haze" {
                let target_idents: Vec<PokemonIdent> = battle
                    .p1
                    .active
                    .iter()
                    .enumerate()
                    .map(|(i, _)| PokemonIdent { player: 1, slot: i })
                    .chain(
                        battle
                            .p2
                            .active
                            .iter()
                            .enumerate()
                            .map(|(i, _)| PokemonIdent { player: 2, slot: i }),
                    )
                    .collect();

                for target in target_idents {
                    if let Some(p) = battle.get_pokemon_mut(target) {
                        p.boosts = pkmn_meta::Boosts::default();
                    }
                    battle.log.push(BattleLog::Text {
                        message: "|-clearallboost".to_string(),
                    });
                }
            } else if move_id == "sunnyday"
                || move_id == "raindance"
                || move_id == "sandstorm"
                || move_id == "snowscape"
                || move_id == "hail"
                || move_id == "chillyreception"
            {
                let weather = match move_id {
                    "sunnyday" => Weather::HashSunlight,
                    "raindance" => Weather::Rain,
                    "sandstorm" => Weather::Sandstorm,
                    "snowscape" | "hail" | "chillyreception" => Weather::Snow,
                    _ => unreachable!(),
                };

                let log_str = if weather == Weather::Snow {
                    "Snowscape".to_string()
                } else if move_id == "sunnyday" {
                    "SunnyDay".to_string()
                } else if move_id == "raindance" {
                    "RainDance".to_string()
                } else {
                    weather.as_ref().to_string()
                };

                battle.log.push(BattleLog::WeatherChange {
                    weather: log_str,
                    is_start: true,
                });

                if move_id == "chillyreception" {
                    battle.log.push(BattleLog::Prepare {
                        target: PokemonIdent { player, slot },
                        move_id: "chillyreception".to_string(),
                    });
                    battle.turn_state = TurnState::WaitingForSwitch {
                        player,
                        pass_stats: false,
                    };
                }
                battle.weather = Some(weather);
                battle.update_forecast();
                battle.weather_turns_left = if battle
                    .get_pokemon(PokemonIdent { player, slot })
                    .is_some_and(|p| {
                        p.item.as_ref().is_some_and(|i| {
                            (weather == Weather::HashSunlight && i.to_string() == "heatrock")
                                || (weather == Weather::Rain && i.to_string() == "damprock")
                                || (weather == Weather::Sandstorm && i.to_string() == "smoothrock")
                                || (weather == Weather::Snow && i.to_string() == "icyrock")
                        })
                    }) {
                    8
                } else {
                    5
                };
            } else {
                let terrain = match move_id {
                    "electricterrain" => Terrain::Electric,
                    "grassyterrain" => Terrain::Grassy,
                    "mistyterrain" => Terrain::Misty,
                    "psychicterrain" => Terrain::Psychic,
                    _ => unreachable!(),
                };
                battle.log.push(BattleLog::TerrainChange {
                    terrain: terrain.as_ref().to_string() + "Terrain",
                    is_start: true,
                });
                battle.terrain = Some(terrain);
                battle.terrain_turns_left = if battle
                    .get_pokemon(PokemonIdent { player, slot })
                    .is_some_and(|p| {
                        p.item
                            .as_ref()
                            .is_some_and(|i| i.to_string() == "terrainextender")
                    }) {
                    8
                } else {
                    5
                };
                battle.update_mimicry();
                crate::sim::items::check_terrain_seeds(battle);
            }
        }
        "fairylock" => {
            battle.log.push(BattleLog::Text {
                message: "-fieldactivate|move: Fairy Lock".to_string(),
            });
            battle.fairy_lock_turns = 2; // Lasts for the current and next turn
        }
        "protect" | "detect" | "spikyshield" | "kingsshield" | "banefulbunker" => {
            let vs = match move_id {
                "kingsshield" => VolatileStatus::Kingsshield,
                "spikyshield" => VolatileStatus::Spikyshield,
                "banefulbunker" => VolatileStatus::Banefulbunker,
                _ => VolatileStatus::Protect,
            };
            battle.section_apply_volatile(PokemonIdent { player, slot }, vs);
            battle.log.push(BattleLog::SingleTurn {
                target: PokemonIdent { player, slot },
                effect: move_id.to_string(),
            });
        }
        "charge" => {
            battle.section_apply_volatile(PokemonIdent { player, slot }, VolatileStatus::Charge);
            battle.apply_stat_change(player, slot, vec![(Stat::Spd, 1)], player, Some(move_id));
        }
        "howl" => {
            // Raises Attack of user and allies
            if let Some(p) = battle.get_pokemon(PokemonIdent { player, slot: 0 })
                && p.hp > 0
            {
                battle.apply_stat_change(player, 0, vec![(Stat::Atk, 1)], player, Some(move_id));
            }
            if let Some(p) = battle.get_pokemon(PokemonIdent { player, slot: 1 })
                && p.hp > 0
            {
                battle.apply_stat_change(player, 1, vec![(Stat::Atk, 1)], player, Some(move_id));
            }
        }
        "irondefense" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Def, 2)], player, Some(move_id));
        }
        "focusenergy" => {
            battle
                .section_apply_volatile(PokemonIdent { player, slot }, VolatileStatus::Focusenergy);
        }
        "endure" => {
            battle.section_apply_volatile(PokemonIdent { player, slot }, VolatileStatus::Endure);
            battle.log.push(BattleLog::SingleTurn {
                target: PokemonIdent { player, slot },
                effect: "endure".to_string(),
            });
        }
        "perishsong" => {
            let active_targets = [
                PokemonIdent { player: 1, slot: 0 },
                PokemonIdent { player: 1, slot: 1 },
                PokemonIdent { player: 2, slot: 0 },
                PokemonIdent { player: 2, slot: 1 },
            ];
            for target_ident in active_targets {
                if let Some(target_p) = battle.get_pokemon(target_ident)
                    && target_p.hp > 0
                    && !target_p
                        .volatile_status
                        .contains(&VolatileStatus::Perishsong)
                {
                    battle.section_apply_volatile(target_ident, VolatileStatus::Perishsong);
                }
            }
        }
        "courtchange" => {
            let p1_has = battle.p1.is_tailwind()
                || battle.p1.reflect_turns > 0
                || battle.p1.lightscreen_turns > 0
                || battle.p1.aurora_veil_turns > 0
                || battle.p1.safeguard_turns > 0
                || battle.p1.spikes > 0
                || battle.p1.toxic_spikes > 0
                || battle.p1.stealth_rock
                || battle.p1.sticky_web;

            let p2_has = battle.p2.is_tailwind()
                || battle.p2.reflect_turns > 0
                || battle.p2.lightscreen_turns > 0
                || battle.p2.aurora_veil_turns > 0
                || battle.p2.safeguard_turns > 0
                || battle.p2.spikes > 0
                || battle.p2.toxic_spikes > 0
                || battle.p2.stealth_rock
                || battle.p2.sticky_web;

            if !p1_has && !p2_has {
                battle.log.push(BattleLog::Fail {
                    target: PokemonIdent { player, slot },
                });
            } else {
                std::mem::swap(&mut battle.p1.tailwind, &mut battle.p2.tailwind);
                std::mem::swap(&mut battle.p1.reflect_turns, &mut battle.p2.reflect_turns);
                std::mem::swap(
                    &mut battle.p1.lightscreen_turns,
                    &mut battle.p2.lightscreen_turns,
                );
                std::mem::swap(
                    &mut battle.p1.aurora_veil_turns,
                    &mut battle.p2.aurora_veil_turns,
                );
                std::mem::swap(
                    &mut battle.p1.safeguard_turns,
                    &mut battle.p2.safeguard_turns,
                );
                std::mem::swap(&mut battle.p1.spikes, &mut battle.p2.spikes);
                std::mem::swap(&mut battle.p1.toxic_spikes, &mut battle.p2.toxic_spikes);
                std::mem::swap(&mut battle.p1.stealth_rock, &mut battle.p2.stealth_rock);
                std::mem::swap(&mut battle.p1.sticky_web, &mut battle.p2.sticky_web);

                battle.log.push(BattleLog::Text {
                    message: "|-swapsideconditions".to_string(),
                });
                battle.log.push(BattleLog::Activate {
                    target: PokemonIdent { player, slot },
                    effect: "move: Court Change".to_string(),
                });
            }
        }
        "glaiverush" => {
            let ident = PokemonIdent { player, slot };
            if let Some(p) = battle.get_pokemon_mut(ident)
                && !p.volatile_status.contains(&VolatileStatus::Glaiverush)
            {
                p.volatile_status.push(VolatileStatus::Glaiverush);
            }
            battle.log.push(BattleLog::Text {
                message: format!("|-singlemove|{}|Glaive Rush|[silent]", ident),
            });
        }
        "revivalblessing" => {
            let fainted_member = {
                // Check bench team members first, then active members
                let side_team = if player == 1 {
                    &battle.p1.team
                } else {
                    &battle.p2.team
                };
                let mut found = None;
                for (bench_idx, p) in side_team.iter().enumerate() {
                    if p.hp.into_inner() == 0 {
                        found = Some((true, bench_idx));
                        break;
                    }
                }
                if found.is_none() {
                    let side_active = if player == 1 {
                        &battle.p1.active
                    } else {
                        &battle.p2.active
                    };
                    for (slot_idx, p) in side_active.iter().enumerate() {
                        if p.hp.into_inner() == 0 {
                            found = Some((false, slot_idx));
                            break;
                        }
                    }
                }
                found
            };

            if let Some((is_bench, idx)) = fainted_member {
                let active_len = if player == 1 {
                    battle.p1.active.len()
                } else {
                    battle.p2.active.len()
                };
                let target_ident = if is_bench {
                    PokemonIdent {
                        player,
                        slot: idx + active_len,
                    }
                } else {
                    PokemonIdent { player, slot: idx }
                };

                let p = if is_bench {
                    if player == 1 {
                        &mut battle.p1.team[idx]
                    } else {
                        &mut battle.p2.team[idx]
                    }
                } else {
                    if player == 1 {
                        &mut battle.p1.active[idx]
                    } else {
                        &mut battle.p2.active[idx]
                    }
                };

                let heal_amount = p.maxhp.into_inner() / 2;
                p.hp = heal_amount.into();
                p.status = None;

                battle.log.push(BattleLog::Heal {
                    target: target_ident,
                    amount: heal_amount,
                });
            } else {
                battle.log.push(BattleLog::Fail {
                    target: PokemonIdent { player, slot },
                });
            }
        }
        _ => {}
    }
}

pub fn handle_target_secondary_effect(
    battle: &mut Battle,
    move_id: &str,
    source_player: u8,
    source_slot: usize,
    target_player: u8,
    target_slot: usize,
) {
    if move_id == "direclaw" {
        // 50% chance was already rolled by engine before calling this.
        let mut rng = rand::rng();
        use rand::RngExt;
        let r = rng.random_range(0..3);
        let status = match r {
            0 => Status::Poison,
            1 => Status::Paralysis,
            _ => Status::Sleep,
        };
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        let source_ident = PokemonIdent {
            player: source_player,
            slot: source_slot,
        };
        battle.section_apply_status(target_ident, status, Some(source_ident));
    } else if move_id == "eeriespell" {
        let target_ident = PokemonIdent {
            player: target_player,
            slot: target_slot,
        };
        if let Some(target_p) = battle.get_pokemon_mut(target_ident)
            && let Some(last_move) = target_p.last_move_used.clone()
        {
            let current_pp = target_p.pp_used.get(&last_move).copied().unwrap_or(0);
            target_p.pp_used.insert(last_move.clone(), current_pp + 3);

            let mut chars = last_move.chars();
            let move_name = if let Some(first) = chars.next() {
                first.to_uppercase().collect::<String>() + chars.as_str()
            } else {
                last_move.clone()
            };

            battle.log.push(BattleLog::Activate {
                target: target_ident,
                effect: format!("move: Eerie Spell|{}|3", move_name),
            });
        }
    }
}

pub fn handle_user_secondary_effect(battle: &mut Battle, move_id: &str, player: u8, slot: usize) {
    match move_id {
        "ancientpower" | "ominouswind" | "silverwind" => {
            battle.apply_stat_change(
                player,
                slot,
                vec![
                    (Stat::Atk, 1),
                    (Stat::Def, 1),
                    (Stat::Spa, 1),
                    (Stat::Spd, 1),
                    (Stat::Spe, 1),
                ],
                player,
                Some(move_id),
            );
        }
        "aquastep" | "aurawheel" | "flamecharge" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Spe, 1)], player, Some(move_id));
        }
        "fierydance" | "torchsong" => {
            battle.apply_stat_change(player, slot, vec![(Stat::Spa, 1)], player, Some(move_id));
        }
        _ => {}
    }
}
