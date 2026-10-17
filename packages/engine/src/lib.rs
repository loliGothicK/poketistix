pub mod kifu;
pub mod sim;
pub mod solver;
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

    #[test]
    fn test_trick_room_memory_layout() {
        use crate::sim::battle::Battle;
        use std::mem::size_of;
        use std::num::NonZeroU8;

        // Verify niche optimization: Option<NonZeroU8> is exactly 1 byte
        assert_eq!(size_of::<Option<NonZeroU8>>(), 1);

        let mut battle = Battle::new();
        assert!(!battle.is_trick_room());
        assert_eq!(battle.trick_room_turns_left(), 0);
        assert_eq!(size_of_val(&battle.trick_room), 1);

        battle.trick_room = NonZeroU8::new(5);
        assert!(battle.is_trick_room());
        assert_eq!(battle.trick_room_turns_left(), 5);

        // Verify Side tailwind memory layout
        assert_eq!(size_of_val(&battle.p1.tailwind), 1);
        assert!(!battle.p1.is_tailwind());
        assert_eq!(battle.p1.tailwind_turns(), 0);
        battle.p1.tailwind = NonZeroU8::new(4);
        assert!(battle.p1.is_tailwind());
        assert_eq!(battle.p1.tailwind_turns(), 4);

        // Verify Battle.log holds BattleLog directly (96B instead of 120B)
        assert_eq!(size_of::<crate::sim::log::BattleLog>(), 96);
    }
}
