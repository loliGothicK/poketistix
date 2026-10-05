use crate::sim::battle::{Battle, EventContext, EventId, PokemonIdent, Stat};
use crate::sim::log::{BattleLog, BattleLogEvent};
use crate::wasm_api::Boosts;
use pkmn_meta::types::*;

#[derive(Default)]
pub struct Condition {
    pub name: String,
    pub has_on_modify_priority: bool,
    pub has_on_modify_atk: bool,
    pub has_on_modify_def: bool,
    pub has_on_modify_spa: bool,
    pub has_on_modify_spd: bool,
    pub has_on_base_power: bool,
    pub has_on_modify_type: bool,
    pub boosts_spa: Option<i32>,
    pub suppress_weather: bool,
}

pub fn execute_ability(
    battle: &mut Battle,
    ident: PokemonIdent,
    ability_id: &str,
    event_id: &EventId,
    ctx: &mut EventContext,
) {
    if let EventId::BeforeApplyStatus = event_id
        && ctx.target == ident
    {
        let status = ctx.string_val.as_str();

        // Check hardcoded status immunities
        let immune = match ability_id {
            "immunity" | "pastelveil" => status == "psn" || status == "tox",
            "limber" => status == "par",
            "waterveil" | "waterbubble" => status == "brn",
            "magmaarmor" => status == "frz",
            "insomnia" | "vitalspirit" | "sweetveil" => status == "slp",
            "purifyingsalt" | "comatose" | "shieldsdown" => true,
            "leafguard" => {
                battle.weather == Some(Weather::HashSunlight)
                    || battle.weather == Some(Weather::ExtremelyHarshSunlight)
            }
            "icebody" | "snowcloak" => battle.weather == Some(Weather::Snow),
            _ => false,
        };

        if immune {
            ctx.canceled = true;
        }
    }

    if let EventId::BeforeApplyVolatile = event_id
        && ctx.target == ident
    {
        let volatile = ctx.string_val.as_str();

        let immune = match ability_id {
            "owntempo" => {
                matches!(volatile, "confusion")
                    || ctx.volatile_status_val == Some(VolatileStatus::Confusion)
            }
            "oblivious" => {
                matches!(volatile, "attract" | "taunt")
                    || ctx.volatile_status_val == Some(VolatileStatus::Attract)
                    || ctx.volatile_status_val == Some(VolatileStatus::Taunt)
            }
            "innerfocus" => {
                matches!(volatile, "flinch")
                    || ctx.volatile_status_val == Some(VolatileStatus::Flinch)
            }
            _ => false,
        };

        if immune {
            ctx.canceled = true;
        }
    }

    if let EventId::AfterStatChange = event_id
        && ctx.target == ident
    {
        // num_val contains the actual stat change amount (e.g. -1).
        let actual_change = ctx.num_val;
        let is_foe = ctx
            .source
            .map(|s| s.player != ident.player)
            .unwrap_or(false);

        if actual_change < 0 && is_foe {
            match ability_id {
                "defiant" => {
                    battle.apply_stat_change(
                        ident.player,
                        ident.slot,
                        vec![(Stat::Atk, 2)],
                        ident.player,
                        Some("defiant"),
                    );
                }
                "competitive" => {
                    battle.apply_stat_change(
                        ident.player,
                        ident.slot,
                        vec![(Stat::Spa, 2)],
                        ident.player,
                        Some("competitive"),
                    );
                }
                _ => {}
            }
        }
    }

    if let EventId::BeforeTakeDamage = event_id
        && ctx.target == ident
        && ability_id == "sturdy"
    {
        let (hp, maxhp) = battle.hp_and_max(ident);
        if hp.into_inner() > 0
            && hp.into_inner() == maxhp.into_inner()
            && ctx.num_val >= hp.into_inner()
        {
            ctx.num_val = hp.into_inner() - 1;
            battle.log.push(crate::sim::log::BattleLogEvent::new(
                crate::sim::log::BattleLog::Ability {
                    target: ctx.target,
                    ability: "Sturdy".to_string(),
                    from_move: None,
                    of: None,
                },
            ));
        }
    }
}

