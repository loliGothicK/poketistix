use crate::sim::battle::Battle;
use crate::sim::pokemon::Pokemon;
use crate::solver::belief::{BeliefState, PokemonBelief, calc_hp_lv50, calc_stat_lv50};
use crate::wasm_api::{InputPokemonData, build_pokemon};
use pkmn_meta::Regulation;
use pkmn_meta::types::{Category, Nature, PokemonEvs, Type};
use rand::RngExt;

/// Champions 形式 (各ステータス 0..=32, 合計 <= 66) の代表的な努力値・性格テンプレート
#[derive(Clone, Copy, Debug)]
pub struct ChampionsSpreadTemplate {
    pub evs: [u8; 6], // [hp, atk, def, spa, spd, spe]
    pub nature: Nature,
}

pub const STANDARD_CHAMPIONS_TEMPLATES: &[ChampionsSpreadTemplate] = &[
    // 1. 最速物理アタッカー (A32 S32+ H2)
    ChampionsSpreadTemplate {
        evs: [2, 32, 0, 0, 0, 32],
        nature: Nature::Jolly,
    },
    // 2. 準速火力物理アタッカー (A32+ S32 H2)
    ChampionsSpreadTemplate {
        evs: [2, 32, 0, 0, 0, 32],
        nature: Nature::Adamant,
    },
    // 3. 最速特殊アタッカー (C32 S32+ H2)
    ChampionsSpreadTemplate {
        evs: [2, 0, 0, 32, 0, 32],
        nature: Nature::Timid,
    },
    // 4. 準速火力特殊アタッカー (C32+ S32 H2)
    ChampionsSpreadTemplate {
        evs: [2, 0, 0, 32, 0, 32],
        nature: Nature::Modest,
    },
    // 5. HA 耐久物理アタッカー (H32 A32+ B2)
    ChampionsSpreadTemplate {
        evs: [32, 32, 2, 0, 0, 0],
        nature: Nature::Adamant,
    },
    // 6. HC 耐久特殊アタッカー (H32 C32+ B2)
    ChampionsSpreadTemplate {
        evs: [32, 0, 2, 32, 0, 0],
        nature: Nature::Modest,
    },
    // 7. トリル最遅物理アタッカー (H32 A32+ D2, Brave)
    ChampionsSpreadTemplate {
        evs: [32, 32, 0, 0, 2, 0],
        nature: Nature::Brave,
    },
    // 8. トリル最遅特殊アタッカー (H32 C32+ B2, Quiet)
    ChampionsSpreadTemplate {
        evs: [32, 0, 2, 32, 0, 0],
        nature: Nature::Quiet,
    },
    // 9. HB 物理受けサポート (H32 B32+ D2)
    ChampionsSpreadTemplate {
        evs: [32, 0, 32, 0, 2, 0],
        nature: Nature::Bold,
    },
    // 10. HD 特殊受けサポート (H32 D32+ B2)
    ChampionsSpreadTemplate {
        evs: [32, 0, 2, 0, 32, 0],
        nature: Nature::Calm,
    },
    // 11. バランス耐久サポート (H32 B17 D17+)
    ChampionsSpreadTemplate {
        evs: [32, 0, 17, 0, 17, 0],
        nature: Nature::Careful,
    },
];

/// 未判明情報（技・持ち物・配分・選出）の事前分布（Prior）を提供するトレイト
/// 将来的に環境統計データや DB 集計を差し込めるよう抽象化
pub trait PriorProvider {
    /// 候補技の採用重みを返す（大きいほど優先的にサンプリングされる）
    fn move_weight(&self, species: &str, move_id: &str, is_physical_biased: bool) -> f64;
    /// 候補持ち物のリストを返す
    fn candidate_items(&self, species: &str, is_physical_biased: bool) -> Vec<&'static str>;
}

/// エンジン内蔵のデフォルト Champions Prior（種族値・一致技・VGC必須技に基づくヒューリスティック）
#[derive(Clone, Debug, Default)]
pub struct DefaultChampionsPrior;

