# Kev Battle Scenario Validator 🛡️

[Kev](https://github.com/jaredpalmer/kev) (Small Jev-like decision models by Jared Palmer) を利用して、LLM等によって自動生成された対戦シナリオテスト（`packages/engine/tests/senarios/**/*.spec.ts` など）が**「妥当なテストケースか、それとも無意味・トートロジーなテストケースになっていないか」**をローカルで判定する検証ツールです。

---

## 🎯 仕組み

Kev の **System One API**（`noul` = Yes/No, `choice` = 分類, `score` = 評価スコア）を使用し、テストコードから抽出したシナリオ情報（セットアップ、行動、アサーション）を以下の観点で判定します：

1. **`is_meaningful` (`noul`)**:
    - テストが意味のある仕様検証になっているか（無意味・自明・トートロジーではないか）。
2. **`validity_category` (`choice`)**:
    - `sound`: 正常かつ実質的な対戦メカニクス検証
    - `tautology`: 自明または実質何も検証していない（トートロジー）
    - `invalid_mechanics`: ポケモン対戦のルールや仕様に矛盾している
    - `weak_assertion`: 行動はあるがアサーションが甘く検証になっていない
3. **`quality_score` (`score`)**:
    - テストの厳密さ・品質スコア（0.0 〜 3.0）

---

## 🚀 クイックスタート

### 1. Kev サーバーの起動 (ローカル)

Python 3.13 と `uv` があれば、以下のコマンドで手軽にローカルサーバーを起動できます：

```bash
# Kev リポジトリをクローンして起動
git clone https://github.com/jaredpalmer/kev.git
cd kev
uv sync --extra serve

# Kev-4B (おすすめ) または Kev-0.8B (軽量版) を起動
uv run --extra serve python -m kev.serve --run jaredpalmer/kev-4b --port 8009
```

> **Note**: CPU環境の場合は `--device cpu` を付与してください。
> 初回起動時は Hugging Face からモデルの重みが自動ダウンロードされます。

---

### 2. シナリオテストの判定実行

`packages/engine` ディレクトリで以下を実行します：

```bash
# 全シナリオテストを Kev で判定
pnpm run eval:scenarios

# 特定のテストファイルや生成ファイルを判定
pnpm run eval:scenarios path/to/generated_test.spec.ts

# JSON 形式で出力 (CIや他ツールとの連携用)
pnpm run eval:scenarios --json

# 合格スコア閾値を変更 (デフォルト: 1.5)
pnpm run eval:scenarios --min-score 2.0
```

---

## 📊 判定結果の例

```text
======================================================
 🛡️  Kev Battle Scenario Validator
 Server URL : http://127.0.0.1:8009
 Files to evaluate: 5
======================================================

📂 Evaluating double_battle_protect_mindgame.spec.ts (2 tests)...
  [PASS] Scenario: Protect completely absorbs double-target focus attacks while ally attacks freely (Quality: 2.8/3.0, SoundProb: 94%, Cat: sound)
  [PASS] Scenario: Predicting Protect and targeting the ally deals damage while Protect goes unused (Quality: 2.7/3.0, SoundProb: 91%, Cat: sound)

📂 Evaluating generated_faulty_test.spec.ts (1 tests)...
  [FAIL] Scenario: Meaningless tautology (Quality: 0.2/3.0, SoundProb: 8%, Cat: tautology)
         ↳ Flaw category detected: tautology
         ↳ Low meaningfulness probability (8.0% < 65.0%)
         ↳ Low quality score (0.20 / 3.0 < 1.50)

---------------- Summary ----------------
 Total test cases evaluated : 3
 ✅ Valid / Meaningful       : 2
 ⚠️ Suspicious / Weak        : 0
 ❌ Invalid / Tautology      : 1
-----------------------------------------
```
