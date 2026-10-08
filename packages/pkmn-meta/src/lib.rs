use deriving_via::DerivingVia;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(DerivingVia, PartialOrd, Ord)]
#[deriving(
    Eq,
    Debug,
    Display,
    Serialize,
    Deserialize,
    Arithmetic,
    IntoInner,
    Copy,
    Default,
    From
)]
pub struct Atk(i8);

#[derive(DerivingVia, PartialOrd, Ord)]
#[deriving(
    Eq,
    Debug,
    Display,
    Serialize,
    Deserialize,
    Arithmetic,
    IntoInner,
    Copy,
    Default,
    From
)]
pub struct Def(i8);

#[derive(DerivingVia, PartialOrd, Ord)]
#[deriving(
    Eq,
    Debug,
    Display,
    Serialize,
    Deserialize,
    Arithmetic,
    IntoInner,
    Copy,
    Default,
    From
)]
pub struct Spa(i8);

#[derive(DerivingVia, PartialOrd, Ord)]
#[deriving(
    Eq,
    Debug,
    Display,
    Serialize,
    Deserialize,
    Arithmetic,
    IntoInner,
    Copy,
    Default,
    From
)]
pub struct Apd(i8);

#[derive(DerivingVia, PartialOrd, Ord)]
#[deriving(
    Eq,
    Debug,
    Display,
    Serialize,
    Deserialize,
    Arithmetic,
    IntoInner,
    Copy,
    Default,
    From
)]
pub struct Spe(i8);

#[derive(DerivingVia, PartialOrd, Ord)]
#[deriving(
    Eq,
    Debug,
    Display,
    Serialize,
    Deserialize,
    Arithmetic,
    IntoInner,
    Copy,
    Default,
    From
)]
pub struct Accuracy(i8);

#[derive(DerivingVia, PartialOrd, Ord)]
#[deriving(
    Eq,
    Debug,
    Display,
    Serialize,
    Deserialize,
    Arithmetic,
    IntoInner,
    Copy,
    Default,
    From
)]
pub struct Evasion(i8);

#[derive(Serialize, Deserialize, Tsify, Clone, Debug, Default, PartialEq)]
pub struct Boosts {
    #[tsify(type = "number")]
    pub atk: Atk,
    #[tsify(type = "number")]
    pub def: Def,
    #[tsify(type = "number")]
    pub spa: Spa,
    #[tsify(type = "number")]
    pub spd: Apd,
    #[tsify(type = "number")]
    pub spe: Spe,
    #[serde(default)]
    #[tsify(type = "number")]
    pub accuracy: Accuracy,
    #[serde(default)]
    #[tsify(type = "number")]
    pub evasion: Evasion,
}

pub mod ability_meta;
pub mod item_meta;
pub mod mega_meta;
pub mod move_meta;
pub mod pokemon_meta;
pub mod regulation;
pub mod types;

pub use regulation::Regulation;
