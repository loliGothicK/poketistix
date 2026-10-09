pub mod ai;
pub mod sim;
pub mod wasm_api;

#[cfg(test)]
mod tests {
    use damage_calc::calculate_input;
    use damage_calc::types::DamageInput;
    use damage_calc::types::Type;

    #[test]
    fn test_damage() {
        let input = DamageInput {
            level: 50,
            base_power: 100,
            bp_modifiers: vec![],
            attack: 158,
            attack_boost: -1,
            attack_modifiers: vec![],
            defense: 100,
            defense_boost: 0,
            defense_modifiers: vec![],
            is_physical: true,
            move_type: Type::Rock,
            defender_type1: Type::Fire,
            defender_type2: None,
            defender_type3: None,
            effectiveness_override: None,
            immune_override: None,
            spread_modifier: 4096,
            parental_bond_modifier: 4096,
            weather_modifier: 4096,
            is_crit: false,
            crit_modifier: 4096,
            stab_modifier: 6144, // 1.5x
            is_burned: false,
            final_modifiers: vec![],
            protect_modifier: 4096,
            tinted_lens: false,
            neuroforce: false,
            solid_rock: false,
        };

        let output = calculate_input(&input);
        assert_eq!(output.max, 144);
    }
}