impl PriorProvider for DefaultChampionsPrior {
    fn move_weight(&self, species: &str, move_id: &str, is_physical_biased: bool) -> f64 {
        let Some(meta) = pkmn_meta::move_meta::get_move_meta(move_id) else {
            return 0.1;
        };

        // VGC で採用率が非常に高い防御・補助・S操作・先制技
        match move_id {
            "protect" | "spikyshield" | "detect" | "kingsshield" | "banefulbunker" => return 35.0,
            "fakeout" | "followme" | "ragepowder" | "spore" | "tailwind" | "trickroom" => {
                return 32.0;
            }
            "partingshot" | "uturn" | "voltswitch" | "icywind" | "electroweb" | "snarl"
            | "taunt" | "willowisp" | "encore" | "helpinghand" | "wideguard" => return 22.0,
            _ => {}
        }

        if *meta.category() == Category::Status {
            return 4.0;
        }

        let is_phys = *meta.category() == Category::Physical;
        let stat_match = if is_phys == is_physical_biased {
            2.0
        } else {
            0.4
        };

        let stab = if let Some(pmeta) = pkmn_meta::pokemon_meta::get_pokemon_meta(species) {
            if pmeta.type1() == meta.move_type() || pmeta.type2().as_ref() == Some(meta.move_type())
            {
                1.8
            } else {
                1.0
            }
        } else {
            1.0
        };

        let bp = (*meta.base_power() as f64).clamp(40.0, 130.0);
        let prio_bonus = if *meta.priority() > 0 { 1.5 } else { 1.0 };

        (bp * 0.15) * stat_match * stab * prio_bonus
    }

    fn candidate_items(&self, _species: &str, is_physical_biased: bool) -> Vec<&'static str> {
        if is_physical_biased {
            vec![
                "sitrus-berry",
                "focus-sash",
                "life-orb",
                "choice-scarf",
                "lum-berry",
                "leftovers",
                "rocky-helmet",
            ]
        } else {
            vec![
                "sitrus-berry",
                "focus-sash",
                "life-orb",
                "choice-scarf",
                "leftovers",
                "rocky-helmet",
                "wise-glasses",
            ]
        }
    }
}

/// `BeliefState`（不完全情報の情報集合）から矛盾のない完全情報 `Battle` を確定化サンプリングする器
pub struct Determinizer<P: PriorProvider = DefaultChampionsPrior> {
    pub prior: P,
}

impl Default for Determinizer<DefaultChampionsPrior> {
    fn default() -> Self {
        Self {
            prior: DefaultChampionsPrior,
        }
    }
}

impl<P: PriorProvider> Determinizer<P> {
    pub fn new(prior: P) -> Self {
        Self { prior }
    }

    /// `BeliefState` の全制約を満たす具体的な `Battle` インスタンスを1つサンプリングする
    pub fn sample_battle(&self, belief: &BeliefState, rng: &mut impl rand::Rng) -> Battle {
        let mut battle = belief.base_battle.clone();
        battle.p2.active.clear();
        battle.p2.team.clear();

        // 1. P2 のアクティブ 2枠を確定化サンプリング
        for slot in 0..2 {
            if let Some(b_idx) = belief.p2_active_indices[slot] {
                let pb = &belief.opponent_beliefs[b_idx];
                let ident = if slot == 0 { "p2a" } else { "p2b" };
                let pkmn = self.sample_pokemon(ident, pb, belief.regulation, rng);
                battle.p2.active.push(pkmn);
            }
        }

        // 2. 既に場に出て控えに下がっている P2 ポケモンを `p2.team` に追加
        let mut bench_counter = 1;
        for (idx, pb) in belief.opponent_beliefs.iter().enumerate() {
            let is_active = belief.p2_active_indices[0] == Some(idx)
                || belief.p2_active_indices[1] == Some(idx);
            if pb.revealed_in_battle && !is_active {
                let ident = format!("p2bench{}", bench_counter);
                bench_counter += 1;
                let pkmn = self.sample_pokemon(&ident, pb, belief.regulation, rng);
                battle.p2.team.push(pkmn);
            }
        }

        // 3. まだ割れていない控え枠 (最大合計4匹選出) を未登場の見せ合いポケモンからサンプリング
        let revealed_count = belief
            .opponent_beliefs
            .iter()
            .filter(|b| b.revealed_in_battle)
            .count();
        let needed_unrevealed = 4usize.saturating_sub(revealed_count);

        if needed_unrevealed > 0 {
            let mut unrevealed_indices: Vec<usize> = belief
                .opponent_beliefs
                .iter()
                .enumerate()
                .filter(|(_, b)| !b.revealed_in_battle)
                .map(|(i, _)| i)
                .collect();

            // Fisher-Yates 風にランダム抽出
            let pick_count = needed_unrevealed.min(unrevealed_indices.len());
            for i in 0..pick_count {
                let swap_idx = rng.random_range(i..unrevealed_indices.len());
                unrevealed_indices.swap(i, swap_idx);
                let chosen_b_idx = unrevealed_indices[i];
                let pb = &belief.opponent_beliefs[chosen_b_idx];
                let ident = format!("p2bench{}", bench_counter);
                bench_counter += 1;
                let pkmn = self.sample_pokemon(&ident, pb, belief.regulation, rng);
                battle.p2.team.push(pkmn);
            }
        }

        battle
    }

