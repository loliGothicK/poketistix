data::generate_mega_meta!();

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_charizard_mega() {
        let mega_x = get_mega_details("charizard", "charizarditex").expect("mega x");
        assert_eq!(mega_x.mega_species, "charizard-mega-x");
        assert_eq!(mega_x.ability, "toughclaws");

        let mega_y = get_mega_details("charizard", "charizarditey").expect("mega y");
        assert_eq!(mega_y.mega_species, "charizard-mega-y");
        assert_eq!(mega_y.ability, "drought");

        assert!(is_matching_mega_stone("charizard", "charizarditex"));
        assert!(is_matching_mega_stone("charizard-mega-x", "charizarditex"));
        assert!(!is_matching_mega_stone("pikachu", "charizarditex"));
        assert!(!can_remove_item("charizard", "charizarditex"));
        assert!(can_remove_item("pikachu", "charizarditex"));
    }
}
