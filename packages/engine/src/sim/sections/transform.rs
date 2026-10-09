use crate::sim::battle::Battle;
use crate::sim::log::{BattleLog, BattleLogEvent};
use crate::sim::pokemon::PokemonIdent;
use pkmn_meta::types::*;

pub fn section_transform(
    battle: &mut Battle,
    user_ident: PokemonIdent,
    target_ident: PokemonIdent,
) -> bool {
    // 1. Cannot target self or empty/fainted target
    if user_ident == target_ident {
        return false;
    }

    let user_pkmn = match battle.get_pokemon(user_ident) {
        Some(p) if p.hp.into_inner() > 0 => p,
        _ => return false,
    };

    // 2. User cannot transform if already transformed
    if user_pkmn
        .volatile_status
        .contains(&VolatileStatus::Transform)
    {
        return false;
    }

    let target_pkmn = match battle.get_pokemon(target_ident) {
        Some(p) if p.hp.into_inner() > 0 => p,
        _ => return false,
    };

    // 3. Cannot transform into a target that is already transformed
    if target_pkmn
        .volatile_status
        .contains(&VolatileStatus::Transform)
    {
        return false;
    }

    // 4. Cannot transform into a target behind a substitute
    if target_pkmn
        .volatile_status
        .contains(&VolatileStatus::Substitute)
        || target_pkmn.substitute_hp > 0
    {
        return false;
    }

    // Clone needed target properties before mutation
    let target_species = target_pkmn.species.clone();
    let target_type1 = target_pkmn.type1;
    let target_type2 = target_pkmn.type2;
    let target_added_type = target_pkmn.added_type;
    let target_attack = target_pkmn.attack;
    let target_defense = target_pkmn.defense;
    let target_sp_attack = target_pkmn.sp_attack;
    let target_sp_defense = target_pkmn.sp_defense;
    let target_speed = target_pkmn.speed;
    let target_boosts = target_pkmn.boosts.clone();
    let target_weight = target_pkmn.weight;
    let target_moves = target_pkmn.moves.clone();
    let target_ability = target_pkmn.ability.clone();

    // Transform user pokemon
    if let Some(user_mut) = battle.get_pokemon_mut(user_ident) {
        user_mut.species = target_species.clone();
        user_mut.type1 = target_type1;
        user_mut.type2 = target_type2;
        user_mut.added_type = target_added_type;
        user_mut.attack = target_attack;
        user_mut.defense = target_defense;
        user_mut.sp_attack = target_sp_attack;
        user_mut.sp_defense = target_sp_defense;
        user_mut.speed = target_speed;
        user_mut.boosts = target_boosts;
        user_mut.weight = target_weight;
        user_mut.moves = target_moves.clone();

        // Moves PP is set to 5 (or max PP if max PP < 5)
        user_mut.pp_used.clear();
        for m in &target_moves {
            let max_pp = pkmn_meta::move_meta::get_move_meta(m)
                .map(|meta| *meta.pp())
                .unwrap_or(5);
            let given_pp = std::cmp::min(5, max_pp);
            // In the engine, pp_used tracks how many PP have been consumed.
            // If the move starts with given_pp, then max_pp - given_pp has already been "used"
            let used = max_pp.saturating_sub(given_pp);
            user_mut.pp_used.insert(m.clone(), used);
        }

        // Copy ability
        user_mut.ability = target_ability.clone();

        // Libero/Protean activated flag stays false on the transforming pokemon
        user_mut.libero_activated = false;

        // Apply Transform volatile status
        if !user_mut
            .volatile_status
            .contains(&VolatileStatus::Transform)
        {
            user_mut.volatile_status.push(VolatileStatus::Transform);
        }
    }

    // Log transform activation
    battle.log.push(BattleLogEvent::new(BattleLog::Activate {
        target: user_ident,
        effect: "Transform".to_string(),
    }));

    // Trigger on-entry ability of copied ability
    if target_ability.is_some() {
        crate::sim::sections::switch::trigger_switch_in_ability(
            battle,
            user_ident.player,
            user_ident.slot,
        );
    }

    true
}
