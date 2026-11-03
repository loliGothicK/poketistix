use kifu::{BattleKifu, TurnAnnotation};

pub trait BattleKifuSolverExt {
    fn annotate_turn_with_evaluation(
        &mut self,
        turn_index: usize,
        iterations: Option<usize>,
    ) -> Result<&TurnAnnotation, String>;

    fn annotate_all_turns_with_evaluation(&mut self, iterations: Option<usize>);
}

impl BattleKifuSolverExt for BattleKifu {
    fn annotate_turn_with_evaluation(
        &mut self,
        turn_index: usize,
        iterations: Option<usize>,
    ) -> Result<&TurnAnnotation, String> {
        if turn_index >= self.turns.len() {
            return Err(format!(
                "turn index {turn_index} out of bounds (len: {})",
                self.turns.len()
            ));
        }
        let mut config = crate::solver::IsmctsConfig::default();
        if let Some(iters) = iterations {
            config.iterations = iters;
        }
        let ismcts = crate::solver::Ismcts::new(config);
        let report = ismcts.evaluate_kifu_turn(self, turn_index);

        let turn = &mut self.turns[turn_index];
        turn.annotation.eval_win_rate = Some(report.expected_win_rate);
        turn.annotation.best_action = Some(report.best_action);
        turn.annotation.action_quality = report.action_quality;

        Ok(&turn.annotation)
    }

    fn annotate_all_turns_with_evaluation(&mut self, iterations: Option<usize>) {
        let mut config = crate::solver::IsmctsConfig::default();
        if let Some(iters) = iterations {
            config.iterations = iters;
        }
        let ismcts = crate::solver::Ismcts::new(config);
        for turn_idx in 0..self.turns.len() {
            let report = ismcts.evaluate_kifu_turn(self, turn_idx);
            let turn = &mut self.turns[turn_idx];
            turn.annotation.eval_win_rate = Some(report.expected_win_rate);
            turn.annotation.best_action = Some(report.best_action);
            turn.annotation.action_quality = report.action_quality;
        }
    }
}
