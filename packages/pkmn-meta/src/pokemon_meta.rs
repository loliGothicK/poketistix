use derive_getters::Getters;
use typed_builder::TypedBuilder;

#[derive(Clone, Debug, PartialEq, TypedBuilder, Getters)]
pub struct PokemonMeta {
    base_stats: [u32; 6],
    type1: crate::types::Type,
    type2: Option<crate::types::Type>,
    weight: u32,
}

impl PokemonMeta {
    /// HP の Lv50 実数値を EV (0..=32) から計算。HP種族値 1 のポケモンは常に 1。
    pub fn calc_hp_lv50(&self, ev: u8) -> u16 {
        if self.base_stats[0] == 1 {
            1
        } else {
            (self.base_stats[0] + 75 + (ev as u32).min(32)) as u16
        }
    }

    /// 各ステータス (1: Atk, 2: Def, 3: SpA, 4: SpD, 5: Spe) の Lv50 実数値を EV と性格補正 (-1, 0, 1) から計算
    pub fn calc_stat_lv50(&self, stat_index: usize, ev: u8, nature_mod: i8) -> u16 {
        let base = self.base_stats[stat_index];
        let pre = (base + 20 + (ev as u32).min(32)) as i32;
        let val = if nature_mod > 0 {
            (pre * 11) / 10
        } else if nature_mod < 0 {
            (pre * 9) / 10
        } else {
            pre
        };
        val as u16
    }
}

/// 種族名からメタデータを検索し、Lv50 HP 実数値を算出する唯一の関数 (SoT)
pub fn calc_pokemon_hp_lv50(species: &str, ev: u8) -> Option<u16> {
    get_pokemon_meta(species).map(|m| m.calc_hp_lv50(ev))
}

/// 種族名からメタデータを検索し、Lv50 各能力実数値を算出する唯一の関数 (SoT)
pub fn calc_pokemon_stat_lv50(
    species: &str,
    stat_index: usize,
    ev: u8,
    nature_mod: i8,
) -> Option<u16> {
    get_pokemon_meta(species).map(|m| m.calc_stat_lv50(stat_index, ev, nature_mod))
}

data::generate_pokemon_meta!();
