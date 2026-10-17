pub mod belief;
pub mod damage_distribution;
pub mod determinizer;
pub mod evaluator;
pub mod expecti_engine;
pub mod gto_solver;
pub mod ismcts;
pub mod legal_actions;
pub mod quasi_random;

pub use belief::*;
pub use damage_distribution::*;
pub use determinizer::*;
pub use evaluator::*;
pub use expecti_engine::*;
pub use gto_solver::*;
pub use ismcts::*;
pub use legal_actions::*;
pub use quasi_random::*;

#[cfg(test)]
mod tests_competitive;
#[cfg(test)]
mod tests_kifu_cts;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::battle::Battle;
    use crate::wasm_api::{InputPokemonData, build_pokemon};

    fn make_test_pokemon(
        ident: &str,
        species: &str,
        moves: Vec<&str>,
    ) -> crate::sim::pokemon::Pokemon {
        build_pokemon(&InputPokemonData {
            ident: ident.to_string(),
            species: species.to_string(),
            hp: 100,
            maxhp: 100,
            speed: 100,
            attack: 100,
            defense: 100,
            sp_attack: 100,
            sp_defense: 100,
            moves: moves.into_iter().map(String::from).collect(),
            type1: "Normal".to_string(),
            ..Default::default()
        })
    }

    fn make_test_battle() -> Battle {
        let mut battle = Battle::new();
        battle.p1.active.push(make_test_pokemon(
            "p1a",
            "pikachu",
            vec!["thunderbolt", "quickattack"],
        ));
        battle.p1.active.push(make_test_pokemon(
            "p1b",
            "charizard",
            vec!["flamethrower", "airslash"],
        ));
        battle
            .p1
            .team
            .push(make_test_pokemon("p1c", "raichu", vec!["thunderbolt"]));

        battle.p2.active.push(make_test_pokemon(
            "p2a",
            "blastoise",
            vec!["surf", "icebeam"],
        ));
        battle.p2.active.push(make_test_pokemon(
            "p2b",
            "venusaur",
            vec!["sludgebomb", "gigadrain"],
        ));
        battle
            .p2
            .team
            .push(make_test_pokemon("p2c", "wartortle", vec!["surf"]));
        battle
    }

    #[test]
    fn test_legal_actions() {
        let battle = make_test_battle();
        let slot_actions_p1a = get_slot_actions(&battle, 1, 0);
        assert!(!slot_actions_p1a.is_empty());
        let choices: Vec<&str> = slot_actions_p1a.iter().map(|a| a.choice.as_str()).collect();
        assert!(choices.contains(&"thunderbolt"));
        assert!(choices.contains(&"quickattack"));
        assert!(choices.contains(&"switch"));

        let player_actions = get_player_actions(&battle, 1);
        assert!(!player_actions.is_empty());
    }

    #[test]
    fn test_evaluator() {
        let mut battle = make_test_battle();
        let initial_score = evaluate_state(&battle);
        assert!((initial_score - 0.5).abs() < 0.1);

        // KO player 2's team
        for p in battle.p2.active.iter_mut().chain(&mut battle.p2.team) {
            p.hp = 0.into();
        }
        assert_eq!(check_battle_result(&battle), BattleResult::Win(1));
        assert_eq!(evaluate_state(&battle), 1.0);
        assert_eq!(evaluate_for_player(&battle, 1), 1.0);
        assert_eq!(evaluate_for_player(&battle, 2), 0.0);
    }

    #[test]
    fn test_ismcts_search() {
        let battle = make_test_battle();
        let ismcts = Ismcts::new(IsmctsConfig {
            iterations: 50,
            max_depth: 3,
            exploration_c: 1.414,
            rollout_depth: 2,
        });

        let result = ismcts.search(&battle, 1);
        assert_eq!(result.total_simulations, 50);
        assert!(!result.action_stats.is_empty());
        assert!(result.win_rate >= 0.0 && result.win_rate <= 1.0);
        assert!(!result.best_action.a.choice.is_empty());
    }
}
