use crate::sim::abilities::Condition;
use crate::sim::battle::{Battle, EventContext, EventId, PokemonIdent};
use pkmn_meta::types::*;
use rand::RngExt;

pub fn execute_item(
    battle: &mut Battle,
    ident: PokemonIdent,
    item_id: &str,
    event_id: &EventId,
    ctx: &mut EventContext,
) {
    if battle
        .get_pokemon(ident)
        .and_then(|p| p.ability.as_ref())
        .map(|a| a.as_str())
        == Some("klutz")
    {
        return;
    }
    let item_id = item_id.replace("-", "");
    match item_id.as_str() {
        "whiteherb" => {
            if *event_id == EventId::AfterStatChange && ctx.target == ident {
                // White Herb trigger is checked after all stat changes of an action/move
            }
        }
        "mentalherb" => {
            if *event_id == EventId::AfterApplyVolatile && ctx.target == ident {
                let v = ctx.volatile_status_val;
                let is_mental = matches!(
                    v,
                    Some(VolatileStatus::Attract)
                        | Some(VolatileStatus::Taunt)
                        | Some(VolatileStatus::Encore)
                        | Some(VolatileStatus::Torment)
                        | Some(VolatileStatus::Disable)
                );
                if is_mental {
                    battle.section_consume_item(ident);
                    if let Some(p) = battle.get_pokemon_mut(ident) {
                        p.volatile_status.retain(|status| {
                            !matches!(
                                status,
                                VolatileStatus::Attract
                                    | VolatileStatus::Taunt
                                    | VolatileStatus::Encore
                                    | VolatileStatus::Torment
                                    | VolatileStatus::Disable
                            )
                        });
                        p.taunt_turns = 0;
                        p.encore_turns = 0;
                        p.encored_move = None;
                        p.disable_turns = 0;
                        p.disabled_move = None;
                    }
                }
            }
        }
        "lumberry" => {
            if *event_id == EventId::AfterApplyStatus && ctx.target == ident {
                battle.section_consume_item(ident);
                battle.section_cure_status(ident);
            } else if *event_id == EventId::AfterApplyVolatile
                && ctx.target == ident
                && ctx.string_val == "confusion"
            {
                battle.section_consume_item(ident);
                if let Some(t) = battle.get_pokemon_mut(ident) {
                    t.volatile_status.retain(|v| v.as_ref() != "confusion");
                }
            }
        }
        "cheriberry" => {
            if *event_id == EventId::AfterApplyStatus
                && ctx.target == ident
                && ctx.string_val == "par"
            {
                battle.section_consume_item(ident);
                battle.section_cure_status(ident);
            }
        }
        "chestoberry" => {
            if *event_id == EventId::AfterApplyStatus
                && ctx.target == ident
                && ctx.string_val == "slp"
            {
                battle.section_consume_item(ident);
                battle.section_cure_status(ident);
            }
        }
        "pechaberry" => {
            if *event_id == EventId::AfterApplyStatus
                && ctx.target == ident
                && (ctx.string_val == "psn" || ctx.string_val == "tox")
            {
                battle.section_consume_item(ident);
                battle.section_cure_status(ident);
            }
        }
        "rawstberry" => {
            if *event_id == EventId::AfterApplyStatus
                && ctx.target == ident
                && ctx.string_val == "brn"
            {
                battle.section_consume_item(ident);
                battle.section_cure_status(ident);
            }
        }
        "aspearberry" => {
            if *event_id == EventId::AfterApplyStatus
                && ctx.target == ident
                && ctx.string_val == "frz"
            {
                battle.section_consume_item(ident);
                battle.section_cure_status(ident);
            }
        }
        "persimberry" => {
            if *event_id == EventId::AfterApplyVolatile
                && ctx.target == ident
                && ctx.string_val == "confusion"
            {
                battle.section_consume_item(ident);
                if let Some(t) = battle.get_pokemon_mut(ident) {
                    t.volatile_status.retain(|v| v.as_ref() != "confusion");
                }
            }
        }
        "sitrusberry" => {
            if *event_id == EventId::AfterTakeDamage && ctx.target == ident {
                let (hp, maxhp) = battle.hp_and_max(ident);
                if hp > 0 && hp <= maxhp / 2 {
                    battle.section_consume_item(ident);
                    battle.section_heal(ident, (maxhp / 4).into());
                }
            }
        }
        "oranberry" => {
            if *event_id == EventId::AfterTakeDamage && ctx.target == ident {
                let (hp, maxhp) = battle.hp_and_max(ident);
                if hp > 0 && hp <= maxhp / 2 {
                    battle.section_consume_item(ident);
                    battle.section_heal(ident, 10.into());
                }
            }
        }
        "focussash" if *event_id == EventId::BeforeTakeDamage && ctx.target == ident => {
            let (hp, maxhp) = battle.hp_and_max(ident);
            // If at full HP and damage would KO
            if hp.into_inner() > 0
                && hp.into_inner() == maxhp.into_inner()
                && ctx.num_val >= hp.into_inner()
            {
                ctx.num_val = hp.into_inner() - 1; // Survive at 1 HP
                battle.section_consume_item(ident);
            }
        }
        "focusband" if *event_id == EventId::BeforeTakeDamage && ctx.target == ident => {
            let hp = {
                let pkmn = if ident.player == 1 {
                    battle.p1.active.get(ident.slot)
                } else {
                    battle.p2.active.get(ident.slot)
                };
                if let Some(p) = pkmn { p.hp } else { 0.into() }
            };
            // 10% chance to survive at 1 HP
            if hp.into_inner() > 0 && ctx.num_val >= hp.into_inner() {
                let mut rng = rand::rng();
                if rng.random_range(1..=100) <= 10 {
                    ctx.num_val = hp.into_inner() - 1; // Survive at 1 HP
                }
            }
        }
        "leftovers" if *event_id == EventId::EndOfTurn && ctx.target == ident => {
            let (hp, maxhp) = battle.hp_and_max(ident);
            if hp.into_inner() > 0 && hp.into_inner() < maxhp.into_inner() {
                let heal = std::cmp::max(1, maxhp.into_inner() / 16);
                battle.section_heal(ident, heal.into());
            }
        }
        "blacksludge" if *event_id == EventId::EndOfTurn && ctx.target == ident => {
            let (hp, maxhp, is_poison) = {
                let pkmn = if ident.player == 1 {
                    battle.p1.active.get(ident.slot)
                } else {
                    battle.p2.active.get(ident.slot)
                };
                if let Some(p) = pkmn {
                    let is_poison = p.type1 == Type::Poison
                        || p.type2 == Some(Type::Poison)
                        || p.added_type == Some(Type::Poison);
                    (p.hp, p.maxhp, is_poison)
                } else {
                    (0.into(), 0.into(), false)
                }
            };
            if hp.into_inner() > 0 {
                if is_poison {
                    if hp.into_inner() < maxhp.into_inner() {
                        let heal = std::cmp::max(1, maxhp.into_inner() / 16);
                        battle.section_heal(ident, heal.into());
                    }
                } else {
                    let damage = std::cmp::max(1, (maxhp / 8).into_inner());
                    battle.section_take_damage(ident, damage);
                }
            }
        }
        _ => {}
    }
}

