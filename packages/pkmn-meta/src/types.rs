use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

/// Pokémon type enumeration.
///
/// `Stellar` is included for parity with modern generations but is treated as
/// neutral in the built-in type chart.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Type {
    Normal,
    Fire,
    Water,
    Electric,
    Grass,
    Ice,
    Fighting,
    Poison,
    Ground,
    Flying,
    Psychic,
    Bug,
    Rock,
    Ghost,
    Dragon,
    Dark,
    Steel,
    Fairy,
    Stellar,
    #[serde(rename = "???")]
    Typeless,
}

#[wasm_bindgen]
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    strum_macros::EnumString,
    strum_macros::AsRefStr,
    strum_macros::Display,
)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum Weather {
    HashSunlight,
    Rain,
    Sandstorm,
    Snow,
    ExtremelyHarshSunlight,
    HeavyRain,
    StrongWinds,
}

#[wasm_bindgen]
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    strum_macros::EnumString,
    strum_macros::AsRefStr,
    strum_macros::Display,
)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum Terrain {
    Electric,
    Grassy,
    Misty,
    Psychic,
}

#[wasm_bindgen]
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    strum_macros::EnumString,
    strum_macros::AsRefStr,
    strum_macros::Display,
)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum VolatileStatus {
    Partiallytrapped,
    Flinch,
    Confusion,
    Disable,
    Leechseed,
    Minimize,
    Focusenergy,
    Substitute,
    Curse,
    Protect,
    Destinybond,
    Endure,
    Attract,
    Encore,
    Stockpile,
    Torment,
    Followme,
    Charge,
    Taunt,
    Helpinghand,
    Ingrain,
    Yawn,
    Imprison,
    Snatch,
    Powertrick,
    Gastroacid,
    Aquaring,
    Magnetrise,
    Ragepowder,
    Telekinesis,
    Smackdown,
    Electrify,
    Kingsshield,
    Spikyshield,
    Banefulbunker,
    Sparklingaria,
    Laserfocus,
    Noretreat,
    Powershift,
    Saltcure,
    Mustrecharge,
    Twoturnmove,
    Dive,
    Dig,
    Fly,
    Bounce,
    Phantomforce,
    Shadowforce,
    Skyattack,
    Solarbeam,
    Solarblade,
    Razorwind,
    Skullbash,
    Meteorbeam,
    Electroshot,
    Geomancy,
    Syrupbomb,
    Flashfire,
    Roost,
    Dragoncheer,
    Healblock,
    Beakblast,
    Throatchop,
    Octolock,
    Perishsong,
}

#[wasm_bindgen]
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    strum_macros::EnumString,
    strum_macros::AsRefStr,
    strum_macros::Display,
)]
pub enum Status {
    #[serde(rename = "brn")]
    #[strum(to_string = "brn")]
    Burn,
    #[serde(rename = "frz")]
    #[strum(to_string = "frz")]
    Frozen,
    #[serde(rename = "par")]
    #[strum(to_string = "par")]
    Paralysis,
    #[serde(rename = "slp")]
    #[strum(to_string = "slp")]
    Sleep,
    #[serde(rename = "psn")]
    #[strum(to_string = "psn")]
    Poison,
    #[serde(rename = "tox")]
    #[strum(to_string = "tox")]
    Toxic,
}

#[wasm_bindgen]
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    strum_macros::EnumString,
    strum_macros::AsRefStr,
    strum_macros::Display,
)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum Category {
    Physical,
    Status,
    Special,
}

#[wasm_bindgen]
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    strum_macros::EnumString,
    strum_macros::AsRefStr,
    strum_macros::Display,
)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum Range {
    SingleTarget,
    #[serde(rename = "self")]
    #[strum(serialize = "self")]
    Self_,
    RandomOpponent,
    #[serde(rename = "user's-side")]
    #[strum(serialize = "user's-side")]
    UserSSide,
    AllPokemon,
    AllAllies,
    Varies,
    EntireField,
    AllOpponents,
    #[serde(rename = "opponent's-side")]
    #[strum(serialize = "opponent's-side")]
    OpponentSSide,
    SingleAlly,
}