    /// 1匹の `PokemonBelief` から制約を満たす完全な `Pokemon` をサンプリング
    pub fn sample_pokemon(
        &self,
        ident: &str,
        pb: &PokemonBelief,
        reg: Regulation,
        rng: &mut impl rand::Rng,
    ) -> Pokemon {
        let meta_opt = pkmn_meta::pokemon_meta::get_pokemon_meta(&pb.species);
        let base_stats = meta_opt
            .as_ref()
            .map(|m| *m.base_stats())
            .unwrap_or([80, 80, 80, 80, 80, 80]);
        let is_physical_biased = base_stats[1] >= base_stats[3];

        // 1. 実数値・EV・性格のサンプリング（Belief の実数値レンジ制約を満たすもの）
        let (stats, evs, nature) = self.sample_stats_within_bounds(pb, &base_stats, rng);

        let max_hp = stats[0] as i32;
        let cur_hp = if pb.hp_percent == 0 {
            0
        } else if pb.hp_percent >= 100 {
            max_hp
        } else {
            ((max_hp * pb.hp_percent as i32) / 100).max(1)
        };

        // 2. 特性のサンプリング
        let ability = if let Some(ref ab) = pb.known_ability {
            Some(ab.clone())
        } else if !pb.candidate_abilities.is_empty() {
            let idx = rng.random_range(0..pb.candidate_abilities.len());
            Some(pb.candidate_abilities[idx].clone())
        } else {
            None
        };

        // 3. 持ち物のサンプリング
        let item = if pb.item_consumed {
            None
        } else if let Some(ref it) = pb.known_item {
            Some(it.clone())
        } else {
            let candidates: Vec<&'static str> = self
                .prior
                .candidate_items(&pb.species, is_physical_biased)
                .into_iter()
                .filter(|&it| !pb.is_item_excluded(it))
                .collect();
            if candidates.is_empty() {
                None
            } else {
                let idx = rng.random_range(0..candidates.len());
                Some(candidates[idx].to_string())
            }
        };

        // 4. 技4つのサンプリング（既知技 + レギュレーション合法プールから重み付き抽出）
        let moves = self.sample_moves(pb, reg, is_physical_biased, rng);

        let type1 = meta_opt
            .as_ref()
            .map(|m| format!("{:?}", m.type1()))
            .unwrap_or_else(|| "Normal".to_string());
        let type2 = meta_opt
            .as_ref()
            .and_then(|m| m.type2().map(|t| format!("{:?}", t)));

        build_pokemon(&InputPokemonData {
            ident: ident.to_string(),
            species: pb.species.clone(),
            hp: cur_hp,
            maxhp: max_hp,
            attack: stats[1] as i32,
            defense: stats[2] as i32,
            sp_attack: stats[3] as i32,
            sp_defense: stats[4] as i32,
            speed: stats[5] as i32,
            item,
            ability,
            status: pb.status.clone(),
            type1,
            type2,
            boosts: pb.boosts.clone(),
            volatile_status: pb.volatile_status.clone(),
            moves,
            is_mega: pb.is_mega,
            evs: Some(evs),
            nature: Some(nature),
            ..Default::default()
        })
    }