pub fn get_ability(id: &str) -> Option<Condition> {
    let id = id.replace("-", "");
    match id.as_str() {
        "thickfat" => Some(Condition {
            name: "Thick Fat".to_string(),
            ..Default::default()
        }),
        "overgrow" => Some(Condition {
            name: "Overgrow".to_string(),
            has_on_modify_atk: true,
            has_on_modify_spa: true,
            ..Default::default()
        }),
        "chlorophyll" => Some(Condition {
            name: "Chlorophyll".to_string(),
            ..Default::default()
        }),
        "blaze" => Some(Condition {
            name: "Blaze".to_string(),
            has_on_modify_atk: true,
            has_on_modify_spa: true,
            ..Default::default()
        }),
        "solarpower" => Some(Condition {
            name: "Solar Power".to_string(),
            has_on_modify_spa: true,
            ..Default::default()
        }),
        "toughclaws" => Some(Condition {
            name: "Tough Claws".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "drought" => Some(Condition {
            name: "Drought".to_string(),
            ..Default::default()
        }),
        "torrent" => Some(Condition {
            name: "Torrent".to_string(),
            has_on_modify_atk: true,
            has_on_modify_spa: true,
            ..Default::default()
        }),
        "raindish" => Some(Condition {
            name: "Rain Dish".to_string(),
            ..Default::default()
        }),
        "megalauncher" => Some(Condition {
            name: "Mega Launcher".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "swarm" => Some(Condition {
            name: "Swarm".to_string(),
            has_on_modify_atk: true,
            has_on_modify_spa: true,
            ..Default::default()
        }),
        "sniper" => Some(Condition {
            name: "Sniper".to_string(),
            ..Default::default()
        }),
        "adaptability" => Some(Condition {
            name: "Adaptability".to_string(),
            ..Default::default()
        }),
        "noguard" => Some(Condition {
            name: "No Guard".to_string(),
            ..Default::default()
        }),
        "keeneye" => Some(Condition {
            name: "Keen Eye".to_string(),

            ..Default::default()
        }),
        "tangledfeet" => Some(Condition {
            name: "Tangled Feet".to_string(),
            ..Default::default()
        }),
        "bigpecks" => Some(Condition {
            name: "Big Pecks".to_string(),
            ..Default::default()
        }),
        "auraguard" => Some(Condition {
            name: "Aura Guard".to_string(),
            ..Default::default()
        }),
        "intimidate" => Some(Condition {
            name: "Intimidate".to_string(),
            ..Default::default()
        }),
        "shedskin" => Some(Condition {
            name: "Shed Skin".to_string(),
            ..Default::default()
        }),
        "unnerve" => Some(Condition {
            name: "Unnerve".to_string(),
            ..Default::default()
        }),
        "static" => Some(Condition {
            name: "Static".to_string(),
            ..Default::default()
        }),
        "lightningrod" => Some(Condition {
            name: "Lightning Rod".to_string(),
            ..Default::default()
        }),
        "surgesurfer" => Some(Condition {
            name: "Surge Surfer".to_string(),
            ..Default::default()
        }),
        "cutecharm" => Some(Condition {
            name: "Cute Charm".to_string(),
            ..Default::default()
        }),
        "magicguard" => Some(Condition {
            name: "Magic Guard".to_string(),
            ..Default::default()
        }),
        "unaware" => Some(Condition {
            name: "Unaware".to_string(),
            ..Default::default()
        }),
        "magicbounce" => Some(Condition {
            name: "Magic Bounce".to_string(),
            ..Default::default()
        }),
        "snowcloak" => Some(Condition {
            name: "Snow Cloak".to_string(),
            ..Default::default()
        }),
        "snowwarning" => Some(Condition {
            name: "Snow Warning".to_string(),
            ..Default::default()
        }),
        "flashfire" => Some(Condition {
            name: "Flash Fire".to_string(),
            ..Default::default()
        }),
        "justified" => Some(Condition {
            name: "Justified".to_string(),
            ..Default::default()
        }),
        "rockhead" => Some(Condition {
            name: "Rock Head".to_string(),
            ..Default::default()
        }),
        "synchronize" => Some(Condition {
            name: "Synchronize".to_string(),
            ..Default::default()
        }),
        "innerfocus" => Some(Condition {
            name: "Inner Focus".to_string(),
            ..Default::default()
        }),
        "trace" => Some(Condition {
            name: "Trace".to_string(),
            ..Default::default()
        }),
        "guts" => Some(Condition {
            name: "Guts".to_string(),
            has_on_modify_atk: true,
            ..Default::default()
        }),
        "steadfast" => Some(Condition {
            name: "Steadfast".to_string(),
            ..Default::default()
        }),
        "innardsout" => Some(Condition {
            name: "Innards Out".to_string(),
            ..Default::default()
        }),
        "gluttony" => Some(Condition {
            name: "Gluttony".to_string(),
            ..Default::default()
        }),
        "quickdraw" => Some(Condition {
            name: "Quick Draw".to_string(),
            ..Default::default()
        }),
        "owntempo" => Some(Condition {
            name: "Own Tempo".to_string(),
            ..Default::default()
        }),
        "regenerator" => Some(Condition {
            name: "Regenerator".to_string(),
            ..Default::default()
        }),
        "shellarmor" => Some(Condition {
            name: "Shell Armor".to_string(),
            ..Default::default()
        }),
        "oblivious" => Some(Condition {
            name: "Oblivious".to_string(),
            ..Default::default()
        }),
        "cursedbody" => Some(Condition {
            name: "Cursed Body".to_string(),
            ..Default::default()
        }),
        "shadowtag" => Some(Condition {
            name: "Shadow Tag".to_string(),
            ..Default::default()
        }),
        "earlybird" => Some(Condition {
            name: "Early Bird".to_string(),
            ..Default::default()
        }),
        "scrappy" => Some(Condition {
            name: "Scrappy".to_string(),
            ..Default::default()
        }),
        "parentalbond" => Some(Condition {
            name: "Parental Bond".to_string(),
            ..Default::default()
        }),
        "hugepower" => Some(Condition {
            name: "Huge Power".to_string(),
            has_on_modify_atk: true,
            ..Default::default()
        }),
        "illuminate" => Some(Condition {
            name: "Illuminate".to_string(),
            ..Default::default()
        }),
        "naturalcure" => Some(Condition {
            name: "Natural Cure".to_string(),
            ..Default::default()
        }),
        "analytic" => Some(Condition {
            name: "Analytic".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "aerilate" => Some(Condition {
            name: "Aerilate".to_string(),
            has_on_modify_type: true,
            has_on_base_power: true,
            ..Default::default()
        }),
        "hypercutter" => Some(Condition {
            name: "Hyper Cutter".to_string(),

            ..Default::default()
        }),
        "moldbreaker" => Some(Condition {
            name: "Mold Breaker".to_string(),
            ..Default::default()
        }),
        "moxie" => Some(Condition {
            name: "Moxie".to_string(),
            ..Default::default()
        }),
        "angerpoint" => Some(Condition {
            name: "Anger Point".to_string(),
            ..Default::default()
        }),
        "cudchew" => Some(Condition {
            name: "Cud Chew".to_string(),
            ..Default::default()
        }),
        "sheerforce" => Some(Condition {
            name: "Sheer Force".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "limber" => Some(Condition {
            name: "Limber".to_string(),
            ..Default::default()
        }),
        "imposter" => Some(Condition {
            name: "Imposter".to_string(),
            ..Default::default()
        }),
        "waterabsorb" => Some(Condition {
            name: "Water Absorb".to_string(),
            ..Default::default()
        }),
        "hydration" => Some(Condition {
            name: "Hydration".to_string(),
            ..Default::default()
        }),
        "voltabsorb" => Some(Condition {
            name: "Volt Absorb".to_string(),
            ..Default::default()
        }),
        "quickfeet" => Some(Condition {
            name: "Quick Feet".to_string(),
            ..Default::default()
        }),
        "pressure" => Some(Condition {
            name: "Pressure".to_string(),
            ..Default::default()
        }),
        "immunity" => Some(Condition {
            name: "Immunity".to_string(),
            ..Default::default()
        }),
        "multiscale" => Some(Condition {
            name: "Multiscale".to_string(),
            ..Default::default()
        }),
        "megasol" => Some(Condition {
            name: "Mega Sol".to_string(),
            ..Default::default()
        }),
        "leafguard" => Some(Condition {
            name: "Leaf Guard".to_string(),
            ..Default::default()
        }),
        "frisk" => Some(Condition {
            name: "Frisk".to_string(),
            ..Default::default()
        }),
        "dragonize" => Some(Condition {
            name: "Dragonize".to_string(),
            has_on_modify_type: true,
            has_on_base_power: true,
            ..Default::default()
        }),
        "insomnia" => Some(Condition {
            name: "Insomnia".to_string(),
            ..Default::default()
        }),
        "plus" => Some(Condition {
            name: "Plus".to_string(),
            has_on_modify_spa: true,
            ..Default::default()
        }),
        "sapsipper" => Some(Condition {
            name: "Sap Sipper".to_string(),
            ..Default::default()
        }),
        "damp" => Some(Condition {
            name: "Damp".to_string(),
            ..Default::default()
        }),
        "drizzle" => Some(Condition {
            name: "Drizzle".to_string(),
            ..Default::default()
        }),
        "curiousmedicine" => Some(Condition {
            name: "Curious Medicine".to_string(),
            ..Default::default()
        }),
        "sturdy" => Some(Condition {
            name: "Sturdy".to_string(),
            ..Default::default()
        }),
        "overcoat" => Some(Condition {
            name: "Overcoat".to_string(),
            ..Default::default()
        }),
        "sandforce" => Some(Condition {
            name: "Sand Force".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "technician" => Some(Condition {
            name: "Technician".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "lightmetal" => Some(Condition {
            name: "Light Metal".to_string(),
            ..Default::default()
        }),
        "skilllink" => Some(Condition {
            name: "Skill Link".to_string(),
            ..Default::default()
        }),
        "stalwart" => Some(Condition {
            name: "Stalwart".to_string(),
            ..Default::default()
        }),
        "weakarmor" => Some(Condition {
            name: "Weak Armor".to_string(),
            ..Default::default()
        }),
        "sandstream" => Some(Condition {
            name: "Sand Stream".to_string(),
            ..Default::default()
        }),
        "telepathy" => Some(Condition {
            name: "Telepathy".to_string(),
            ..Default::default()
        }),
        "pixilate" => Some(Condition {
            name: "Pixilate".to_string(),
            has_on_modify_type: true,
            has_on_base_power: true,
            ..Default::default()
        }),
        "stall" => Some(Condition {
            name: "Stall".to_string(),
            ..Default::default()
        }),
        "prankster" => Some(Condition {
            name: "Prankster".to_string(),
            has_on_modify_priority: true,
            ..Default::default()
        }),
        "heavymetal" => Some(Condition {
            name: "Heavy Metal".to_string(),
            ..Default::default()
        }),
        "filter" => Some(Condition {
            name: "Filter".to_string(),
            ..Default::default()
        }),
        "purepower" => Some(Condition {
            name: "Pure Power".to_string(),
            has_on_modify_atk: true,
            ..Default::default()
        }),
        "minus" => Some(Condition {
            name: "Minus".to_string(),
            has_on_modify_spa: true,
            ..Default::default()
        }),
        "strongjaw" => Some(Condition {
            name: "Strong Jaw".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "roughskin" => Some(Condition {
            name: "Rough Skin".to_string(),
            ..Default::default()
        }),
        "speedboost" => Some(Condition {
            name: "Speed Boost".to_string(),
            ..Default::default()
        }),
        "magmaarmor" => Some(Condition {
            name: "Magma Armor".to_string(),
            ..Default::default()
        }),
        "solidrock" => Some(Condition {
            name: "Solid Rock".to_string(),
            ..Default::default()
        }),
        "whitesmoke" => Some(Condition {
            name: "White Smoke".to_string(),

            ..Default::default()
        }),
        "cloudnine" => Some(Condition {
            name: "Cloud Nine".to_string(),
            suppress_weather: true,
            ..Default::default()
        }),
        "marvelscale" => Some(Condition {
            name: "Marvel Scale".to_string(),
            has_on_modify_def: true,
            ..Default::default()
        }),
        "competitive" => Some(Condition {
            name: "Competitive".to_string(),
            ..Default::default()
        }),
        "forecast" => Some(Condition {
            name: "Forecast".to_string(),
            ..Default::default()
        }),

        "levitate" => Some(Condition {
            name: "Levitate".to_string(),
            ..Default::default()
        }),
        "superluck" => Some(Condition {
            name: "Super Luck".to_string(),
            ..Default::default()
        }),
        "icebody" => Some(Condition {
            name: "Ice Body".to_string(),
            ..Default::default()
        }),
        "moody" => Some(Condition {
            name: "Moody".to_string(),
            ..Default::default()
        }),
        "refrigerate" => Some(Condition {
            name: "Refrigerate".to_string(),
            has_on_modify_type: true,
            has_on_base_power: true,
            ..Default::default()
        }),
        "ironfist" => Some(Condition {
            name: "Iron Fist".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "rivalry" => Some(Condition {
            name: "Rivalry".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "poisonpoint" => Some(Condition {
            name: "Poison Point".to_string(),
            ..Default::default()
        }),
        "soundproof" => Some(Condition {
            name: "Soundproof".to_string(),
            ..Default::default()
        }),
        "klutz" => Some(Condition {
            name: "Klutz".to_string(),
            ..Default::default()
        }),
        "infiltrator" => Some(Condition {
            name: "Infiltrator".to_string(),
            ..Default::default()
        }),
        "sandveil" => Some(Condition {
            name: "Sand Veil".to_string(),
            ..Default::default()
        }),
        "anticipation" => Some(Condition {
            name: "Anticipation".to_string(),
            ..Default::default()
        }),
        "dryskin" => Some(Condition {
            name: "Dry Skin".to_string(),
            ..Default::default()
        }),
        "poisontouch" => Some(Condition {
            name: "Poison Touch".to_string(),
            ..Default::default()
        }),
        "pickpocket" => Some(Condition {
            name: "Pickpocket".to_string(),
            ..Default::default()
        }),
        "reckless" => Some(Condition {
            name: "Reckless".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "poisonheal" => Some(Condition {
            name: "Poison Heal".to_string(),
            ..Default::default()
        }),
        "sharpness" => Some(Condition {
            name: "Sharpness".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "contrary" => Some(Condition {
            name: "Contrary".to_string(),

            ..Default::default()
        }),
        "unburden" => Some(Condition {
            name: "Unburden".to_string(),
            ..Default::default()
        }),
        "sandrush" => Some(Condition {
            name: "Sand Rush".to_string(),
            ..Default::default()
        }),
        "piercingdrill" => Some(Condition {
            name: "Piercing Drill".to_string(),
            ..Default::default()
        }),
        "healer" => Some(Condition {
            name: "Healer".to_string(),
            ..Default::default()
        }),
        "mummy" => Some(Condition {
            name: "Mummy".to_string(),
            ..Default::default()
        }),
        "stench" => Some(Condition {
            name: "Stench".to_string(),
            ..Default::default()
        }),
        "aftermath" => Some(Condition {
            name: "Aftermath".to_string(),
            ..Default::default()
        }),
        "illusion" => Some(Condition {
            name: "Illusion".to_string(),
            ..Default::default()
        }),
        "motordrive" => Some(Condition {
            name: "Motor Drive".to_string(),
            ..Default::default()
        }),
        "flamebody" => Some(Condition {
            name: "Flame Body".to_string(),
            ..Default::default()
        }),
        "slushrush" => Some(Condition {
            name: "Slush Rush".to_string(),
            ..Default::default()
        }),
        "swiftswim" => Some(Condition {
            name: "Swift Swim".to_string(),
            ..Default::default()
        }),
        "mimicry" => Some(Condition {
            name: "Mimicry".to_string(),
            ..Default::default()
        }),
        "unseenfist" => Some(Condition {
            name: "Unseen Fist".to_string(),
            ..Default::default()
        }),
        "bulletproof" => Some(Condition {
            name: "Bulletproof".to_string(),
            ..Default::default()
        }),
        "magician" => Some(Condition {
            name: "Magician".to_string(),
            ..Default::default()
        }),
        "protean" => Some(Condition {
            name: "Protean".to_string(),
            ..Default::default()
        }),
        "pickup" => Some(Condition {
            name: "Pickup".to_string(),
            ..Default::default()
        }),
        "cheekpouch" => Some(Condition {
            name: "Cheek Pouch".to_string(),
            ..Default::default()
        }),
        "galewings" => Some(Condition {
            name: "Gale Wings".to_string(),
            has_on_modify_priority: true,
            ..Default::default()
        }),
        "shielddust" => Some(Condition {
            name: "Shield Dust".to_string(),
            ..Default::default()
        }),
        "friendguard" => Some(Condition {
            name: "Friend Guard".to_string(),
            ..Default::default()
        }),
        "flowerveil" => Some(Condition {
            name: "Flower Veil".to_string(),
            ..Default::default()
        }),
        "symbiosis" => Some(Condition {
            name: "Symbiosis".to_string(),
            ..Default::default()
        }),
        "fairyaura" => Some(Condition {
            name: "Fairy Aura".to_string(),
            ..Default::default()
        }),
        "furcoat" => Some(Condition {
            name: "Fur Coat".to_string(),
            has_on_modify_def: true,
            ..Default::default()
        }),
        "stancechange" => Some(Condition {
            name: "Stance Change".to_string(),
            ..Default::default()
        }),
        "aromaveil" => Some(Condition {
            name: "Aroma Veil".to_string(),
            ..Default::default()
        }),
        "sweetveil" => Some(Condition {
            name: "Sweet Veil".to_string(),
            ..Default::default()
        }),
        "gooey" => Some(Condition {
            name: "Gooey".to_string(),
            ..Default::default()
        }),
        "harvest" => Some(Condition {
            name: "Harvest".to_string(),
            ..Default::default()
        }),
        "longreach" => Some(Condition {
            name: "Long Reach".to_string(),
            ..Default::default()
        }),
        "liquidvoice" => Some(Condition {
            name: "Liquid Voice".to_string(),
            ..Default::default()
        }),
        "vitalspirit" => Some(Condition {
            name: "Vital Spirit".to_string(),
            ..Default::default()
        }),
        "merciless" => Some(Condition {
            name: "Merciless".to_string(),
            ..Default::default()
        }),
        "stamina" => Some(Condition {
            name: "Stamina".to_string(),
            ..Default::default()
        }),
        "waterbubble" => Some(Condition {
            name: "Water Bubble".to_string(),
            has_on_modify_atk: true,
            has_on_modify_spa: true,
            ..Default::default()
        }),
        "corrosion" => Some(Condition {
            name: "Corrosion".to_string(),
            ..Default::default()
        }),
        "queenlymajesty" => Some(Condition {
            name: "Queenly Majesty".to_string(),
            ..Default::default()
        }),
        "receiver" => Some(Condition {
            name: "Receiver".to_string(),
            ..Default::default()
        }),
        "defiant" => Some(Condition {
            name: "Defiant".to_string(),
            ..Default::default()
        }),
        "disguise" => Some(Condition {
            name: "Disguise".to_string(),
            ..Default::default()
        }),
        "berserk" => Some(Condition {
            name: "Berserk".to_string(),
            ..Default::default()
        }),
        "mirrorarmor" => Some(Condition {
            name: "Mirror Armor".to_string(),
            ..Default::default()
        }),
        "ripen" => Some(Condition {
            name: "Ripen".to_string(),
            ..Default::default()
        }),
        "hustle" => Some(Condition {
            name: "Hustle".to_string(),
            has_on_modify_atk: true,
            ..Default::default()
        }),
        "sandspit" => Some(Condition {
            name: "Sand Spit".to_string(),
            ..Default::default()
        }),
        "screencleaner" => Some(Condition {
            name: "Screen Cleaner".to_string(),
            ..Default::default()
        }),
        "wanderingspirit" => Some(Condition {
            name: "Wandering Spirit".to_string(),
            ..Default::default()
        }),
        "hungerswitch" => Some(Condition {
            name: "Hunger Switch".to_string(),
            ..Default::default()
        }),
        "clearbody" => Some(Condition {
            name: "Clear Body".to_string(),

            ..Default::default()
        }),
        "purifyingsalt" => Some(Condition {
            name: "Purifying Salt".to_string(),
            ..Default::default()
        }),
        "electromorphosis" => Some(Condition {
            name: "Electromorphosis".to_string(),
            ..Default::default()
        }),
        "spicyspray" => Some(Condition {
            name: "Spicy Spray".to_string(),
            ..Default::default()
        }),
        "opportunist" => Some(Condition {
            name: "Opportunist".to_string(),
            ..Default::default()
        }),
        "zerotohero" => Some(Condition {
            name: "Zero to Hero".to_string(),
            ..Default::default()
        }),
        "eartheater" => Some(Condition {
            name: "Earth Eater".to_string(),
            ..Default::default()
        }),
        "toxicdebris" => Some(Condition {
            name: "Toxic Debris".to_string(),
            ..Default::default()
        }),
        "armortail" => Some(Condition {
            name: "Armor Tail".to_string(),
            ..Default::default()
        }),
        "supremeoverlord" => Some(Condition {
            name: "Supreme Overlord".to_string(),
            has_on_base_power: true,
            ..Default::default()
        }),
        "hospitality" => Some(Condition {
            name: "Hospitality".to_string(),
            ..Default::default()
        }),
        "heatproof" => Some(Condition {
            name: "Heatproof".to_string(),
            ..Default::default()
        }),
        "supersweetsyrup" => Some(Condition {
            name: "Supersweet Syrup".to_string(),
            ..Default::default()
        }),
        "stickyhold" => Some(Condition {
            name: "Sticky Hold".to_string(),
            ..Default::default()
        }),
        "electricsurge" => Some(Condition {
            name: "Electric Surge".to_string(),
            ..Default::default()
        }),
        "effectspore" => Some(Condition {
            name: "Effect Spore".to_string(),
            ..Default::default()
        }),
        "forewarn" => Some(Condition {
            name: "Forewarn".to_string(),
            ..Default::default()
        }),
        "eelevate" => Some(Condition {
            name: "Eelevate".to_string(),
            ..Default::default()
        }),
        "firemane" => Some(Condition {
            name: "Fire Mane".to_string(),
            has_on_modify_atk: true,
            has_on_modify_spa: true,
            ..Default::default()
        }),
        "suctioncups" => Some(Condition {
            name: "Suction Cups".to_string(),
            ..Default::default()
        }),
        "battlearmor" => Some(Condition {
            name: "Battle Armor".to_string(),
            ..Default::default()
        }),
        "fluffy" => Some(Condition {
            name: "Fluffy".to_string(),
            ..Default::default()
        }),
        "goodasgold" => Some(Condition {
            name: "Good as Gold".to_string(),
            ..Default::default()
        }),
        "airlock" => Some(Condition {
            name: "Air Lock".to_string(),
            suppress_weather: true,
            ..Default::default()
        }),
        "angershell" => Some(Condition {
            name: "Angershell".to_string(),
            ..Default::default()
        }),
        "arenatrap" => Some(Condition {
            name: "Arenatrap".to_string(),
            ..Default::default()
        }),
        "asoneglastrier" => Some(Condition {
            name: "Asoneglastrier".to_string(),
            ..Default::default()
        }),
        "asonespectrier" => Some(Condition {
            name: "Asonespectrier".to_string(),
            ..Default::default()
        }),
        "aurabreak" => Some(Condition {
            name: "Aurabreak".to_string(),
            ..Default::default()
        }),
        "baddreams" => Some(Condition {
            name: "Baddreams".to_string(),
            ..Default::default()
        }),
        "ballfetch" => Some(Condition {
            name: "Ballfetch".to_string(),
            ..Default::default()
        }),
        "battery" => Some(Condition {
            name: "Battery".to_string(),
            ..Default::default()
        }),
        "battlebond" => Some(Condition {
            name: "Battlebond".to_string(),
            ..Default::default()
        }),
        "beadsofruin" => Some(Condition {
            name: "Beadsofruin".to_string(),
            ..Default::default()
        }),
        "beastboost" => Some(Condition {
            name: "Beastboost".to_string(),
            ..Default::default()
        }),
        "chillingneigh" => Some(Condition {
            name: "Chillingneigh".to_string(),
            ..Default::default()
        }),
        "colorchange" => Some(Condition {
            name: "Colorchange".to_string(),
            ..Default::default()
        }),
        "comatose" => Some(Condition {
            name: "Comatose".to_string(),
            ..Default::default()
        }),
        "commander" => Some(Condition {
            name: "Commander".to_string(),
            ..Default::default()
        }),
        "compoundeyes" => Some(Condition {
            name: "Compoundeyes".to_string(),
            ..Default::default()
        }),
        "costar" => Some(Condition {
            name: "Costar".to_string(),
            ..Default::default()
        }),
        "cottondown" => Some(Condition {
            name: "Cottondown".to_string(),
            ..Default::default()
        }),
        "dancer" => Some(Condition {
            name: "Dancer".to_string(),
            ..Default::default()
        }),
        "darkaura" => Some(Condition {
            name: "Darkaura".to_string(),
            ..Default::default()
        }),
        "dauntlessshield" => Some(Condition {
            name: "Dauntlessshield".to_string(),
            ..Default::default()
        }),
        "dazzling" => Some(Condition {
            name: "Dazzling".to_string(),
            ..Default::default()
        }),
        "defeatist" => Some(Condition {
            name: "Defeatist".to_string(),
            ..Default::default()
        }),
        "deltastream" => Some(Condition {
            name: "Deltastream".to_string(),
            ..Default::default()
        }),
        "desolateland" => Some(Condition {
            name: "Desolateland".to_string(),
            ..Default::default()
        }),
        "download" => Some(Condition {
            name: "Download".to_string(),
            ..Default::default()
        }),
        "dragonsmaw" => Some(Condition {
            name: "Dragonsmaw".to_string(),
            ..Default::default()
        }),
        "embodyaspectcornerstone" => Some(Condition {
            name: "Embodyaspectcornerstone".to_string(),
            ..Default::default()
        }),
        "embodyaspecthearthflame" => Some(Condition {
            name: "Embodyaspecthearthflame".to_string(),
            ..Default::default()
        }),
        "embodyaspectteal" => Some(Condition {
            name: "Embodyaspectteal".to_string(),
            ..Default::default()
        }),
        "embodyaspectwellspring" => Some(Condition {
            name: "Embodyaspectwellspring".to_string(),
            ..Default::default()
        }),
        "emergencyexit" => Some(Condition {
            name: "Emergencyexit".to_string(),
            ..Default::default()
        }),
        "flareboost" => Some(Condition {
            name: "Flareboost".to_string(),
            ..Default::default()
        }),
        "flowergift" => Some(Condition {
            name: "Flowergift".to_string(),
            ..Default::default()
        }),
        "fullmetalbody" => Some(Condition {
            name: "Full Metal Body".to_string(),

            ..Default::default()
        }),
        "galvanize" => Some(Condition {
            name: "Galvanize".to_string(),
            has_on_modify_type: true,
            has_on_base_power: true,
            ..Default::default()
        }),
        "gorillatactics" => Some(Condition {
            name: "Gorillatactics".to_string(),
            ..Default::default()
        }),
        "grasspelt" => Some(Condition {
            name: "Grasspelt".to_string(),
            ..Default::default()
        }),
        "grassysurge" => Some(Condition {
            name: "Grassysurge".to_string(),
            ..Default::default()
        }),
        "grimneigh" => Some(Condition {
            name: "Grimneigh".to_string(),
            ..Default::default()
        }),
        "guarddog" => Some(Condition {
            name: "Guarddog".to_string(),
            ..Default::default()
        }),
        "gulpmissile" => Some(Condition {
            name: "Gulpmissile".to_string(),
            ..Default::default()
        }),
        "hadronengine" => Some(Condition {
            name: "Hadronengine".to_string(),
            ..Default::default()
        }),
        "honeygather" => Some(Condition {
            name: "Honeygather".to_string(),
            ..Default::default()
        }),
        "iceface" => Some(Condition {
            name: "Iceface".to_string(),
            ..Default::default()
        }),
        "icescales" => Some(Condition {
            name: "Icescales".to_string(),
            ..Default::default()
        }),
        "intrepidsword" => Some(Condition {
            name: "Intrepidsword".to_string(),
            ..Default::default()
        }),
        "ironbarbs" => Some(Condition {
            name: "Ironbarbs".to_string(),
            ..Default::default()
        }),
        "libero" => Some(Condition {
            name: "Libero".to_string(),
            ..Default::default()
        }),
        "lingeringaroma" => Some(Condition {
            name: "Lingeringaroma".to_string(),
            ..Default::default()
        }),
        "liquidooze" => Some(Condition {
            name: "Liquidooze".to_string(),
            ..Default::default()
        }),
        "magnetpull" => Some(Condition {
            name: "Magnetpull".to_string(),
            ..Default::default()
        }),
        "mindseye" => Some(Condition {
            name: "Mindseye".to_string(),
            ..Default::default()
        }),
        "mistysurge" => Some(Condition {
            name: "Mistysurge".to_string(),
            ..Default::default()
        }),
        "multitype" => Some(Condition {
            name: "Multitype".to_string(),
            ..Default::default()
        }),
        "myceliummight" => Some(Condition {
            name: "Myceliummight".to_string(),
            ..Default::default()
        }),
        "neuroforce" => Some(Condition {
            name: "Neuroforce".to_string(),
            ..Default::default()
        }),
        "neutralizinggas" => Some(Condition {
            name: "Neutralizinggas".to_string(),
            ..Default::default()
        }),
        "normalize" => Some(Condition {
            name: "Normalize".to_string(),
            has_on_modify_type: true,
            has_on_base_power: true,
            ..Default::default()
        }),
        "orichalcumpulse" => Some(Condition {
            name: "Orichalcumpulse".to_string(),
            ..Default::default()
        }),
        "pastelveil" => Some(Condition {
            name: "Pastelveil".to_string(),
            ..Default::default()
        }),
        "perishbody" => Some(Condition {
            name: "Perishbody".to_string(),
            ..Default::default()
        }),
        "poisonpuppeteer" => Some(Condition {
            name: "Poisonpuppeteer".to_string(),
            ..Default::default()
        }),
        "powerconstruct" => Some(Condition {
            name: "Powerconstruct".to_string(),
            ..Default::default()
        }),
        "powerofalchemy" => Some(Condition {
            name: "Powerofalchemy".to_string(),
            ..Default::default()
        }),
        "powerspot" => Some(Condition {
            name: "Powerspot".to_string(),
            ..Default::default()
        }),
        "primordialsea" => Some(Condition {
            name: "Primordialsea".to_string(),
            ..Default::default()
        }),
        "prismarmor" => Some(Condition {
            name: "Prismarmor".to_string(),
            ..Default::default()
        }),
        "propellertail" => Some(Condition {
            name: "Propellertail".to_string(),
            ..Default::default()
        }),
        "protosynthesis" => Some(Condition {
            name: "Protosynthesis".to_string(),
            ..Default::default()
        }),
        "psychicsurge" => Some(Condition {
            name: "Psychicsurge".to_string(),
            ..Default::default()
        }),
        "punkrock" => Some(Condition {
            name: "Punkrock".to_string(),
            ..Default::default()
        }),
        "quarkdrive" => Some(Condition {
            name: "Quarkdrive".to_string(),
            ..Default::default()
        }),
        "rattled" => Some(Condition {
            name: "Rattled".to_string(),
            ..Default::default()
        }),
        "rkssystem" => Some(Condition {
            name: "Rkssystem".to_string(),
            ..Default::default()
        }),
        "rockypayload" => Some(Condition {
            name: "Rockypayload".to_string(),
            ..Default::default()
        }),
        "runaway" => Some(Condition {
            name: "Runaway".to_string(),
            ..Default::default()
        }),
        "schooling" => Some(Condition {
            name: "Schooling".to_string(),
            ..Default::default()
        }),
        "seedsower" => Some(Condition {
            name: "Seedsower".to_string(),
            ..Default::default()
        }),
        "serenegrace" => Some(Condition {
            name: "Serenegrace".to_string(),
            ..Default::default()
        }),
        "shadowshield" => Some(Condition {
            name: "Shadowshield".to_string(),
            ..Default::default()
        }),
        "shieldsdown" => Some(Condition {
            name: "Shieldsdown".to_string(),
            ..Default::default()
        }),
        "simple" => Some(Condition {
            name: "Simple".to_string(),

            ..Default::default()
        }),
        "slowstart" => Some(Condition {
            name: "Slowstart".to_string(),
            ..Default::default()
        }),
        "soulheart" => Some(Condition {
            name: "Soulheart".to_string(),
            ..Default::default()
        }),
        "stakeout" => Some(Condition {
            name: "Stakeout".to_string(),
            ..Default::default()
        }),
        "steamengine" => Some(Condition {
            name: "Steamengine".to_string(),
            ..Default::default()
        }),
        "steelworker" => Some(Condition {
            name: "Steelworker".to_string(),
            ..Default::default()
        }),
        "steelyspirit" => Some(Condition {
            name: "Steelyspirit".to_string(),
            ..Default::default()
        }),
        "stormdrain" => Some(Condition {
            name: "Stormdrain".to_string(),
            ..Default::default()
        }),
        "swordofruin" => Some(Condition {
            name: "Swordofruin".to_string(),
            ..Default::default()
        }),
        "tabletsofruin" => Some(Condition {
            name: "Tabletsofruin".to_string(),
            ..Default::default()
        }),
        "tanglinghair" => Some(Condition {
            name: "Tanglinghair".to_string(),
            ..Default::default()
        }),
        "teraformzero" => Some(Condition {
            name: "Teraformzero".to_string(),
            ..Default::default()
        }),
        "terashell" => Some(Condition {
            name: "Terashell".to_string(),
            ..Default::default()
        }),
        "terashift" => Some(Condition {
            name: "Terashift".to_string(),
            ..Default::default()
        }),
        "teravolt" => Some(Condition {
            name: "Teravolt".to_string(),
            ..Default::default()
        }),
        "thermalexchange" => Some(Condition {
            name: "Thermalexchange".to_string(),
            ..Default::default()
        }),
        "tintedlens" => Some(Condition {
            name: "Tintedlens".to_string(),
            ..Default::default()
        }),
        "toxicboost" => Some(Condition {
            name: "Toxicboost".to_string(),
            ..Default::default()
        }),
        "toxicchain" => Some(Condition {
            name: "Toxicchain".to_string(),
            ..Default::default()
        }),
        "transistor" => Some(Condition {
            name: "Transistor".to_string(),
            ..Default::default()
        }),
        "triage" => Some(Condition {
            name: "Triage".to_string(),
            ..Default::default()
        }),
        "truant" => Some(Condition {
            name: "Truant".to_string(),
            ..Default::default()
        }),
        "turboblaze" => Some(Condition {
            name: "Turboblaze".to_string(),
            ..Default::default()
        }),
        "vesselofruin" => Some(Condition {
            name: "Vesselofruin".to_string(),
            ..Default::default()
        }),
        "victorystar" => Some(Condition {
            name: "Victorystar".to_string(),
            ..Default::default()
        }),
        "watercompaction" => Some(Condition {
            name: "Watercompaction".to_string(),
            ..Default::default()
        }),
        "waterveil" => Some(Condition {
            name: "Waterveil".to_string(),
            ..Default::default()
        }),
        "wellbakedbody" => Some(Condition {
            name: "Wellbakedbody".to_string(),
            ..Default::default()
        }),
        "wimpout" => Some(Condition {
            name: "Wimpout".to_string(),
            ..Default::default()
        }),
        "windpower" => Some(Condition {
            name: "Windpower".to_string(),
            ..Default::default()
        }),
        "windrider" => Some(Condition {
            name: "Windrider".to_string(),
            ..Default::default()
        }),
        "wonderguard" => Some(Condition {
            name: "Wonderguard".to_string(),
            ..Default::default()
        }),
        "wonderskin" => Some(Condition {
            name: "Wonderskin".to_string(),
            ..Default::default()
        }),
        "zenmode" => Some(Condition {
            name: "Zenmode".to_string(),
            ..Default::default()
        }),
        _ => None,
    }
}

pub fn on_try_boost(
    ability_id: &str,
    _battle: &mut Battle,
    target: PokemonIdent,
    source: PokemonIdent,
    stat: crate::sim::battle::Stat,
    amount: i8,
    source_effect: Option<&str>,
) -> bool {
    match ability_id {
        "clearbody" | "whitesmoke" | "fullmetalbody" => {
            if target != source && amount < 0 {
                return false;
            }
            true
        }
        "hypercutter" => {
            if target != source && amount < 0 && stat == crate::sim::battle::Stat::Atk {
                return false;
            }
            true
        }
        "keeneye" | "illuminate" => {
            if target != source && amount < 0 && stat == Stat::Accuracy {
                return false;
            }
            true
        }
        "bigpecks" => {
            if target != source && amount < 0 && stat == crate::sim::battle::Stat::Def {
                return false;
            }
            true
        }
        "innerfocus" | "oblivious" | "owntempo" | "scrappy" => {
            if source_effect == Some("intimidate")
                && amount < 0
                && stat == crate::sim::battle::Stat::Atk
            {
                return false;
            }
            true
        }
        _ => true,
    }
}

pub fn on_modify_boost(
    ability_id: &str,
    _battle: &mut Battle,
    _target: PokemonIdent,
    stat: crate::sim::battle::Stat,
    amount: i8,
    source_effect: Option<&str>,
) -> i8 {
    match ability_id {
        "contrary" => -amount,
        "simple" => amount * 2,
        "guarddog" => {
            if source_effect == Some("intimidate") && stat == crate::sim::battle::Stat::Atk {
                1
            } else {
                amount
            }
        }
        _ => amount,
    }
}

pub fn on_start(ability_id: &str, battle: &mut Battle, target: PokemonIdent) {
    if ability_id == "anticipation" {
        let foes: Vec<_> = if target.player == 1 {
            battle.p2.active.clone()
        } else {
            battle.p1.active.clone()
        };
        let user = battle.get_pokemon(target);
        if let Some(user) = user {
            let u_type1 = user.type1;
            let u_type2 = user.type2;
            let u_type3 = user.added_type;
            let mut shudder = false;
            for foe in &foes {
                if foe.hp.into_inner() <= 0 {
                    continue;
                }
                for m_id in &foe.moves {
                    if let Some(meta) = pkmn_meta::move_meta::get_move_meta(m_id) {
                        if *meta.category() == Category::Status {
                            continue;
                        }
                        if [
                            "fissure",
                            "sheercold",
                            "guillotine",
                            "horndrill",
                            "selfdestruct",
                            "explosion",
                        ]
                        .contains(&m_id.as_str())
                        {
                            shudder = true;
                            break;
                        }
                        let m_type = *meta.move_type();
                        if !damage_calc::is_immune(m_type, u_type1, u_type2, u_type3)
                            && damage_calc::type_effectiveness_shift(
                                m_type, u_type1, u_type2, u_type3,
                            ) > 0
                        {
                            shudder = true;
                            break;
                        }
                    }
                }
                if shudder {
                    break;
                }
            }
            if shudder {
                battle
                    .log
                    .push(crate::sim::log::BattleLogEvent::new(BattleLog::Ability {
                        target,
                        ability: "Anticipation".to_string(),
                        from_move: None,
                        of: None,
                    }));
            }
        }
    }
    if ability_id == "curiousmedicine" {
        let ally_ident = PokemonIdent {
            player: target.player,
            slot: 1 - target.slot,
        };
        if let Some(ally) = battle.get_pokemon_mut(ally_ident)
            && ally.hp.into_inner() > 0
        {
            ally.boosts = Boosts::default();
            battle.log.push(BattleLogEvent::new(BattleLog::Text {
                message: format!(
                    "|-clearboost|{}|[from] ability: Curious Medicine|[of] {}",
                    ally_ident, target
                ),
            }));
        }
    }
    if ability_id == "trace" {
        let foes = if target.player == 1 {
            &battle.p2.active
        } else {
            &battle.p1.active
        };
        let mut target_ability = None;
        let mut target_foe_ident = None;
        for (f_slot, foe) in foes.iter().enumerate() {
            if foe.hp.into_inner() > 0 && foe.ability.is_some() {
                target_ability = foe.ability.clone();
                target_foe_ident = Some(PokemonIdent {
                    player: if target.player == 1 { 2 } else { 1 },
                    slot: f_slot,
                });
                break;
            }
        }
        if let Some(ab) = target_ability
            && let Some(user) = battle.get_pokemon_mut(target)
        {
            user.ability = Some(ab.clone());
            let ab_name = crate::sim::abilities::get_ability(ab.as_str())
                .map(|c| c.name)
                .unwrap_or_else(|| ab.to_string());
            battle.log.push(BattleLogEvent::new(BattleLog::Ability {
                target,
                ability: ab_name,
                from_move: None,
                of: target_foe_ident,
            }));
        }
    }
}

pub fn on_modify_type(ability_id: &str, orig: Type) -> Option<Type> {
    match ability_id {
        "refrigerate" => {
            if orig == Type::Normal {
                Some(Type::Ice)
            } else {
                None
            }
        }
        "pixilate" => {
            if orig == Type::Normal {
                Some(Type::Fairy)
            } else {
                None
            }
        }
        "aerilate" => {
            if orig == Type::Normal {
                Some(Type::Flying)
            } else {
                None
            }
        }
        "galvanize" => {
            if orig == Type::Normal {
                Some(Type::Electric)
            } else {
                None
            }
        }
        "dragonize" => {
            if orig == Type::Normal {
                Some(Type::Dragon)
            } else {
                None
            }
        }
        "normalize" => {
            if orig != Type::Normal {
                Some(Type::Normal)
            } else {
                None
            }
        }
        _ => None,
    }
}