pub fn get_item(id: &str) -> Option<Condition> {
    let id = id.replace("-", "");
    match id.as_str() {
        "abomasite" => Some(Condition {
            name: "Abomasite".to_string(),
            ..Default::default()
        }),
        "absolite" => Some(Condition {
            name: "Absolite".to_string(),
            ..Default::default()
        }),
        "absolitez" => Some(Condition {
            name: "Absolite Z".to_string(),
            ..Default::default()
        }),
        "aerodactylite" => Some(Condition {
            name: "Aerodactylite".to_string(),
            ..Default::default()
        }),
        "aggronite" => Some(Condition {
            name: "Aggronite".to_string(),
            ..Default::default()
        }),
        "alakazite" => Some(Condition {
            name: "Alakazite".to_string(),
            ..Default::default()
        }),
        "altarianite" => Some(Condition {
            name: "Altarianite".to_string(),
            ..Default::default()
        }),
        "ampharosite" => Some(Condition {
            name: "Ampharosite".to_string(),
            ..Default::default()
        }),
        "aspearberry" => Some(Condition {
            name: "Aspear Berry".to_string(),
            ..Default::default()
        }),
        "audinite" => Some(Condition {
            name: "Audinite".to_string(),
            ..Default::default()
        }),
        "babiriberry" => Some(Condition {
            name: "Babiri Berry".to_string(),
            ..Default::default()
        }),
        "banettite" => Some(Condition {
            name: "Banettite".to_string(),
            ..Default::default()
        }),
        "barbaracite" => Some(Condition {
            name: "Barbaracite".to_string(),
            ..Default::default()
        }),
        "baxcalibrite" => Some(Condition {
            name: "Baxcalibrite".to_string(),
            ..Default::default()
        }),
        "beedrillite" => Some(Condition {
            name: "Beedrillite".to_string(),
            ..Default::default()
        }),
        "bigroot" => Some(Condition {
            name: "Big Root".to_string(),
            ..Default::default()
        }),
        "blackbelt" => Some(Condition {
            name: "Black Belt".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "blackglasses" => Some(Condition {
            name: "Black Glasses".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "blastoisinite" => Some(Condition {
            name: "Blastoisinite".to_string(),
            ..Default::default()
        }),
        "blazikenite" => Some(Condition {
            name: "Blazikenite".to_string(),
            ..Default::default()
        }),
        "brightpowder" => Some(Condition {
            name: "Bright Powder".to_string(),
            ..Default::default()
        }),
        "cameruptite" => Some(Condition {
            name: "Cameruptite".to_string(),
            ..Default::default()
        }),
        "chandelurite" => Some(Condition {
            name: "Chandelurite".to_string(),
            ..Default::default()
        }),
        "charcoal" => Some(Condition {
            name: "Charcoal".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "charizarditex" => Some(Condition {
            name: "Charizardite X".to_string(),
            ..Default::default()
        }),
        "charizarditey" => Some(Condition {
            name: "Charizardite Y".to_string(),
            ..Default::default()
        }),
        "chartiberry" => Some(Condition {
            name: "Charti Berry".to_string(),
            ..Default::default()
        }),
        "cheriberry" => Some(Condition {
            name: "Cheri Berry".to_string(),
            ..Default::default()
        }),
        "chesnaughtite" => Some(Condition {
            name: "Chesnaughtite".to_string(),
            ..Default::default()
        }),
        "chestoberry" => Some(Condition {
            name: "Chesto Berry".to_string(),
            ..Default::default()
        }),
        "chilanberry" => Some(Condition {
            name: "Chilan Berry".to_string(),
            ..Default::default()
        }),
        "chimechite" => Some(Condition {
            name: "Chimechite".to_string(),
            ..Default::default()
        }),
        "choicescarf" => Some(Condition {
            name: "Choice Scarf".to_string(),
            ..Default::default()
        }),
        "chopleberry" => Some(Condition {
            name: "Chople Berry".to_string(),
            ..Default::default()
        }),
        "clefablite" => Some(Condition {
            name: "Clefablite".to_string(),
            ..Default::default()
        }),
        "cobaberry" => Some(Condition {
            name: "Coba Berry".to_string(),
            ..Default::default()
        }),
        "colburberry" => Some(Condition {
            name: "Colbur Berry".to_string(),
            ..Default::default()
        }),
        "crabominite" => Some(Condition {
            name: "Crabominite".to_string(),
            ..Default::default()
        }),
        "damprock" => Some(Condition {
            name: "Damp Rock".to_string(),
            ..Default::default()
        }),
        "delphoxite" => Some(Condition {
            name: "Delphoxite".to_string(),
            ..Default::default()
        }),
        "dragalgite" => Some(Condition {
            name: "Dragalgite".to_string(),
            ..Default::default()
        }),
        "dragonfang" => Some(Condition {
            name: "Dragon Fang".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "dragoninite" => Some(Condition {
            name: "Dragoninite".to_string(),
            ..Default::default()
        }),
        "drampanite" => Some(Condition {
            name: "Drampanite".to_string(),
            ..Default::default()
        }),
        "eelektrossite" => Some(Condition {
            name: "Eelektrossite".to_string(),
            ..Default::default()
        }),
        "emboarite" => Some(Condition {
            name: "Emboarite".to_string(),
            ..Default::default()
        }),
        "excadrite" => Some(Condition {
            name: "Excadrite".to_string(),
            ..Default::default()
        }),
        "expertbelt" => Some(Condition {
            name: "Expert Belt".to_string(),
            ..Default::default()
        }),
        "fairyfeather" => Some(Condition {
            name: "Fairy Feather".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "falinksite" => Some(Condition {
            name: "Falinksite".to_string(),
            ..Default::default()
        }),
        "feraligite" => Some(Condition {
            name: "Feraligite".to_string(),
            ..Default::default()
        }),
        "floettite" => Some(Condition {
            name: "Floettite".to_string(),
            ..Default::default()
        }),
        "focusband" => Some(Condition {
            name: "Focus Band".to_string(),
            ..Default::default()
        }),
        "focussash" => Some(Condition {
            name: "Focus Sash".to_string(),
            ..Default::default()
        }),
        "froslassite" => Some(Condition {
            name: "Froslassite".to_string(),
            ..Default::default()
        }),
        "galladite" => Some(Condition {
            name: "Galladite".to_string(),
            ..Default::default()
        }),
        "garchompite" => Some(Condition {
            name: "Garchompite".to_string(),
            ..Default::default()
        }),
        "garchompitez" => Some(Condition {
            name: "Garchompite Z".to_string(),
            ..Default::default()
        }),
        "gardevoirite" => Some(Condition {
            name: "Gardevoirite".to_string(),
            ..Default::default()
        }),
        "gengarite" => Some(Condition {
            name: "Gengarite".to_string(),
            ..Default::default()
        }),
        "glalitite" => Some(Condition {
            name: "Glalitite".to_string(),
            ..Default::default()
        }),
        "glimmoranite" => Some(Condition {
            name: "Glimmoranite".to_string(),
            ..Default::default()
        }),
        "golurkite" => Some(Condition {
            name: "Golurkite".to_string(),
            ..Default::default()
        }),
        "golisopite" => Some(Condition {
            name: "Golisopite".to_string(),
            ..Default::default()
        }),
        "greninjite" => Some(Condition {
            name: "Greninjite".to_string(),
            ..Default::default()
        }),
        "gyaradosite" => Some(Condition {
            name: "Gyaradosite".to_string(),
            ..Default::default()
        }),
        "habanberry" => Some(Condition {
            name: "Haban Berry".to_string(),
            ..Default::default()
        }),
        "hardstone" => Some(Condition {
            name: "Hard Stone".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "hawluchanite" => Some(Condition {
            name: "Hawluchanite".to_string(),
            ..Default::default()
        }),
        "heatrock" => Some(Condition {
            name: "Heat Rock".to_string(),
            ..Default::default()
        }),
        "heracronite" => Some(Condition {
            name: "Heracronite".to_string(),
            ..Default::default()
        }),
        "houndoominite" => Some(Condition {
            name: "Houndoominite".to_string(),
            ..Default::default()
        }),
        "icyrock" => Some(Condition {
            name: "Icy Rock".to_string(),
            ..Default::default()
        }),
        "ironball" => Some(Condition {
            name: "Iron Ball".to_string(),
            ..Default::default()
        }),
        "kangaskhanite" => Some(Condition {
            name: "Kangaskhanite".to_string(),
            ..Default::default()
        }),
        "kasibberry" => Some(Condition {
            name: "Kasib Berry".to_string(),
            ..Default::default()
        }),
        "kebiaberry" => Some(Condition {
            name: "Kebia Berry".to_string(),
            ..Default::default()
        }),
        "kingsrock" => Some(Condition {
            name: "King's Rock".to_string(),
            ..Default::default()
        }),
        "leftovers" => Some(Condition {
            name: "Leftovers".to_string(),
            ..Default::default()
        }),
        "leppaberry" => Some(Condition {
            name: "Leppa Berry".to_string(),
            ..Default::default()
        }),
        "lifeorb" => Some(Condition {
            name: "Life Orb".to_string(),
            ..Default::default()
        }),
        "lightball" => Some(Condition {
            name: "Light Ball".to_string(),
            has_on_modify_atk: true,
            has_on_modify_spa: true,
            ..Default::default()
        }),
        "lightclay" => Some(Condition {
            name: "Light Clay".to_string(),
            ..Default::default()
        }),
        "lopunnite" => Some(Condition {
            name: "Lopunnite".to_string(),
            ..Default::default()
        }),
        "lucarionite" => Some(Condition {
            name: "Lucarionite".to_string(),
            ..Default::default()
        }),
        "lucarionitez" => Some(Condition {
            name: "Lucarionite Z".to_string(),
            ..Default::default()
        }),
        "lumberry" => Some(Condition {
            name: "Lum Berry".to_string(),
            ..Default::default()
        }),
        "magnet" => Some(Condition {
            name: "Magnet".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "malamarite" => Some(Condition {
            name: "Malamarite".to_string(),
            ..Default::default()
        }),
        "manectite" => Some(Condition {
            name: "Manectite".to_string(),
            ..Default::default()
        }),
        "mawilite" => Some(Condition {
            name: "Mawilite".to_string(),
            ..Default::default()
        }),
        "medichamite" => Some(Condition {
            name: "Medichamite".to_string(),
            ..Default::default()
        }),
        "meganiumite" => Some(Condition {
            name: "Meganiumite".to_string(),
            ..Default::default()
        }),
        "mentalherb" => Some(Condition {
            name: "Mental Herb".to_string(),
            ..Default::default()
        }),
        "meowsticite" => Some(Condition {
            name: "Meowsticite".to_string(),
            ..Default::default()
        }),
        "metagrossite" => Some(Condition {
            name: "Metagrossite".to_string(),
            ..Default::default()
        }),
        "metalcoat" => Some(Condition {
            name: "Metal Coat".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "metronome" => Some(Condition {
            name: "Metronome".to_string(),
            ..Default::default()
        }),
        "miracleseed" => Some(Condition {
            name: "Miracle Seed".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "muscleband" => Some(Condition {
            name: "Muscle Band".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "mysticwater" => Some(Condition {
            name: "Mystic Water".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "nevermeltice" => Some(Condition {
            name: "Never-Melt Ice".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "occaberry" => Some(Condition {
            name: "Occa Berry".to_string(),
            ..Default::default()
        }),
        "oranberry" => Some(Condition {
            name: "Oran Berry".to_string(),
            ..Default::default()
        }),
        "passhoberry" => Some(Condition {
            name: "Passho Berry".to_string(),
            ..Default::default()
        }),
        "payapaberry" => Some(Condition {
            name: "Payapa Berry".to_string(),
            ..Default::default()
        }),
        "pechaberry" => Some(Condition {
            name: "Pecha Berry".to_string(),
            ..Default::default()
        }),
        "persimberry" => Some(Condition {
            name: "Persim Berry".to_string(),
            ..Default::default()
        }),
        "pidgeotite" => Some(Condition {
            name: "Pidgeotite".to_string(),
            ..Default::default()
        }),
        "pinsirite" => Some(Condition {
            name: "Pinsirite".to_string(),
            ..Default::default()
        }),
        "poisonbarb" => Some(Condition {
            name: "Poison Barb".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "pyroarite" => Some(Condition {
            name: "Pyroarite".to_string(),
            ..Default::default()
        }),
        "quickclaw" => Some(Condition {
            name: "Quick Claw".to_string(),
            ..Default::default()
        }),
        "raichunitex" => Some(Condition {
            name: "Raichunite X".to_string(),
            ..Default::default()
        }),
        "raichunitey" => Some(Condition {
            name: "Raichunite Y".to_string(),
            ..Default::default()
        }),
        "rawstberry" => Some(Condition {
            name: "Rawst Berry".to_string(),
            ..Default::default()
        }),
        "rindoberry" => Some(Condition {
            name: "Rindo Berry".to_string(),
            ..Default::default()
        }),
        "roseliberry" => Some(Condition {
            name: "Roseli Berry".to_string(),
            ..Default::default()
        }),
        "sablenite" => Some(Condition {
            name: "Sablenite".to_string(),
            ..Default::default()
        }),
        "salamencite" => Some(Condition {
            name: "Salamencite".to_string(),
            ..Default::default()
        }),
        "sceptilite" => Some(Condition {
            name: "Sceptilite".to_string(),
            ..Default::default()
        }),
        "scizorite" => Some(Condition {
            name: "Scizorite".to_string(),
            ..Default::default()
        }),
        "scolipite" => Some(Condition {
            name: "Scolipite".to_string(),
            ..Default::default()
        }),
        "scopelens" => Some(Condition {
            name: "Scope Lens".to_string(),
            ..Default::default()
        }),
        "scovillainite" => Some(Condition {
            name: "Scovillainite".to_string(),
            ..Default::default()
        }),
        "scraftinite" => Some(Condition {
            name: "Scraftinite".to_string(),
            ..Default::default()
        }),
        "sharpbeak" => Some(Condition {
            name: "Sharp Beak".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "sharpedonite" => Some(Condition {
            name: "Sharpedonite".to_string(),
            ..Default::default()
        }),
        "shedshell" => Some(Condition {
            name: "Shed Shell".to_string(),
            ..Default::default()
        }),
        "shellbell" => Some(Condition {
            name: "Shell Bell".to_string(),
            ..Default::default()
        }),
        "shucaberry" => Some(Condition {
            name: "Shuca Berry".to_string(),
            ..Default::default()
        }),
        "silkscarf" => Some(Condition {
            name: "Silk Scarf".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "silverpowder" => Some(Condition {
            name: "Silver Powder".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "sitrusberry" => Some(Condition {
            name: "Sitrus Berry".to_string(),
            ..Default::default()
        }),
        "skarmorite" => Some(Condition {
            name: "Skarmorite".to_string(),
            ..Default::default()
        }),
        "slowbronite" => Some(Condition {
            name: "Slowbronite".to_string(),
            ..Default::default()
        }),
        "smoothrock" => Some(Condition {
            name: "Smooth Rock".to_string(),
            ..Default::default()
        }),
        "softsand" => Some(Condition {
            name: "Soft Sand".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "spelltag" => Some(Condition {
            name: "Spell Tag".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "staraptite" => Some(Condition {
            name: "Staraptite".to_string(),
            ..Default::default()
        }),
        "starminite" => Some(Condition {
            name: "Starminite".to_string(),
            ..Default::default()
        }),
        "steelixite" => Some(Condition {
            name: "Steelixite".to_string(),
            ..Default::default()
        }),
        "swampertite" => Some(Condition {
            name: "Swampertite".to_string(),
            ..Default::default()
        }),
        "tangaberry" => Some(Condition {
            name: "Tanga Berry".to_string(),
            ..Default::default()
        }),
        "twistedspoon" => Some(Condition {
            name: "Twisted Spoon".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "tyranitarite" => Some(Condition {
            name: "Tyranitarite".to_string(),
            ..Default::default()
        }),
        "venusaurite" => Some(Condition {
            name: "Venusaurite".to_string(),
            ..Default::default()
        }),
        "victreebelite" => Some(Condition {
            name: "Victreebelite".to_string(),
            ..Default::default()
        }),
        "wacanberry" => Some(Condition {
            name: "Wacan Berry".to_string(),
            ..Default::default()
        }),
        "whiteherb" => Some(Condition {
            name: "White Herb".to_string(),
            ..Default::default()
        }),
        "widelens" => Some(Condition {
            name: "Wide Lens".to_string(),
            ..Default::default()
        }),
        "wiseglasses" => Some(Condition {
            name: "Wise Glasses".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "yacheberry" => Some(Condition {
            name: "Yache Berry".to_string(),
            ..Default::default()
        }),
        "zoomlens" => Some(Condition {
            name: "Zoom Lens".to_string(),
            ..Default::default()
        }),
        _ => None,
    }
}

pub fn check_white_herb(battle: &mut Battle, ident: PokemonIdent) {
    let has_negative = if let Some(p) = battle.get_pokemon(ident) {
        if p.item != Some(ItemId::WhiteHerb) {
            return;
        }
        p.boosts.atk.into_inner() < 0
            || p.boosts.def.into_inner() < 0
            || p.boosts.spa.into_inner() < 0
            || p.boosts.spd.into_inner() < 0
            || p.boosts.spe.into_inner() < 0
            || p.boosts.accuracy.into_inner() < 0
            || p.boosts.evasion.into_inner() < 0
    } else {
        false
    };

    if has_negative {
        if let Some(p) = battle.get_pokemon_mut(ident) {
            if p.boosts.atk.into_inner() < 0 {
                p.boosts.atk = 0.into();
            }
            if p.boosts.def.into_inner() < 0 {
                p.boosts.def = 0.into();
            }
            if p.boosts.spa.into_inner() < 0 {
                p.boosts.spa = 0.into();
            }
            if p.boosts.spd.into_inner() < 0 {
                p.boosts.spd = 0.into();
            }
            if p.boosts.spe.into_inner() < 0 {
                p.boosts.spe = 0.into();
            }
            if p.boosts.accuracy.into_inner() < 0 {
                p.boosts.accuracy = 0.into();
            }
            if p.boosts.evasion.into_inner() < 0 {
                p.boosts.evasion = 0.into();
            }
        }
        battle.section_consume_item(ident);
    }
}

pub fn apply_berry_effect(battle: &mut Battle, target: PokemonIdent, berry_id: &str) {
    let clean_id = berry_id.replace('-', "");
    match clean_id.as_str() {
        "sitrusberry" => {
            if let Some(p) = battle.get_pokemon(target) {
                let maxhp = p.maxhp.into_inner();
                battle.section_heal(target, (maxhp / 4).into());
            }
        }
        "oranberry" => {
            battle.section_heal(target, 10.into());
        }
        "lumberry" => {
            battle.section_cure_status(target);
            if let Some(p) = battle.get_pokemon_mut(target) {
                p.volatile_status.retain(|v| v.as_ref() != "confusion");
            }
        }
        "cheriberry" | "chestoberry" | "pechaberry" | "rawstberry" | "aspearberry" => {
            battle.section_cure_status(target);
        }
        "persimberry" => {
            if let Some(p) = battle.get_pokemon_mut(target) {
                p.volatile_status.retain(|v| v.as_ref() != "confusion");
            }
        }
        _ => {}
    }
}
