use crate::sim::battle::{Battle, TurnState};
use crate::solver::evaluator::{BattleResult, check_battle_result, evaluate_for_player};
use crate::solver::legal_actions::{PlayerAction, get_player_actions};
use rand::RngExt;
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct IsmctsConfig {
    pub iterations: usize,
    pub max_depth: usize,
    pub exploration_c: f64,
    pub rollout_depth: usize,
}

impl Default for IsmctsConfig {
    fn default() -> Self {
        Self {
            iterations: 200,
            max_depth: 6,
            exploration_c: 0.7,
            rollout_depth: 3,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ActionStats {
    pub action: PlayerAction,
    pub visits: usize,
    pub total_reward: f64,
}

impl ActionStats {
    pub fn new(action: PlayerAction) -> Self {
        Self {
            action,
            visits: 0,
            total_reward: 0.0,
        }
    }

    pub fn win_rate(&self) -> f64 {
        if self.visits == 0 {
            0.5
        } else {
            self.total_reward / self.visits as f64
        }
    }
}

#[derive(Clone, Debug)]
pub struct PvStep {
    pub turn: usize,
    pub p1_action: PlayerAction,
    pub p2_action: PlayerAction,
}

#[derive(Clone, Debug)]
pub struct CandidateAnalysis {
    pub rank: usize,
    pub action: PlayerAction,
    pub win_rate: f64,
    pub visits: usize,
    pub pv: Vec<PvStep>,
    pub is_mate: bool,
}

#[derive(Clone, Debug)]
pub struct PositionAnalysis {
    pub current_eval: f64,
    pub total_simulations: usize,
    pub candidates: Vec<CandidateAnalysis>,
    pub best_action: PlayerAction,
}

#[derive(Clone, Debug)]
pub struct SearchResult {
    pub best_action: PlayerAction,
    pub win_rate: f64,
    pub total_simulations: usize,
    pub action_stats: Vec<ActionStats>,
}

/// Executes a joint turn for both players on `battle`.
pub fn step_turn(
    battle: &mut Battle,
    p1_act: &PlayerAction,
    p2_act: &PlayerAction,
) -> Result<(), String> {
    crate::sim::turn::execute_turn(
        battle,
        &p1_act.a.choice,
        p1_act.a.target,
        p1_act.a.mega,
        &p1_act.b.choice,
        p1_act.b.target,
        p1_act.b.mega,
        &p2_act.a.choice,
        p2_act.a.target,
        p2_act.a.mega,
        &p2_act.b.choice,
        p2_act.b.target,
        p2_act.b.mega,
        battle.rng_config.clone(),
    )
}

/// Automatically resolves a forced switch (e.g. from U-turn, Volt Switch) by picking the first alive bench Pokémon.
pub fn auto_resolve_forced_switch(battle: &mut Battle) {
    if let TurnState::WaitingForSwitch { player, pass_stats } = battle.turn_state {
        let side = if player == 1 {
            &mut battle.p1
        } else {
            &mut battle.p2
        };

        let team_slot = side
            .team
            .iter()
            .position(|p| p.hp.into_inner() > 0)
            .unwrap_or(0);

        if team_slot < side.team.len() && !side.active.is_empty() {
            let active_slot = 0;
            let mut old = side.active.remove(active_slot);
            let mut new = side.team.remove(team_slot);

            if pass_stats {
                new.boosts = old.boosts.clone();
            }

            old.boosts = pkmn_meta::Boosts::default();
            old.volatile_status.clear();
            old.active_turns = 0;

            side.active.insert(active_slot, new);
            side.team.insert(team_slot, old);

            battle.run_switch_in(player, active_slot);
            battle.turn_state = TurnState::Ready;

            let _ = crate::sim::turn::process_turn_actions(battle);
        } else {
            battle.turn_state = TurnState::Ready;
        }
    }
}

/// A node in the Information Set MCTS tree.
#[derive(Clone, Debug)]
pub struct Node {
    pub visits: usize,
    pub p1_actions: Vec<ActionStats>,
    pub p2_actions: Vec<ActionStats>,
    pub children: HashMap<(usize, usize), Node>,
}

impl Node {
    pub fn new(battle: &Battle) -> Self {
        let p1_acts = get_player_actions(battle, 1);
        let p2_acts = get_player_actions(battle, 2);

        Self {
            visits: 0,
            p1_actions: p1_acts.into_iter().map(ActionStats::new).collect(),
            p2_actions: p2_acts.into_iter().map(ActionStats::new).collect(),
            children: HashMap::new(),
        }
    }

    /// Selects an action index using UCB1.
    pub fn select_action(
        actions: &[ActionStats],
        total_visits: usize,
        exploration_c: f64,
    ) -> usize {
        let mut best_idx = 0;
        let mut best_val = f64::NEG_INFINITY;

        for (idx, stat) in actions.iter().enumerate() {
            if stat.visits == 0 {
                // Prioritize unvisited actions
                return idx;
            }
            let exploitation = stat.win_rate();
            let exploration =
                exploration_c * ((total_visits as f64).ln() / stat.visits as f64).sqrt();
            let ucb = exploitation + exploration;
            if ucb > best_val {
                best_val = ucb;
                best_idx = idx;
            }
        }

        best_idx
    }

    /// Extracts the Principal Variation (PV / 読み筋) from this node for the given candidate action.
    pub fn extract_pv(
        &self,
        searching_player: u8,
        start_action_idx: usize,
        max_pv_depth: usize,
    ) -> Vec<PvStep> {
        let mut pv = Vec::new();
        let mut current_node = self;
        let mut current_action_idx = start_action_idx;

        for step in 1..=max_pv_depth {
            if current_node.p1_actions.is_empty() || current_node.p2_actions.is_empty() {
                break;
            }

            let (p1_idx, p2_idx) = if searching_player == 1 {
                if current_action_idx >= current_node.p1_actions.len() {
                    break;
                }
                let p1_idx = current_action_idx;
                let best_p2_idx = current_node
                    .children
                    .iter()
                    .filter(|((p1, _), _)| *p1 == p1_idx)
                    .max_by_key(|(_, child)| child.visits)
                    .map(|((_, p2), _)| *p2)
                    .or_else(|| {
                        current_node
                            .p2_actions
                            .iter()
                            .enumerate()
                            .max_by_key(|(_, s)| s.visits)
                            .map(|(idx, _)| idx)
                    });
                let Some(p2_idx) = best_p2_idx else { break };
                if p2_idx >= current_node.p2_actions.len() {
                    break;
                }
                (p1_idx, p2_idx)
            } else {
                if current_action_idx >= current_node.p2_actions.len() {
                    break;
                }
                let p2_idx = current_action_idx;
                let best_p1_idx = current_node
                    .children
                    .iter()
                    .filter(|((_, p2), _)| *p2 == p2_idx)
                    .max_by_key(|(_, child)| child.visits)
                    .map(|((p1, _), _)| *p1)
                    .or_else(|| {
                        current_node
                            .p1_actions
                            .iter()
                            .enumerate()
                            .max_by_key(|(_, s)| s.visits)
                            .map(|(idx, _)| idx)
                    });
                let Some(p1_idx) = best_p1_idx else { break };
                if p1_idx >= current_node.p1_actions.len() {
                    break;
                }
                (p1_idx, p2_idx)
            };

            let p1_action = current_node.p1_actions[p1_idx].action.clone();
            let p2_action = current_node.p2_actions[p2_idx].action.clone();

            pv.push(PvStep {
                turn: step,
                p1_action,
                p2_action,
            });

            // Transition to child node
            if let Some(child) = current_node.children.get(&(p1_idx, p2_idx)) {
                current_node = child;
                let searching_actions = if searching_player == 1 {
                    &current_node.p1_actions
                } else {
                    &current_node.p2_actions
                };
                if let Some((next_idx, _)) = searching_actions
                    .iter()
                    .enumerate()
                    .max_by_key(|(_, s)| s.visits)
                {
                    current_action_idx = next_idx;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        pv
    }
}

pub struct Ismcts {
    pub config: IsmctsConfig,
}

impl Ismcts {
    pub fn new(config: IsmctsConfig) -> Self {
        Self { config }
    }

    /// Performs position analysis (Kishin Analysis / 棋神解析) to evaluate candidate lines,
    /// principal variations (PV / 読み筋), and forced win (mate / 詰め筋) status.
    pub fn analyze(&self, root_battle: &Battle, searching_player: u8) -> PositionAnalysis {
        let current_eval = evaluate_for_player(root_battle, searching_player);
        let mut root = Node::new(root_battle);

        for _ in 0..self.config.iterations {
            let mut state = root_battle.clone();
            self.simulate(&mut root, &mut state, 0, searching_player);
        }

        let searching_actions = if searching_player == 1 {
            &root.p1_actions
        } else {
            &root.p2_actions
        };

        let mut candidates = Vec::new();
        let opp_acts = if searching_player == 1 {
            &root.p2_actions
        } else {
            &root.p1_actions
        };

        for (idx, stat) in searching_actions.iter().enumerate() {
            let pv = root.extract_pv(searching_player, idx, 3);

            // A candidate move cannot be a guaranteed win (mate / 詰め筋)
            // if the opponent has an immediate refutation that defeats the searching player.
            let mut refuted = false;
            for opp_stat in opp_acts {
                let mut test_battle = root_battle.clone();
                let (p1_act, p2_act) = if searching_player == 1 {
                    (&stat.action, &opp_stat.action)
                } else {
                    (&opp_stat.action, &stat.action)
                };
                let _ = step_turn(&mut test_battle, p1_act, p2_act);
                if matches!(test_battle.turn_state, TurnState::WaitingForSwitch { .. }) {
                    auto_resolve_forced_switch(&mut test_battle);
                }
                if check_battle_result(&test_battle) == BattleResult::Win(3 - searching_player) {
                    refuted = true;
                    break;
                }
            }

            // Check if PV leads to guaranteed win (mate / 詰め筋)
            let mut is_mate = false;
            if !refuted {
                let mut test_battle = root_battle.clone();
                for step in &pv {
                    let _ = step_turn(&mut test_battle, &step.p1_action, &step.p2_action);
                    if matches!(test_battle.turn_state, TurnState::WaitingForSwitch { .. }) {
                        auto_resolve_forced_switch(&mut test_battle);
                    }
                    if check_battle_result(&test_battle) == BattleResult::Win(searching_player) {
                        is_mate = true;
                        break;
                    }
                    if check_battle_result(&test_battle) == BattleResult::Win(3 - searching_player)
                    {
                        is_mate = false;
                        break;
                    }
                }
            }

            candidates.push(CandidateAnalysis {
                rank: 0,
                action: stat.action.clone(),
                win_rate: stat.win_rate(),
                visits: stat.visits,
                pv,
                is_mate,
            });
        }

        candidates.sort_by(|a, b| {
            b.is_mate
                .cmp(&a.is_mate)
                .then_with(|| b.visits.cmp(&a.visits))
                .then_with(|| b.win_rate.partial_cmp(&a.win_rate).unwrap())
        });

        for (i, c) in candidates.iter_mut().enumerate() {
            c.rank = i + 1;
        }

        let best_action = candidates
            .first()
            .map(|c| c.action.clone())
            .unwrap_or_else(PlayerAction::pass);

        PositionAnalysis {
            current_eval,
            total_simulations: root.visits,
            candidates,
            best_action,
        }
    }

    /// Performs ISMCTS from the perspective of `searching_player` (1 or 2).
    pub fn search(&self, root_battle: &Battle, searching_player: u8) -> SearchResult {
        let analysis = self.analyze(root_battle, searching_player);
        let best_candidate = analysis.candidates.first();

        let searching_actions = analysis
            .candidates
            .iter()
            .map(|c| ActionStats {
                action: c.action.clone(),
                visits: c.visits,
                total_reward: c.win_rate * c.visits as f64,
            })
            .collect();

        SearchResult {
            best_action: analysis.best_action,
            win_rate: best_candidate.map(|c| c.win_rate).unwrap_or(0.5),
            total_simulations: analysis.total_simulations,
            action_stats: searching_actions,
        }
    }

    fn simulate(
        &self,
        node: &mut Node,
        state: &mut Battle,
        depth: usize,
        searching_player: u8,
    ) -> f64 {
        node.visits += 1;

        if check_battle_result(state) != BattleResult::Ongoing || depth >= self.config.max_depth {
            return evaluate_for_player(state, searching_player);
        }

        if node.p1_actions.is_empty() || node.p2_actions.is_empty() {
            return evaluate_for_player(state, searching_player);
        }

        // Select actions using Decoupled UCT
        let p1_idx = Node::select_action(&node.p1_actions, node.visits, self.config.exploration_c);
        let p2_idx = Node::select_action(&node.p2_actions, node.visits, self.config.exploration_c);

        let p1_action = node.p1_actions[p1_idx].action.clone();
        let p2_action = node.p2_actions[p2_idx].action.clone();

        let _ = step_turn(state, &p1_action, &p2_action);
        if matches!(state.turn_state, TurnState::WaitingForSwitch { .. }) {
            auto_resolve_forced_switch(state);
        }

        let reward = if let Some(child) = node.children.get_mut(&(p1_idx, p2_idx)) {
            self.simulate(child, state, depth + 1, searching_player)
        } else {
            // Expand node
            let mut child = Node::new(state);
            let rollout_reward = self.rollout(state, searching_player);
            child.visits = 1;
            node.children.insert((p1_idx, p2_idx), child);
            rollout_reward
        };

        // Backpropagate rewards:
        // P1 reward is aligned with searching_player if searching_player == 1, else 1.0 - reward
        let p1_reward = if searching_player == 1 {
            reward
        } else {
            1.0 - reward
        };
        let p2_reward = 1.0 - p1_reward;

        node.p1_actions[p1_idx].visits += 1;
        node.p1_actions[p1_idx].total_reward += p1_reward;

        node.p2_actions[p2_idx].visits += 1;
        node.p2_actions[p2_idx].total_reward += p2_reward;

        reward
    }

    /// Fast rollout using random legal moves up to `rollout_depth`.
    fn rollout(&self, state: &mut Battle, searching_player: u8) -> f64 {
        let mut rng = rand::rng();

        for _ in 0..self.config.rollout_depth {
            if check_battle_result(state) != BattleResult::Ongoing {
                break;
            }

            if matches!(state.turn_state, TurnState::WaitingForSwitch { .. }) {
                auto_resolve_forced_switch(state);
            }

            let p1_acts = get_player_actions(state, 1);
            let p2_acts = get_player_actions(state, 2);

            if p1_acts.is_empty() || p2_acts.is_empty() {
                break;
            }

            let p1_chosen = &p1_acts[rng.random_range(0..p1_acts.len())];
            let p2_chosen = &p2_acts[rng.random_range(0..p2_acts.len())];

            let _ = step_turn(state, p1_chosen, p2_chosen);
        }

        evaluate_for_player(state, searching_player)
    }
}
