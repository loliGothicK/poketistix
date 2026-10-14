/// 2人ゼロサムゲームの同時手番におけるゲーム理論最適解 (GTO / ナッシュ均衡解)
#[derive(Debug, Clone, PartialEq)]
pub struct GtoSolution {
    /// 行プレイヤー (P1, 最大化側) の各手の確率分布
    pub p1_strategy: Vec<f64>,
    /// 列プレイヤー (P2, 最小化側) の各手の確率分布
    pub p2_strategy: Vec<f64>,
    /// ゲームの期待利得値 (P1 視点)
    pub game_value: f64,
}

/// 2人ゼロサムゲームの利得行列から、線形計画法 (双対単体法) を用いて
/// GTO (Game Theory Optimal) 混合戦略を厳密に解くソルバー
pub struct GtoSolver;

impl GtoSolver {
    /// 利得行列 `matrix` (サイズ: rows x cols) を受け取り、GTO 最適解を計算する
    /// `matrix[i][j]` は 行プレイヤーが i、列プレイヤーが j を選んだときの P1 の利得
    pub fn solve(matrix: &[Vec<f64>]) -> Option<GtoSolution> {
        let m = matrix.len();
        if m == 0 {
            return None;
        }
        let n = matrix[0].len();
        if n == 0 || matrix.iter().any(|row| row.len() != n) {
            return None;
        }

        // 1x1 の自明なケース
        if m == 1 && n == 1 {
            return Some(GtoSolution {
                p1_strategy: vec![1.0],
                p2_strategy: vec![1.0],
                game_value: matrix[0][0],
            });
        }

        // 全要素を正にするための定数シフト c (ゲーム値 > 0 を保証)
        let min_val = matrix
            .iter()
            .flat_map(|r| r.iter())
            .fold(f64::INFINITY, |a, &b| a.min(b));
        let shift = if min_val <= 0.0 { -min_val + 1.0 } else { 1.0 };

        // 双対問題の単体表 (Tableau) を構築
        // 変数: y_1 .. y_n (列プレイヤー用), s_1 .. s_m (スラック変数)
        // 制約: sum_{j=1}^n B_{ij} y_j + s_i = 1  (for each row i=0..m-1)
        // 目的関数: max sum_{j=1}^n y_j  =>  sum_{j=1}^n (-1) * y_j を最小化
        //
        // Tableau の構造 (m + 1 行, n + m + 1 列):
        // [ 行 0..m-1 : [B (m x n) | I (m x m) | 1 (m x 1)] ]
        // [ 行 m      : [-1 ... -1 | 0 ... 0   | 0         ] ]
        let total_vars = n + m;
        let mut tableau = vec![vec![0.0; total_vars + 1]; m + 1];

        // 制約行の設定
        for i in 0..m {
            for j in 0..n {
                tableau[i][j] = matrix[i][j] + shift;
            }
            tableau[i][n + i] = 1.0; // スラック変数
            tableau[i][total_vars] = 1.0; // 右辺 (RHS)
        }

        // 目的関数行の設定 (max sum y_j <=> min -sum y_j)
        for j in 0..n {
            tableau[m][j] = -1.0;
        }

        // 基底変数のインデックス (初期状態はスラック変数 s_0 .. s_{m-1})
        let mut basis = vec![0; m];
        for i in 0..m {
            basis[i] = n + i;
        }

        // 単体法 (Simplex Method) の反復
        let max_iters = 1000;
        let mut iters = 0;
        let eps = 1e-9;

        while iters < max_iters {
            iters += 1;

            // 1. ピボット列の選択 (Bland's rule: 最小の負の係数)
            let mut pivot_col = None;
            let mut min_obj = -eps;
            for j in 0..total_vars {
                if tableau[m][j] < min_obj {
                    min_obj = tableau[m][j];
                    pivot_col = Some(j);
                }
            }

            let col = match pivot_col {
                Some(c) => c,
                None => break, // 最適解に到達
            };

            // 2. ピボット行の選択 (最小比率テスト)
            let mut pivot_row = None;
            let mut min_ratio = f64::INFINITY;
            for i in 0..m {
                let entry = tableau[i][col];
                if entry > eps {
                    let ratio = tableau[i][total_vars] / entry;
                    if ratio < min_ratio - eps {
                        min_ratio = ratio;
                        pivot_row = Some(i);
                    }
                }
            }

            let row = match pivot_row {
                Some(r) => r,
                None => {
                    // 非有界 (ゼロサム行列では通常起きない)
                    return None;
                }
            };

            // 3. ピボット操作
            let pivot_val = tableau[row][col];
            for j in 0..=total_vars {
                tableau[row][j] /= pivot_val;
            }

            for i in 0..=m {
                if i != row {
                    let factor = tableau[i][col];
                    if factor.abs() > eps {
                        for j in 0..=total_vars {
                            tableau[i][j] -= factor * tableau[row][j];
                        }
                    }
                }
            }

            basis[row] = col;
        }

        // 最適値 1 / v_shifted
        let sum_y: f64 = tableau[m][total_vars];
        if sum_y <= eps {
            return None;
        }
        let v_shifted = 1.0 / sum_y;
        let game_value = v_shifted - shift;

        // 列プレイヤー (P2) の解 y_j
        let mut y = vec![0.0; n];
        for i in 0..m {
            if basis[i] < n {
                y[basis[i]] = tableau[i][total_vars];
            }
        }
        let mut p2_strategy = vec![0.0; n];
        for j in 0..n {
            p2_strategy[j] = (y[j] * v_shifted).max(0.0);
        }
        normalize(&mut p2_strategy);

        // 行プレイヤー (P1) の解 x_i (タブローの目的関数行のスラック変数位置にある潜在価格)
        let mut p1_strategy = vec![0.0; m];
        for i in 0..m {
            let dual_val = tableau[m][n + i];
            p1_strategy[i] = (dual_val * v_shifted).max(0.0);
        }
        normalize(&mut p1_strategy);

        Some(GtoSolution {
            p1_strategy,
            p2_strategy,
            game_value,
        })
    }
}

