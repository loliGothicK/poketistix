extern crate proc_macro;

use proc_macro::TokenStream;
use quote::quote;
use serde_json::Value;

fn to_pascal(s: &str) -> String {
    let mut out = String::new();
    let mut capitalize_next = true;
    for c in s.chars() {
        if c == '-' || c == '\'' || c == '_' {
            capitalize_next = true;
        } else if capitalize_next {
            out.push(c.to_ascii_uppercase());
            capitalize_next = false;
        } else {
            out.push(c.to_ascii_lowercase());
        }
    }
    if out == "Self" {
        out = "Self_".to_string();
    }
    out
}

fn to_status(s: &str) -> String {
    match s {
        "brn" => "Burn".to_string(),
        "frz" => "Frozen".to_string(),
        "par" => "Paralysis".to_string(),
        "slp" => "Sleep".to_string(),
        "psn" => "Poison".to_string(),
        "tox" => "Toxic".to_string(),
        unknown => panic!("Unknown status: {unknown}"),
    }
}

#[proc_macro]
pub fn generate_move_meta(_item: TokenStream) -> TokenStream {
    let moves_str = include_str!("../champions/moves.json");
    let moves_json: Value = serde_json::from_str(moves_str).expect("Failed to parse moves.json");

    let mut arms = Vec::new();

    if let Some(arr) = moves_json["data"].as_array() {
        for m in arr {
            let id = m["identifier"].as_str().unwrap().replace("-", "");
            let power = m["power"].as_u64().unwrap_or(0) as u32;
            let pp = m["pp"].as_u64().unwrap_or(0) as u8;
            let ty_str = m["type"].as_str().unwrap();
            let ty_ident = syn::Ident::new(ty_str, proc_macro2::Span::call_site());

            let cat = m["category"].as_str().unwrap();
            let cat_ident = syn::Ident::new(&to_pascal(cat), proc_macro2::Span::call_site());
            let cat_cap = quote! { crate::types::Category::#cat_ident };

            let priority = m["priority"].as_i64().unwrap_or(0) as i32;
            let range = m["range"].as_str().unwrap_or("single-target");
            let range_ident = syn::Ident::new(&to_pascal(range), proc_macro2::Span::call_site());
            let range_cap = quote! { crate::types::Range::#range_ident };

            let acc = match m["accuracy"].as_u64() {
                Some(v) => {
                    let v = v as i32;
                    quote! { Some(#v) }
                }
                None => quote! { None },
            };

            let flags_protect = m["flags_protect"].as_bool().unwrap_or(false);
            let flags_contact = m["flags_contact"].as_bool().unwrap_or(false);
            let flags_charge = m["flags_charge"].as_bool().unwrap_or(false);
            let flags_recharge = m["flags_recharge"].as_bool().unwrap_or(false);

            let mut is_punch = false;
            let mut is_bite = false;
            let mut is_sound = false;
            let mut is_slicing = false;
            let mut is_wind = false;
            let mut is_powder = false;
            let mut is_ball = false;

            if let Some(arr) = m["classifications"].as_array() {
                for c in arr {
                    if let Some(s) = c.as_str() {
                        match s {
                            "punch" => is_punch = true,
                            "biting" => is_bite = true,
                            "sound-based" => is_sound = true,
                            "slicing" => is_slicing = true,
                            "wind" => is_wind = true,
                            "powder" => is_powder = true,
                            "ball-and-bomb" => is_ball = true,
                            _ => {}
                        }
                    }
                }
            }

            let recoil = if let Some(arr) = m["recoil"].as_array() {
                let num = arr[0].as_u64().unwrap_or(0) as i32;
                let den = arr[1].as_u64().unwrap_or(1) as i32;
                quote! { Some((#num, #den)) }
            } else {
                quote! { None }
            };

            let drain = if let Some(arr) = m["drain"].as_array() {
                let num = arr[0].as_u64().unwrap_or(0) as i32;
                let den = arr[1].as_u64().unwrap_or(1) as i32;
                quote! { Some((#num, #den)) }
            } else {
                quote! { None }
            };

            let multihit = if let Some(arr) = m["multihit"].as_array() {
                let min = arr[0].as_u64().unwrap_or(0) as i32;
                let max = arr[1].as_u64().unwrap_or(0) as i32;
                quote! { Some((#min, #max)) }
            } else if let Some(val) = m["multihit"].as_u64() {
                let hits = val as i32;
                quote! { Some((#hits, #hits)) }
            } else {
                quote! { None }
            };

            let volatile_status = match m["volatile_status"].as_str() {
                Some(s) => {
                    let ident = syn::Ident::new(&to_pascal(s), proc_macro2::Span::call_site());
                    quote! { Some(crate::types::VolatileStatus::#ident) }
                }
                None => quote! { None },
            };

            let status = match m["status"].as_str() {
                Some(s) => {
                    let ident = syn::Ident::new(&to_status(s), proc_macro2::Span::call_site());
                    quote! { Some(crate::types::Status::#ident) }
                }
                None => quote! { None },
            };

            let secondary = if let Some(sec) = m.get("secondary") {
                let chance = sec.get("chance").and_then(|v| v.as_u64()).unwrap_or(100) as u32;

                let v_status = match sec.get("volatile_status").and_then(|v| v.as_str()) {
                    Some(s) => {
                        let ident = syn::Ident::new(&to_pascal(s), proc_macro2::Span::call_site());
                        quote! { Some(crate::types::VolatileStatus::#ident) }
                    }
                    None => quote! { None },
                };
                let status = match sec.get("status").and_then(|v| v.as_str()) {
                    Some(s) => {
                        let ident = syn::Ident::new(&to_status(s), proc_macro2::Span::call_site());
                        quote! { Some(crate::types::Status::#ident) }
                    }
                    None => quote! { None },
                };

                let boosts = if let Some(boosts) = sec.get("boosts") {
                    let atk = boosts.get("atk").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let def = boosts.get("def").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let spa = boosts.get("spa").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let spd = boosts.get("spd").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let spe = boosts.get("spe").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let accuracy =
                        boosts.get("accuracy").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let evasion = boosts.get("evasion").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    quote! {
                        Some(crate::Boosts {
                            atk: (#atk).into(),
                            def: (#def).into(),
                            spa: (#spa).into(),
                            spd: (#spd).into(),
                            spe: (#spe).into(),
                            accuracy: (#accuracy).into(),
                            evasion: (#evasion).into(),
                        })
                    }
                } else {
                    quote! { None }
                };

                quote! {
                    Some(crate::move_meta::SecondaryEffect {
                        chance: #chance,
                        volatile_status: #v_status,
                        status: #status,
                        boosts: #boosts,
                    })
                }
            } else {
                quote! { None }
            };

            let self_effect = if let Some(se) = m.get("self_effect") {
                let boosts = if let Some(boosts) = se.get("boosts") {
                    let atk = boosts.get("atk").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let def = boosts.get("def").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let spa = boosts.get("spa").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let spd = boosts.get("spd").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let spe = boosts.get("spe").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let accuracy =
                        boosts.get("accuracy").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    let evasion = boosts.get("evasion").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                    quote! {
                        Some(crate::Boosts {
                            atk: (#atk).into(),
                            def: (#def).into(),
                            spa: (#spa).into(),
                            spd: (#spd).into(),
                            spe: (#spe).into(),
                            accuracy: (#accuracy).into(),
                            evasion: (#evasion).into(),
                        })
                    }
                } else {
                    quote! { None }
                };

                quote! {
                    Some(crate::move_meta::SelfEffect {
                        boosts: #boosts,
                    })
                }
            } else {
                quote! { None }
            };

            let boosts = if let Some(boosts) = m.get("boosts") {
                let atk = boosts.get("atk").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let def = boosts.get("def").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let spa = boosts.get("spa").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let spd = boosts.get("spd").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let spe = boosts.get("spe").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let accuracy = boosts.get("accuracy").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let evasion = boosts.get("evasion").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                quote! {
                    Some(crate::Boosts {
                        atk: (#atk).into(),
                        def: (#def).into(),
                        spa: (#spa).into(),
                        spd: (#spd).into(),
                        spe: (#spe).into(),
                        accuracy: (#accuracy).into(),
                        evasion: (#evasion).into(),
                    })
                }
            } else {
                quote! { None }
            };

            arms.push(quote! {
                #id => Some(crate::move_meta::MoveMeta::builder()
                    .base_power(#power)
                    .pp(#pp)
                    .move_type(crate::types::Type::#ty_ident)
                    .category(#cat_cap)
                    .priority(#priority)
                    .range(#range_cap)
                    .accuracy(#acc)
                    .flags_protect(#flags_protect)
                    .flags_contact(#flags_contact)
                    .flags_charge(#flags_charge)
                    .flags_recharge(#flags_recharge)
                    .is_punch(#is_punch)
                    .is_bite(#is_bite)
                    .is_sound(#is_sound)
                    .is_slicing(#is_slicing)
                    .is_wind(#is_wind)
                    .is_powder(#is_powder)
                    .is_ball(#is_ball)
                    .recoil(#recoil)
                    .drain(#drain)
                    .multihit(#multihit)
                    .status(#status)
                    .volatile_status(#volatile_status)
                    .boosts(#boosts)
                    .secondary(#secondary)
                    .self_effect(#self_effect)
                    .build()),
            });
        }
    }

    let expanded = quote! {
        pub fn get_move_meta(id: &str) -> Option<MoveMeta> {
            let id = id.replace("-", "");
            match id.as_str() {
                #(#arms)*
                _ => None,
            }
        }
    };

    TokenStream::from(expanded)
}
#[proc_macro]
pub fn generate_ability_meta(_item: TokenStream) -> TokenStream {
    let abilities_str = include_str!("../champions/abilities.json");
    let abilities_json: Value =
        serde_json::from_str(abilities_str).expect("Failed to parse abilities.json");

    let mut arms = Vec::new();

    if let Some(arr) = abilities_json["data"].as_array() {
        for a in arr {
            let id = a["identifier"].as_str().unwrap().replace("-", "");

            let on_start_weather = match a.get("on_start_weather").and_then(|v| v.as_str()) {
                Some("RainDance") | Some("Rain") => quote! { Some(crate::types::Weather::Rain) },
                Some("SunnyDay") | Some("Sun") => {
                    quote! { Some(crate::types::Weather::HashSunlight) }
                }
                Some("DesolateLand") | Some("HarshSunlight") => {
                    quote! { Some(crate::types::Weather::ExtremelyHarshSunlight) }
                }
                Some("PrimordialSea") | Some("HeavyRain") => {
                    quote! { Some(crate::types::Weather::HeavyRain) }
                }
                Some("DeltaStream") | Some("StrongWinds") => {
                    quote! { Some(crate::types::Weather::StrongWinds) }
                }
                Some("Sandstorm") => quote! { Some(crate::types::Weather::Sandstorm) },
                Some("Snow") | Some("Hail") => quote! { Some(crate::types::Weather::Snow) },
                Some(s) => panic!("Unknown weather: {}", s),
                None => quote! { None },
            };

            let on_start_terrain = match a.get("on_start_terrain").and_then(|v| v.as_str()) {
                Some("ElectricTerrain") | Some("Electric") => {
                    quote! { Some(crate::types::Terrain::Electric) }
                }
                Some("GrassyTerrain") | Some("Grassy") => {
                    quote! { Some(crate::types::Terrain::Grassy) }
                }
                Some("MistyTerrain") | Some("Misty") => {
                    quote! { Some(crate::types::Terrain::Misty) }
                }
                Some("PsychicTerrain") | Some("Psychic") => {
                    quote! { Some(crate::types::Terrain::Psychic) }
                }
                Some(s) => panic!("Unknown terrain: {}", s),
                None => quote! { None },
            };

            let on_start_stat_drop_foe = if let Some(boosts) = a.get("on_start_stat_drop_foe") {
                let atk = boosts.get("atk").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let def = boosts.get("def").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let spa = boosts.get("spa").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let spd = boosts.get("spd").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let spe = boosts.get("spe").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let accuracy = boosts.get("accuracy").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let evasion = boosts.get("evasion").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                quote! {
                    Some(crate::Boosts {
                        atk: (#atk).into(),
                        def: (#def).into(),
                        spa: (#spa).into(),
                        spd: (#spd).into(),
                        spe: (#spe).into(),
                        accuracy: (#accuracy).into(),
                        evasion: (#evasion).into()
                    })
                }
            } else {
                quote! { None }
            };

            let on_start_stat_boost_self = if let Some(boosts) = a.get("on_start_stat_boost_self") {
                let atk = boosts.get("atk").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let def = boosts.get("def").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let spa = boosts.get("spa").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let spd = boosts.get("spd").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let spe = boosts.get("spe").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let accuracy = boosts.get("accuracy").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                let evasion = boosts.get("evasion").and_then(|v| v.as_i64()).unwrap_or(0) as i8;
                quote! {
                    Some(crate::Boosts {
                        atk: (#atk).into(),
                        def: (#def).into(),
                        spa: (#spa).into(),
                        spd: (#spd).into(),
                        spe: (#spe).into(),
                        accuracy: (#accuracy).into(),
                        evasion: (#evasion).into()
                    })
                }
            } else {
                quote! { None }
            };

            let immune_to_type = match a.get("immune_to_type").and_then(|v| v.as_str()) {
                Some(s) => {
                    let mut s = s.to_string();
                    if let Some(c) = s.get_mut(0..1) {
                        c.make_ascii_uppercase();
                    }
                    let ty_ident = syn::Ident::new(&s, proc_macro2::Span::call_site());
                    quote! { Some(crate::types::Type::#ty_ident) }
                }
                None => quote! { None },
            };

            let immune_to_status = match a.get("immune_to_status").and_then(|v| v.as_str()) {
                Some(s) => quote! { Some(#s) },
                None => quote! { None },
            };

            let ignore_foe_stat_changes = a
                .get("ignore_foe_stat_changes")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let is_magic_guard = a
                .get("is_magic_guard")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let attack_type_boost =
                if let Some(arr) = a.get("attack_type_boost").and_then(|v| v.as_array()) {
                    if arr.len() == 2 {
                        let mut type_str = arr[0].as_str().unwrap().to_string();
                        if let Some(c) = type_str.get_mut(0..1) {
                            c.make_ascii_uppercase();
                        }
                        let ty_ident = syn::Ident::new(&type_str, proc_macro2::Span::call_site());
                        let val = arr[1].as_f64().unwrap() as f32;
                        quote! { Some((crate::types::Type::#ty_ident, #val)) }
                    } else {
                        quote! { None }
                    }
                } else {
                    quote! { None }
                };

            arms.push(quote! {
                #id => Some(AbilityMeta::builder()
                    .on_start_weather(#on_start_weather)
                    .on_start_terrain(#on_start_terrain)
                    .on_start_stat_drop_foe(#on_start_stat_drop_foe)
                    .on_start_stat_boost_self(#on_start_stat_boost_self)
                    .immune_to_type(#immune_to_type)
                    .immune_to_status(#immune_to_status)
                    .ignore_foe_stat_changes(#ignore_foe_stat_changes)
                    .is_magic_guard(#is_magic_guard)
                    .attack_type_boost(#attack_type_boost)
                    .build()
                ),
            });
        }
    }

    let expanded = quote! {
        pub fn get_ability_meta(id: &str) -> Option<AbilityMeta> {
            let id = id.replace("-", "");
            match id.as_str() {
                #(#arms)*
                _ => None,
            }
        }
    };

    TokenStream::from(expanded)
}

#[proc_macro]
pub fn generate_item_meta(_item: TokenStream) -> TokenStream {
    let items_str = include_str!("../champions/items.json");
    let items_json: Value = serde_json::from_str(items_str).expect("Failed to parse items.json");

    let mut arms = Vec::new();

    if let Some(arr) = items_json["data"].as_array() {
        for i in arr {
            let id_str = i["identifier"].as_str().unwrap();
            let ident = syn::Ident::new(&to_pascal(id_str), proc_macro2::Span::call_site());

            let is_choice_scarf = i
                .get("is_choice_scarf")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let is_life_orb = i
                .get("is_life_orb")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let is_expert_belt = i
                .get("is_expert_belt")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let is_muscle_band = i
                .get("is_muscle_band")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let is_wise_glasses = i
                .get("is_wise_glasses")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let is_speed_drop = i
                .get("is_speed_drop")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let is_choice_band = i
                .get("is_choice_band")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let is_choice_specs = i
                .get("is_choice_specs")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let type_boost = if let Some(arr) = i.get("type_boost").and_then(|v| v.as_array()) {
                if arr.len() == 2 {
                    let mut type_str = arr[0].as_str().unwrap().to_string();
                    if let Some(c) = type_str.get_mut(0..1) {
                        c.make_ascii_uppercase();
                    }
                    let ty_ident = syn::Ident::new(&type_str, proc_macro2::Span::call_site());
                    let val = arr[1].as_f64().unwrap() as f32;
                    quote! { Some((crate::types::Type::#ty_ident, #val)) }
                } else {
                    quote! { None }
                }
            } else {
                quote! { None }
            };

            let type_resist_berry = match i.get("type_resist_berry").and_then(|v| v.as_str()) {
                Some(s) => {
                    let mut type_str = s.to_string();
                    if let Some(c) = type_str.get_mut(0..1) {
                        c.make_ascii_uppercase();
                    }
                    let ty_ident = syn::Ident::new(&type_str, proc_macro2::Span::call_site());
                    quote! { Some(crate::types::Type::#ty_ident) }
                }
                None => quote! { None },
            };

            arms.push(quote! {
                crate::types::ItemId::#ident => Some(ItemMeta::builder()
                    .is_choice_scarf(#is_choice_scarf)
                    .is_choice_band(#is_choice_band)
                    .is_choice_specs(#is_choice_specs)
                    .is_life_orb(#is_life_orb)
                    .is_expert_belt(#is_expert_belt)
                    .is_muscle_band(#is_muscle_band)
                    .is_wise_glasses(#is_wise_glasses)
                    .is_speed_drop(#is_speed_drop)
                    .type_boost(#type_boost)
                    .type_resist_berry(#type_resist_berry)
                    .build()
                ),
            });
        }
    }

    let expanded = quote! {
        pub fn get_item_meta(id: &crate::types::ItemId) -> Option<ItemMeta> {
            match id {
                #(#arms)*
            }
        }
    };

    TokenStream::from(expanded)
}

#[proc_macro]
pub fn generate_pokemon_meta(_item: TokenStream) -> TokenStream {
    let pokemon_str = include_str!("../champions/pokemon.json");
    let pokemon_json: Value =
        serde_json::from_str(pokemon_str).expect("Failed to parse pokemon.json");

    let master_pokemon_str = include_str!("../master/pokemon.json");
    let master_pokemon_json: Value =
        serde_json::from_str(master_pokemon_str).expect("Failed to parse master/pokemon.json");

    let mut weight_map = std::collections::HashMap::new();
    if let Some(arr) = master_pokemon_json["data"].as_array() {
        for p in arr {
            if let (Some(id), Some(w)) = (p["identifier"].as_str(), p["weight"].as_u64()) {
                weight_map.insert(id.to_string(), w as u32);
            }
        }
    }

    let mut arms = Vec::new();

    if let Some(arr) = pokemon_json["data"].as_array() {
        // Build map of base pokemon by id for resolving "inherit"
        let mut base_pokemon_by_id: std::collections::HashMap<u64, &Value> =
            std::collections::HashMap::new();
        for p in arr {
            if let Some(id) = p["id"].as_u64() {
                base_pokemon_by_id.insert(id, p);
            }
        }

        for p in arr {
            let orig_id = p["identifier"].as_str().unwrap();
            let id = orig_id.replace("-", "");
            let weight = weight_map.get(orig_id).unwrap_or(&0);

            let species_id = p.get("species_id").and_then(|v| v.as_u64());
            let base_p = species_id.and_then(|sid| base_pokemon_by_id.get(&sid).copied());

            let status = if p["status"].as_str() == Some("inherit") {
                base_p
                    .and_then(|b| b["status"].as_array())
                    .expect("Base pokemon status")
            } else {
                p["status"].as_array().expect("Status array")
            };

            let hp = status[0].as_u64().unwrap() as u32;
            let atk = status[1].as_u64().unwrap() as u32;
            let def = status[2].as_u64().unwrap() as u32;
            let spa = status[3].as_u64().unwrap() as u32;
            let spd = status[4].as_u64().unwrap() as u32;
            let spe = status[5].as_u64().unwrap() as u32;

            let capitalize = |s: &str| {
                let mut c = s.chars();
                match c.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                }
            };

            let types = if p["types"].as_str() == Some("inherit") {
                base_p
                    .and_then(|b| b["types"].as_array())
                    .expect("Base pokemon types")
            } else {
                p["types"].as_array().expect("Types array")
            };

            let type1_str = capitalize(types[0].as_str().unwrap());
            let type1_ident = syn::Ident::new(&type1_str, proc_macro2::Span::call_site());
            let type2 = if types.len() > 1 {
                let t = capitalize(types[1].as_str().unwrap());
                let type2_ident = syn::Ident::new(&t, proc_macro2::Span::call_site());
                quote! { Some(crate::types::Type::#type2_ident) }
            } else {
                quote! { None }
            };

            arms.push(quote! {
                #id => Some(PokemonMeta::builder()
                    .base_stats([#hp, #atk, #def, #spa, #spd, #spe])
                    .type1(crate::types::Type::#type1_ident)
                    .type2(#type2)
                    .weight(#weight)
                    .build()
                ),
            });
        }
    }

    let expanded = quote! {
        pub fn get_pokemon_meta(slug: &str) -> Option<PokemonMeta> {
            let slug = slug.replace("-", "").to_lowercase();
            match slug.as_str() {
                #(#arms)*
                _ => None,
            }
        }

        pub fn is_valid_pokemon(slug: &str) -> bool {
            get_pokemon_meta(slug).is_some()
        }
    };

    TokenStream::from(expanded)
}

#[proc_macro]
pub fn generate_regulation_meta(_item: TokenStream) -> TokenStream {
    let pokemon_str = include_str!("../champions/pokemon.json");
    let pokemon_json: Value =
        serde_json::from_str(pokemon_str).expect("Failed to parse pokemon.json");

    let patches_str = include_str!("../champions/patches.json");
    let patches_json: Value =
        serde_json::from_str(patches_str).expect("Failed to parse patches.json");

    let mut pokemon_entries = Vec::new();

    if let Some(arr) = pokemon_json["data"].as_array() {
        let mut base_pokemon_by_id: std::collections::HashMap<u64, &Value> =
            std::collections::HashMap::new();
        for p in arr {
            if let Some(id) = p["id"].as_u64() {
                base_pokemon_by_id.insert(id, p);
            }
        }

        for p in arr {
            let identifier = p["identifier"].as_str().unwrap().to_string();
            let id = p["id"].as_u64().unwrap();

            let species_id = p.get("species_id").and_then(|v| v.as_u64());
            let base_p = species_id.and_then(|sid| base_pokemon_by_id.get(&sid).copied());

            let moves: Vec<u32> = if p["moves"].as_str() == Some("inherit") {
                base_p
                    .and_then(|b| b["moves"].as_array())
                    .unwrap_or(&Vec::new())
                    .iter()
                    .filter_map(|m| m.as_u64().map(|v| v as u32))
                    .collect()
            } else {
                p["moves"]
                    .as_array()
                    .unwrap_or(&Vec::new())
                    .iter()
                    .filter_map(|m| m.as_u64().map(|v| v as u32))
                    .collect()
            };

            pokemon_entries.push((id, identifier, species_id, moves));
        }
    }

    let mc_patches_opt = patches_json.get("M-C").and_then(|v| v.get("pokemon"));

    // First compute MC moves applying direct patches
    let mut mc_moves_by_id: std::collections::HashMap<u64, Vec<u32>> =
        std::collections::HashMap::new();
    for (id, _identifier, _species_id, base_moves) in &pokemon_entries {
        let mut mc_moves = base_moves.clone();
        if let Some(mc_patches) = mc_patches_opt {
            let id_str = id.to_string();
            if let Some(p) = mc_patches.get(&id_str) {
                if let Some(remove) = p.get("remove_moves").and_then(|v| v.as_array()) {
                    let to_remove: std::collections::HashSet<u32> = remove
                        .iter()
                        .filter_map(|v| v.as_u64().map(|x| x as u32))
                        .collect();
                    mc_moves.retain(|m| !to_remove.contains(m));
                }
                if let Some(add) = p.get("add_moves").and_then(|v| v.as_array()) {
                    for m in add.iter().filter_map(|v| v.as_u64().map(|x| x as u32)) {
                        if !mc_moves.contains(&m) {
                            mc_moves.push(m);
                        }
                    }
                }
            }
        }
        mc_moves_by_id.insert(*id, mc_moves);
    }

    // Inherit MC moves from base species for Mega forms that do not have an explicit patch
    for (id, identifier, species_id, _base_moves) in &pokemon_entries {
        if identifier.contains("-mega")
            && let Some(sid) = species_id
        {
            let has_patch =
                mc_patches_opt.is_some_and(|patches| patches.get(id.to_string()).is_some());
            if !has_patch && let Some(base_mc) = mc_moves_by_id.get(sid).cloned() {
                mc_moves_by_id.insert(*id, base_mc);
            }
        }
    }

    // Prepare match arms for get_pokemon_moves(slug: &str, reg: Regulation) -> Option<&'static [u32]>
    let mut move_arms = Vec::new();

    for (id, identifier, _species_id, base_moves) in &pokemon_entries {
        let clean_slug = identifier.replace("-", "").to_lowercase();

        // MA and MB currently have no move patches, so they use base_moves
        let ma_mb_moves = base_moves;
        let mc_moves = mc_moves_by_id.get(id).unwrap();

        // Generate arms
        let ma_mb_tokens = quote! { &[#(#ma_mb_moves),*] };
        let mc_tokens = quote! { &[#(#mc_moves),*] };

        move_arms.push(quote! {
            (#clean_slug, Regulation::MA) => Some(#ma_mb_tokens),
            (#clean_slug, Regulation::MB) => Some(#ma_mb_tokens),
            (#clean_slug, Regulation::MC) => Some(#mc_tokens),
        });
    }

    // Allowed pokemon IDs from regulations.ts:
    // We can define the regulation allowed slugs/ids:
    let reg_ma_ids: &[u64] = &[
        10033, 3, 6, 10034, 10035, 9, 10036, 15, 10090, 10073, 18, 24, 25, 10100, 26, 36, 10278,
        10104, 38, 59, 10230, 65, 10037, 68, 10279, 71, 10165, 10071, 80, 94, 10038, 115, 10039,
        10280, 121, 10040, 127, 10250, 128, 10252, 10251, 130, 10041, 132, 134, 135, 136, 142,
        10042, 143, 149, 10281, 10282, 154, 10233, 157, 160, 10283, 168, 181, 10045, 184, 186, 196,
        197, 10172, 199, 205, 10072, 208, 10046, 212, 214, 10047, 10284, 227, 229, 10048, 10049,
        248, 279, 282, 10051, 10066, 302, 306, 10053, 308, 10054, 310, 10055, 10070, 319, 323,
        10087, 324, 334, 10067, 350, 351, 354, 10056, 358, 10306, 359, 10057, 362, 10074, 389, 392,
        395, 405, 407, 409, 411, 428, 10088, 442, 445, 10058, 448, 10059, 450, 454, 460, 10060,
        461, 464, 470, 471, 472, 473, 475, 10068, 478, 10285, 10011, 10010, 10008, 10012, 479,
        10009, 497, 500, 10286, 10236, 503, 505, 510, 512, 514, 516, 530, 10287, 531, 10069, 534,
        547, 553, 563, 569, 10239, 571, 579, 584, 587, 609, 10291, 614, 10180, 618, 623, 10313,
        635, 637, 652, 10292, 655, 10293, 658, 10294, 660, 663, 666, 670, 10296, 671, 675, 676,
        10314, 678, 10025, 681, 10026, 683, 685, 693, 695, 697, 699, 700, 701, 10300, 702, 706,
        10242, 707, 709, 10030, 711, 10031, 10032, 713, 10243, 715, 724, 10244, 727, 730, 733, 740,
        10315, 745, 10126, 10152, 748, 750, 752, 758, 763, 765, 766, 778, 780, 10302, 784, 823,
        841, 842, 844, 855, 858, 866, 867, 869, 877, 887, 899, 900, 902, 10248, 903, 908, 911, 914,
        925, 934, 936, 937, 939, 10320, 952, 956, 959, 964, 10256, 968, 970, 10321, 981, 983, 1013,
        1018, 1019,
    ];

    let reg_mb_additional_ids: &[u64] = &[
        10304, 10305, 45, 211, 254, 10065, 257, 10050, 260, 10064, 303, 10052, 376, 10076, 398,
        10308, 518, 545, 10288, 560, 10289, 604, 10290, 668, 10295, 687, 10297, 689, 10298, 691,
        10299, 861, 870, 10303, 904, 972, 979, 1000,
    ];

    let reg_mc_additional_ids: &[u64] = &[
        40, 53, 10108, 83, 122, 317, 10307, 373, 10089, 10309, 10310, 673, 768, 10316, 812, 815,
        818, 828, 849, 10184, 853, 863, 865, 871, 876, 10186, 923, 930, 931, 10260, 10261, 10262,
        943, 998, 10325,
    ];

    let mut allowed_pokemon_arms = Vec::new();

    // Map id to clean_slug
    let mut id_to_slug = std::collections::HashMap::new();
    for (id, identifier, _, _) in &pokemon_entries {
        let clean_slug = identifier.replace("-", "").to_lowercase();
        id_to_slug.insert(*id, clean_slug);
    }

    let mut ma_set = std::collections::HashSet::new();
    for id in reg_ma_ids {
        if let Some(slug) = id_to_slug.get(id) {
            ma_set.insert(slug.clone());
            allowed_pokemon_arms.push(quote! {
                (#slug, Regulation::MA) => true,
            });
        }
    }

    let mut mb_set = ma_set.clone();
    for id in reg_mb_additional_ids {
        if let Some(slug) = id_to_slug.get(id) {
            mb_set.insert(slug.clone());
        }
    }

    for slug in &mb_set {
        allowed_pokemon_arms.push(quote! {
            (#slug, Regulation::MB) => true,
        });
    }

    let mut mc_set = mb_set.clone();
    for id in reg_mc_additional_ids {
        if let Some(slug) = id_to_slug.get(id) {
            mc_set.insert(slug.clone());
        }
    }

    for slug in &mc_set {
        allowed_pokemon_arms.push(quote! {
            (#slug, Regulation::MC) => true,
        });
    }

    let expanded = quote! {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
        pub enum Regulation {
            #[serde(rename = "M-A")]
            MA,
            #[serde(rename = "M-B")]
            MB,
            #[serde(rename = "M-C")]
            MC,
        }

        pub fn get_pokemon_moves(slug: &str, reg: Regulation) -> Option<&'static [u32]> {
            let slug = slug.replace("-", "").to_lowercase();
            match (slug.as_str(), reg) {
                #(#move_arms)*
                _ => None,
            }
        }

        pub fn is_move_allowed(slug: &str, move_id: u32, reg: Regulation) -> bool {
            if let Some(moves) = get_pokemon_moves(slug, reg) {
                moves.contains(&move_id)
            } else {
                false
            }
        }

        pub fn is_pokemon_allowed(slug: &str, reg: Regulation) -> bool {
            let slug = slug.replace("-", "").to_lowercase();
            match (slug.as_str(), reg) {
                #(#allowed_pokemon_arms)*
                _ => false,
            }
        }
    };

    TokenStream::from(expanded)
}