#[wasm_bindgen]
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    strum_macros::EnumString,
    strum_macros::AsRefStr,
    strum_macros::Display,
)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum ItemId {
    Abomasite,
    Absolite,
    AbsoliteZ,
    Aerodactylite,
    Aggronite,
    AirBalloon,
    Alakazite,
    Altarianite,
    Ampharosite,
    AspearBerry,
    Audinite,
    BabiriBerry,
    Banettite,
    Barbaracite,
    Baxcalibrite,
    Beedrillite,
    BigRoot,
    BindingBand,
    BlackBelt,
    BlackGlasses,
    Blastoisinite,
    Blazikenite,
    BrightPowder,
    Cameruptite,
    Chandelurite,
    Charcoal,
    CharizarditeX,
    CharizarditeY,
    ChartiBerry,
    CheriBerry,
    Chesnaughtite,
    ChestoBerry,
    ChilanBerry,
    Chimechite,
    ChoiceScarf,
    ChopleBerry,
    Clefablite,
    CobaBerry,
    ColburBerry,
    Crabominite,
    DampRock,
    Delphoxite,
    Dragalgite,
    DragonFang,
    Dragoninite,
    Drampanite,
    Eelektrossite,
    EjectButton,
    ElectricSeed,
    Emboarite,
    Excadrite,
    ExpertBelt,
    FairyFeather,
    Falinksite,
    Feraligite,
    Floettite,
    FocusBand,
    FocusSash,
    Froslassite,
    Galladite,
    Garchompite,
    GarchompiteZ,
    Gardevoirite,
    Gengarite,
    Glalitite,
    Glimmoranite,
    Golurkite,
    Golisopite,
    Greninjite,
    GrassySeed,
    Gyaradosite,
    HabanBerry,
    HardStone,
    Hawluchanite,
    HeatRock,
    Heracronite,
    Houndoominite,
    IcyRock,
    IronBall,
    Kangaskhanite,
    KasibBerry,
    KebiaBerry,
    KingsRock,
    Leftovers,
    Leek,
    LeppaBerry,
    LifeOrb,
    LightBall,
    LightClay,
    Lopunnite,
    Lucarionite,
    LucarioniteZ,
    LumBerry,
    Magnet,
    Malamarite,
    Manectite,
    Mawilite,
    Medichamite,
    Meganiumite,
    MentalHerb,
    Meowsticite,
    Metagrossite,
    MetalCoat,
    Metronome,
    MiracleSeed,
    MistySeed,
    MuscleBand,
    MysticWater,
    NeverMeltIce,
    NormalGem,
    OccaBerry,
    OranBerry,
    PasshoBerry,
    PayapaBerry,
    PechaBerry,
    PersimBerry,
    Pidgeotite,
    Pinsirite,
    PoisonBarb,
    PsychicSeed,
    Pyroarite,
    QuickClaw,
    RaichuniteX,
    RaichuniteY,
    RedCard,
    RawstBerry,
    RindoBerry,
    RoseliBerry,
    RockyHelmet,
    Sablenite,
    Salamencite,
    Sceptilite,
    Scizorite,
    Scolipite,
    ScopeLens,
    Scovillainite,
    Scraftinite,
    SharpBeak,
    Sharpedonite,
    ShedShell,
    ShellBell,
    ShucaBerry,
    SilkScarf,
    SilverPowder,
    SitrusBerry,
    Skarmorite,
    Slowbronite,
    SmoothRock,
    SoftSand,
    SpellTag,
    Staraptite,
    Starminite,
    Steelixite,
    Swampertite,
    TangaBerry,
    TerrainExtender,
    TwistedSpoon,
    Tyranitarite,
    Venusaurite,
    Victreebelite,
    WacanBerry,
    WhiteHerb,
    WideLens,
    WiseGlasses,
    YacheBerry,
    ZoomLens,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Tsify, Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Nature {
    #[default]
    Hardy,
    Lonely,
    Brave,
    Adamant,
    Naughty,
    Bold,
    Docile,
    Relaxed,
    Impish,
    Lax,
    Timid,
    Hasty,
    Serious,
    Jolly,
    Naive,
    Modest,
    Mild,
    Quiet,
    Bashful,
    Rash,
    Calm,
    Gentle,
    Sassy,
    Careful,
    Quirky,
}

impl Nature {
    pub fn modifiers(&self) -> (u8, u8) {
        match self {
            Nature::Lonely => (1, 2),
            Nature::Brave => (1, 5),
            Nature::Adamant => (1, 3),
            Nature::Naughty => (1, 4),
            Nature::Bold => (2, 1),
            Nature::Relaxed => (2, 5),
            Nature::Impish => (2, 3),
            Nature::Lax => (2, 4),
            Nature::Timid => (5, 1),
            Nature::Hasty => (5, 2),
            Nature::Jolly => (5, 3),
            Nature::Naive => (5, 4),
            Nature::Modest => (3, 1),
            Nature::Mild => (3, 2),
            Nature::Quiet => (3, 5),
            Nature::Rash => (3, 4),
            Nature::Calm => (4, 1),
            Nature::Gentle => (4, 2),
            Nature::Sassy => (4, 5),
            Nature::Careful => (4, 3),
            Nature::Hardy | Nature::Docile | Nature::Serious | Nature::Bashful | Nature::Quirky => {
                (0, 0)
            }
        }
    }
}

#[derive(Serialize, Deserialize, Tsify, Default, Clone, Copy, Debug, PartialEq, Eq)]
pub struct PokemonEvs {
    #[serde(default)]
    pub hp: Option<u8>,
    #[serde(default)]
    pub atk: Option<u8>,
    #[serde(default)]
    pub def: Option<u8>,
    #[serde(default)]
    pub spa: Option<u8>,
    #[serde(default)]
    pub spd: Option<u8>,
    #[serde(default)]
    pub spe: Option<u8>,
}