fn normalize(slice: &mut [f64]) {
    let sum: f64 = slice.iter().sum();
    if sum > 1e-9 {
        for v in slice.iter_mut() {
            *v /= sum;
        }
    } else {
        let uniform = 1.0 / (slice.len() as f64);
        for v in slice.iter_mut() {
            *v = uniform;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rock_paper_scissors() {
        // じゃんけん: グー(0), チョキ(1), パー(2)
        // 利得: 勝=+1, 負=-1, 分=0
        let rps = vec![
            vec![0.0, 1.0, -1.0],
            vec![-1.0, 0.0, 1.0],
            vec![1.0, -1.0, 0.0],
        ];

        let result = GtoSolver::solve(&rps).expect("Should solve RPS");

        // ゲーム値は 0.0
        assert!((result.game_value - 0.0).abs() < 1e-4);

        // 最適戦略は各手 1/3 ずつ
        for p in result.p1_strategy {
            assert!((p - (1.0 / 3.0)).abs() < 1e-3);
        }
        for q in result.p2_strategy {
            assert!((q - (1.0 / 3.0)).abs() < 1e-3);
        }
    }

    #[test]
    fn test_strictly_dominant_strategy() {
        // P1の手0が手1を支配しているケース
        let mat = vec![vec![3.0, 2.0], vec![1.0, 0.0]];

        let result = GtoSolver::solve(&mat).expect("Should solve dominant matrix");
        // P1は100% 手0を選ぶべき
        assert!((result.p1_strategy[0] - 1.0).abs() < 1e-3);
        assert!((result.p1_strategy[1] - 0.0).abs() < 1e-3);
        // P2は手1を選ぶべき (最小化)
        assert!((result.p2_strategy[1] - 1.0).abs() < 1e-3);
        assert!((result.game_value - 2.0).abs() < 1e-3);
    }

    #[test]
    fn test_matching_pennies() {
        // コインの表裏: 一致ならP1の勝ち(+1), 不一致ならP2の勝ち(-1)
        let pennies = vec![vec![1.0, -1.0], vec![-1.0, 1.0]];

        let result = GtoSolver::solve(&pennies).expect("Should solve pennies");
        assert!((result.game_value - 0.0).abs() < 1e-4);
        assert!((result.p1_strategy[0] - 0.5).abs() < 1e-3);
        assert!((result.p1_strategy[1] - 0.5).abs() < 1e-3);
    }
}
