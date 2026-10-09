use crate::sim::battle::Battle;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BattleResult {
    Win(u8), // Winning player: 1 or 2
    Draw,
    Ongoing,
}

/// Checks whether the battle has ended or is still ongoing.
pub fn check_battle_result(battle: &Battle) -> BattleResult {
    let p1_alive = battle
        .p1
        .active
        .iter()
        .chain(&battle.p1.team)
        .any(|p| p.hp.into_inner() > 0);
    let p2_alive = battle
        .p2
        .active
        .iter()
        .chain(&battle.p2.team)
        .any(|p| p.hp.into_inner() > 0);

    match (p1_alive, p2_alive) {
        (true, false) => BattleResult::Win(1),
        (false, true) => BattleResult::Win(2),
        (false, false) => BattleResult::Draw,
        (true, true) => BattleResult::Ongoing,
    }
}

/// Evaluates the current battle state from Player 1's perspective.
/// Returns a value in [0.0, 1.0], where 1.0 is guaranteed win for P1 and 0.0 is guaranteed win for P2.
pub fn evaluate_state(battle: &Battle) -> f64 {
    match check_battle_result(battle) {
        BattleResult::Win(1) => 1.0,
        BattleResult::Win(_) => 0.0,
        BattleResult::Draw => 0.5,
        BattleResult::Ongoing => {
            let p1_max_hp: i64 = battle
                .p1
                .active
                .iter()
                .chain(&battle.p1.team)
                .map(|p| p.maxhp.into_inner() as i64)
                .sum();
            let p1_cur_hp: i64 = battle
                .p1
                .active
                .iter()
                .chain(&battle.p1.team)
                .map(|p| p.hp.into_inner().max(0) as i64)
                .sum();
            let p1_hp_ratio = if p1_max_hp > 0 {
                p1_cur_hp as f64 / p1_max_hp as f64
            } else {
                0.0
            };

            let p2_max_hp: i64 = battle
                .p2
                .active
                .iter()
                .chain(&battle.p2.team)
                .map(|p| p.maxhp.into_inner() as i64)
                .sum();
            let p2_cur_hp: i64 = battle
                .p2
                .active
                .iter()
                .chain(&battle.p2.team)
                .map(|p| p.hp.into_inner().max(0) as i64)
                .sum();
            let p2_hp_ratio = if p2_max_hp > 0 {
                p2_cur_hp as f64 / p2_max_hp as f64
            } else {
                0.0
            };

            let p1_alive = battle
                .p1
                .active
                .iter()
                .chain(&battle.p1.team)
                .filter(|p| p.hp.into_inner() > 0)
                .count();
            let p2_alive = battle
                .p2
                .active
                .iter()
                .chain(&battle.p2.team)
                .filter(|p| p.hp.into_inner() > 0)
                .count();

            let total_alive = (p1_alive + p2_alive).max(1) as f64;
            let alive_ratio = (p1_alive as f64 - p2_alive as f64) / total_alive; // in [-1.0, 1.0]

            let hp_diff = p1_hp_ratio - p2_hp_ratio; // in [-1.0, 1.0]

            // Weighted combination
            let raw_score = 0.6 * hp_diff + 0.4 * alive_ratio; // in [-1.0, 1.0]
            let normalized = (raw_score + 1.0) / 2.0; // in [0.0, 1.0]
            normalized.clamp(0.01, 0.99)
        }
    }
}

/// Evaluates the current state from the specified player's perspective (1 or 2).
pub fn evaluate_for_player(battle: &Battle, player: u8) -> f64 {
    let p1_score = evaluate_state(battle);
    if player == 1 {
        p1_score
    } else {
        1.0 - p1_score
    }
}
