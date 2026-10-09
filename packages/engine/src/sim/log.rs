use crate::sim::pokemon::PokemonIdent;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "type")]
pub enum BattleLog {
    MoveUsed {
        attacker: PokemonIdent,
        move_id: String,
        target: Option<PokemonIdent>,
        from_move: Option<String>,
    },
    Damage {
        target: PokemonIdent,
        damage: i32,
        is_crit: bool,
        effectiveness: i32,
        absorbed: bool,
        from_effect: Option<String>,
    },
    Heal {
        target: PokemonIdent,
        amount: i32,
    },
    SetHp {
        target: PokemonIdent,
    },
    Faint {
        target: PokemonIdent,
    },
    SetBoost {
        target: PokemonIdent,
        stat: String,
        amount: i32,
        from: String,
    },
    StatChange {
        target: PokemonIdent,
        stat: String,
        amount: i32,
    },
    StatusInflicted {
        target: PokemonIdent,
        status: String,
    },
    CureStatus {
        target: PokemonIdent,
    },
    Swap {
        target: PokemonIdent,
        target_slot: usize,
    },
    Drag {
        target: PokemonIdent,
    },
    Activate {
        target: PokemonIdent,
        effect: String,
    },
    Cant {
        target: PokemonIdent,
        reason: String,
        move_id: Option<String>,
    },
    Fail {
        target: PokemonIdent,
    },
    Ohko,
    Immune {
        target: PokemonIdent,
    },
    Prepare {
        target: PokemonIdent,
        move_id: String,
    },
    Miss {
        attacker: PokemonIdent,
        target: PokemonIdent,
    },
    WeatherChange {
        weather: String,
        is_start: bool,
    },
    TerrainChange {
        terrain: String,
        is_start: bool,
    },
    Start {
        target: PokemonIdent,
        effect: String,
    },
    SingleTurn {
        target: PokemonIdent,
        effect: String,
    },
    EndItem {
        target: PokemonIdent,
        item: String,
    },
    EndAbility {
        target: PokemonIdent,
    },
    Ability {
        target: PokemonIdent,
        ability: String,
        from_move: Option<String>,
        of: Option<PokemonIdent>,
    },
    EndItemSilent {
        target: PokemonIdent,
        item: String,
        from_move: String,
        of: PokemonIdent,
    },
    Item {
        target: PokemonIdent,
        item: String,
        from_move: String,
        of: PokemonIdent,
    },
    SideStart {
        player: u8,
        effect: String,
    },
    SideEnd {
        player: u8,
        effect: String,
    },
    VolatileStatusStart {
        target: PokemonIdent,
        volatile_status: String,
    },
    VolatileStatusEnd {
        target: PokemonIdent,
        volatile_status: String,
    },
    Mega {
        target: PokemonIdent,
        species: String,
        item: String,
    },
    FormeChange {
        target: PokemonIdent,
        species: String,
        from_effect: String,
    },
    Text {
        message: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct BattleLogEvent {
    pub event: BattleLog,
    pub showdown: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Tsify)]
pub struct BattleLogs {
    pub events: Vec<BattleLogEvent>,
}

impl BattleLogEvent {
    pub fn new(event: BattleLog) -> Self {
        let showdown = event.to_showdown_string();
        Self { event, showdown }
    }
}

impl BattleLog {
    fn to_showdown_string(&self) -> String {
        match self {
            BattleLog::MoveUsed {
                attacker,
                move_id,
                target,
                from_move,
            } => {
                let target_str = target
                    .as_ref()
                    .map(|t| format!("|{}", t))
                    .unwrap_or("".to_string());

                let mut move_display_name = move_id.clone();
                if !move_display_name.is_empty() {
                    move_display_name[..1].make_ascii_uppercase();
                }

                if let Some(from) = from_move {
                    let mut from_display = from.clone();
                    if !from_display.is_empty() {
                        from_display[..1].make_ascii_uppercase();
                    }
                    format!(
                        "|move|{}|{}{}|[from] move: {}",
                        attacker, move_display_name, target_str, from_display
                    )
                } else {
                    format!("|move|{}|{}{}", attacker, move_display_name, target_str)
                }
            }
            BattleLog::Damage {
                target,
                damage,
                is_crit,
                effectiveness,
                absorbed: _,
                from_effect,
            } => {
                let mut out = format!("|-damage|{}|{} damage", target, damage);
                if let Some(effect) = from_effect {
                    out.push_str(&format!("|[from] {}", effect));
                }
                if *is_crit {
                    out.push_str("\n|-crit|");
                    out.push_str(&target.to_string());
                }
                if *effectiveness > 0 {
                    out.push_str("\n|-supereffective|");
                    out.push_str(&target.to_string());
                } else if *effectiveness < 0 {
                    out.push_str("\n|-resisted|");
                    out.push_str(&target.to_string());
                }
                out
            }
            BattleLog::Heal { target, amount } => format!("|-heal|{}|{} hp", target, amount),
            BattleLog::Faint { target } => format!("|faint|{}", target),
            BattleLog::SetBoost {
                target,
                stat,
                amount,
                from,
            } => {
                let from_str = if from.is_empty() {
                    "".to_string()
                } else {
                    format!("|[from] move: {}", from)
                };
                format!("|-setboost|{}|{}|{}{}", target, stat, amount, from_str)
            }
            BattleLog::StatChange {
                target,
                stat,
                amount,
            } => {
                let action = if *amount > 0 { "boost" } else { "unboost" };
                format!("|-{}|{}|{}|{}", action, target, stat, amount.abs())
            }
            BattleLog::StatusInflicted { target, status } => {
                format!("|-status|{}|{}", target, status)
            }
            BattleLog::CureStatus { target } => format!("|-curestatus|{}", target),
            BattleLog::Activate { target, effect } => format!("|-activate|{}|{}", target, effect),
            BattleLog::Immune { target } => format!("|-immune|{}", target),
            BattleLog::WeatherChange { weather, is_start } => {
                let action = if *is_start { "weather" } else { "-weather" };
                format!("|{}|{}", action, weather)
            }
            BattleLog::TerrainChange { terrain, is_start } => {
                let action = if *is_start { "fieldstart" } else { "fieldend" };
                let t_name = match terrain.as_str() {
                    "ElectricTerrain" => "Electric Terrain",
                    "GrassyTerrain" => "Grassy Terrain",
                    "MistyTerrain" => "Misty Terrain",
                    "PsychicTerrain" => "Psychic Terrain",
                    _ => terrain.as_str(),
                };
                format!("|-{}|move: {}", action, t_name)
            }
            BattleLog::Start { target, effect } => format!("|-start|{}|{}", target, effect),
            BattleLog::SingleTurn { target, effect } => {
                format!("|-singleturn|{}|{}", target, effect)
            }
            BattleLog::Swap {
                target,
                target_slot,
            } => {
                format!("|swap|{}|{}", target, target_slot)
            }
            BattleLog::Drag { target } => {
                // To get species and hp we would need the actual Pokemon, but in Showdown it looks like:
                // |drag|p2a: Gengar|Gengar, F|135/135
                // We will just do a simplified drag and handle it in TS if needed, but since we don't parse drag, it doesn't matter much.
                format!("|drag|{}", target)
            }
            BattleLog::Prepare { target, move_id } => {
                format!("|-prepare|{}|{}", target, move_id)
            }
            BattleLog::Cant {
                target,
                reason,
                move_id,
            } => {
                if let Some(m) = move_id {
                    format!("|cant|{}|{}|{}", target, reason, m)
                } else {
                    format!("|cant|{}|{}", target, reason)
                }
            }
            BattleLog::Miss { attacker, target } => {
                format!("|-miss|{}|{}", attacker, target)
            }
            BattleLog::Fail { target } => format!("|-fail|{}", target),
            BattleLog::Ohko => "|-ohko".to_string(),
            BattleLog::Text { message } => message.clone(),
            BattleLog::EndItem { target, item } => format!("|-enditem|{}|{}", target, item),
            BattleLog::EndAbility { target } => format!("|-endability|{}", target),
            BattleLog::Ability {
                target,
                ability,
                from_move,
                of,
            } => {
                let mut out = format!("|-ability|{}|{}", target, ability);
                if let Some(m) = from_move {
                    let mut move_name = m.clone();
                    if !move_name.is_empty() {
                        move_name[..1].make_ascii_uppercase();
                    }
                    out.push_str(&format!("|[from] move: {}", move_name));
                }
                if let Some(o) = of {
                    out.push_str(&format!("|[of] {}", o));
                }
                out
            }
            BattleLog::SetHp { target } => {
                format!("|-sethp|{}|", target)
            }
            BattleLog::EndItemSilent {
                target,
                item,
                from_move,
                of,
            } => {
                let mut move_name = from_move.clone();
                if !move_name.is_empty() {
                    move_name[..1].make_ascii_uppercase();
                }
                format!(
                    "|-enditem|{}|{}|[silent]|[from] move: {}|[of] {}",
                    target, item, move_name, of
                )
            }
            BattleLog::Item {
                target,
                item,
                from_move,
                of,
            } => {
                let mut move_name = from_move.clone();
                if !move_name.is_empty() {
                    move_name[..1].make_ascii_uppercase();
                }
                format!(
                    "|-item|{}|{}|[from] move: {}|[of] {}",
                    target, item, move_name, of
                )
            }
            BattleLog::SideStart { player, effect } => {
                format!("|-sidestart|p{}: Player {}|{}", player, player, effect)
            }
            BattleLog::SideEnd { player, effect } => {
                format!("|-sideend|p{}: Player {}|{}", player, player, effect)
            }
            BattleLog::VolatileStatusStart {
                target,
                volatile_status,
            } => format!("|-start|{}|{}", target, volatile_status),
            BattleLog::VolatileStatusEnd {
                target,
                volatile_status,
            } => format!("|-end|{}|{}", target, volatile_status),
            BattleLog::Mega {
                target,
                species,
                item,
            } => format!("|-mega|{}|{}|{}", target, species, item),
            BattleLog::FormeChange {
                target,
                species,
                from_effect,
            } => format!(
                "|-formechange|{}|{}|[from] {}",
                target, species, from_effect
            ),
        }
    }
}
