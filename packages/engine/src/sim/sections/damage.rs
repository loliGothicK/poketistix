use crate::sim::battle::{Battle, EventContext, EventId, PokemonIdent};
use pkmn_meta::types::*;

pub fn section_take_damage(battle: &mut Battle, target: PokemonIdent, damage: i32) {
    let mut ctx = EventContext::builder()
        .target(target)
        .num_val(damage)
        .build();

    battle.trigger_event(EventId::BeforeTakeDamage, &mut ctx);

    if !ctx.canceled && ctx.num_val > 0 {
        let mut endure = false;
        if let Some(t) = battle.get_pokemon(ctx.target)
            && t.volatile_status.contains(&VolatileStatus::Endure)
            && t.hp.into_inner() > 0
            && ctx.num_val >= t.hp.into_inner()
        {
            endure = true;
        }
        if endure {
            let hp = battle.get_pokemon(ctx.target).unwrap().hp.into_inner();
            ctx.num_val = hp - 1;
            battle.log.push(crate::sim::log::BattleLog::SingleTurn {
                target: ctx.target,
                effect: "move: Endure".to_string(),
            });
        }

        if ctx.target.player == 1 {
            if let Some(t) = battle.p1.active.get_mut(ctx.target.slot) {
                t.hp = std::cmp::max(0, t.hp.into_inner() - ctx.num_val).into();
            }
        } else {
            if let Some(t) = battle.p2.active.get_mut(ctx.target.slot) {
                t.hp = std::cmp::max(0, t.hp.into_inner() - ctx.num_val).into();
            }
        }

        battle.trigger_event(EventId::AfterTakeDamage, &mut ctx);
    }
}