    fn sample_stats_within_bounds<R: rand::Rng + ?Sized>(
        &self,
        pb: &PokemonBelief,
        base_stats: &[u32; 6],
        rng: &mut R,
    ) -> ([u16; 6], PokemonEvs, Nature) {
        let mut matching_templates = Vec::new();

        for tpl in STANDARD_CHAMPIONS_TEMPLATES {
            let (buff, nerf) = tpl.nature.modifiers();
            let nmod = |stat_idx: u8| -> i8 {
                if buff == stat_idx {
                    1
                } else if nerf == stat_idx {
                    -1
                } else {
                    0
                }
            };
            let hp = calc_hp_lv50(&pb.species, base_stats[0], tpl.evs[0]);
            let atk = calc_stat_lv50(base_stats[1], tpl.evs[1], nmod(1));
            let def = calc_stat_lv50(base_stats[2], tpl.evs[2], nmod(2));
            let spa = calc_stat_lv50(base_stats[3], tpl.evs[3], nmod(3));
            let spd = calc_stat_lv50(base_stats[4], tpl.evs[4], nmod(4));
            let spe = calc_stat_lv50(base_stats[5], tpl.evs[5], nmod(5));

            if hp >= pb.hp_stat_range.0
                && hp <= pb.hp_stat_range.1
                && atk >= pb.atk_stat_range.0
                && atk <= pb.atk_stat_range.1
                && def >= pb.def_stat_range.0
                && def <= pb.def_stat_range.1
                && spa >= pb.spa_stat_range.0
                && spa <= pb.spa_stat_range.1
                && spd >= pb.spd_stat_range.0
                && spd <= pb.spd_stat_range.1
                && spe >= pb.spe_stat_range.0
                && spe <= pb.spe_stat_range.1
            {
                matching_templates.push(([hp, atk, def, spa, spd, spe], tpl));
            }
        }

        if !matching_templates.is_empty() {
            let idx = rng.random_range(0..matching_templates.len());
            let (stats, tpl) = matching_templates[idx];
            let evs = PokemonEvs {
                hp: Some(tpl.evs[0]),
                atk: Some(tpl.evs[1]),
                def: Some(tpl.evs[2]),
                spa: Some(tpl.evs[3]),
                spd: Some(tpl.evs[4]),
                spe: Some(tpl.evs[5]),
            };
            return (stats, evs, tpl.nature);
        }

        // テンプレートに該当しない細かく調整された配分の場合、各ステータスのレンジ内からランダム選択
        let sample_in = |range: (u16, u16), r: &mut R| -> u16 {
            if range.0 >= range.1 {
                range.0
            } else {
                r.random_range(range.0..=range.1)
            }
        };
        let hp_ev = if pb.hp_ev_range.0 >= pb.hp_ev_range.1 {
            pb.hp_ev_range.0
        } else {
            rng.random_range(pb.hp_ev_range.0..=pb.hp_ev_range.1)
        };
        let hp = calc_hp_lv50(&pb.species, base_stats[0], hp_ev);
        let atk = sample_in(pb.atk_stat_range, rng);
        let def = sample_in(pb.def_stat_range, rng);
        let spa = sample_in(pb.spa_stat_range, rng);
        let spd = sample_in(pb.spd_stat_range, rng);
        let spe = sample_in(pb.spe_stat_range, rng);

        (
            [hp, atk, def, spa, spd, spe],
            PokemonEvs {
                hp: Some(hp_ev),
                atk: Some(16),
                def: Some(8),
                spa: Some(8),
                spd: Some(8),
                spe: Some(16),
            },
            Nature::Hardy,
        )
    }

    fn sample_moves(
        &self,
        pb: &PokemonBelief,
        reg: Regulation,
        is_physical_biased: bool,
        rng: &mut impl rand::Rng,
    ) -> Vec<String> {
        let mut moves = pb.known_moves.clone();
        if moves.len() >= 4 {
            moves.truncate(4);
            return moves;
        }

        let legal_pool = pkmn_meta::regulation::get_pokemon_move_slugs(&pb.species, reg)
            .or_else(|| pkmn_meta::regulation::get_pokemon_move_slugs(&pb.base_species, reg))
            .unwrap_or_default();

        let mut weighted_candidates: Vec<(&'static str, f64)> = legal_pool
            .into_iter()
            .filter(|&m| {
                !moves.iter().any(|km| km == m) && !pb.excluded_moves.iter().any(|em| em == m)
            })
            .map(|m| {
                let w = self.prior.move_weight(&pb.species, m, is_physical_biased);
                (m, w.max(0.01))
            })
            .collect();

        // 上位候補から重み付きルーレット選択で残り枠（最大4つまで）を埋める
        weighted_candidates
            .sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        weighted_candidates.truncate(12); // 上位12個の有力技に絞ってノイズを防ぐ

        while moves.len() < 4 && !weighted_candidates.is_empty() {
            let total_w: f64 = weighted_candidates.iter().map(|(_, w)| *w).sum();
            let mut r = rng.random_range(0.0..total_w);
            let mut chosen_idx = 0;
            for (i, &(_, w)) in weighted_candidates.iter().enumerate() {
                r -= w;
                if r <= 0.0 {
                    chosen_idx = i;
                    break;
                }
            }
            let (chosen_move, _) = weighted_candidates.remove(chosen_idx);
            moves.push(chosen_move.to_string());
        }

        // 万が一4つ未満でも空でなければOK
        let _ = Type::Normal;
        moves
    }
}
