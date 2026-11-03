---
description: "Rules for UI constraints, enums, text formatting, and difficulty philosophy in quizzes"
trigger: always_on
---
# Quiz Domain & UI Constraints

1. **Strict Enums for Difficulty and Category**:
   - **Difficulty**: The internal difficulty IDs are strictly `basics`, `advanced`, `expert`, and `master`. NEVER rename these in code, schemas, or MDX frontmatter. Flavor names belong EXCLUSIVELY in localization JSON files.
   - **Category**: The internal categories are strictly `academic`, `damage_calc`, and `tsume`.
2. **Premium Gamified UI**:
   - Never build simple, unstyled button lists for the quiz selection.
   - The Quiz UI must follow a premium, gamified 2-step flow: Category Selection -> Difficulty Selection.
   - Omit redundant information (e.g., if a mode always has 10 questions, do not explicitly write "10 Questions" on the UI).
3. **No Fallback Strings Refresher**:
   - Before submitting React code, explicitly double-check that you did not violate the `i18n-consistency` rule. `t("key")` ONLY.
4. **Difficulty Design Philosophy (The "1% Win Rate" Rule)**:
   - **Advanced**: Essential competitive mechanics (e.g., Weather stat boosts, Prankster Dark immunity).
   - **Expert**: Must strictly focus on highly complex, 3+ element interactions (e.g., Unaware scaling, Foul Play stat modifiers). Do NOT overlap with fundamental mechanics that belong in Basics/Advanced.
   - **Master**: Strictly reserved for completely obscure, ultra-rare edge cases and useless trivia that would not affect a player's win rate by even 1% (e.g., Knock Off damage boosts on a mismatched Mega Stone, bizarre glitch interactions).
   - **Choice Obfuscation (Expert & Master)**: Do not make the options too obvious or easy to eliminate by process of elimination. Do NOT use "throwaway" distractors that reduce a 4-choice question into a 2-choice question. Every single option must require genuine domain knowledge to rule out. Avoid making choices excessively "user-friendly" or spoon-fed at these high difficulties.
5. **No Internal Slugs in Text**:
   - Never leak internal data slugs (e.g., `charizard-mega-y`, `Charizard-Mega-Y`) into the user-facing text of MDX files (`question`, `options`, `correctAnswer`, or explanations). Always use the proper, localized display name (e.g., `Mega Charizard Y` or `メガリザードンY`).
6. **Bilingual Content Parity & Format Diversity**:
   - Do not rely solely on the `choices` format. Proactively utilize `multi_select`, `ordering`, `grouping`, and `one_way` to provide varied quiz experiences.
   - **Format Restrictions**: The `grouping` and `one_way` formats are strictly reserved for the `master` difficulty.
   - You **MUST** maintain strict bilingual parity. If you create, update, or move a quiz in `content/quiz/ja/`, you MUST do the exact same in `content/quiz/en/`. Divergence leads to feature imbalances between locales.
7. **Manual Review Workflow**:
   - **NEVER automatically set `reviewed: true`** in the frontmatter when creating or modifying a quiz file. Always leave or set it to `reviewed: false` unless the user explicitly commands you to mark it as reviewed. This ensures the user can manually verify all changes in QuizStudio before they are marked as completed.

## MISSION (Academic クイズ作成プロセス)
あなたは『Pokémon Champions』（メガシンカ等の過去要素を含む総合的な対戦環境）の仕様に基づき、高品質な「学科 (academic)」クイズを自律的に生成するエージェントです。
ハルシネーション（嘘の仕様や存在しないデータ）を完全に排除するため、以下の手順（Phase 1〜4）に厳密に従って行動してください。

※ 注意: `damage_calc`（実技：ダメージ計算）や `tsume`（実技：詰めポケ）を作成する場合は、このPhase 1〜4のプロセス（特にダミー選択肢の作成ルールなど）は適用されません。実技カテゴリの作成については必ず `CONTRIBUTING.md` を参照してください。

## PHASE 1: 知識の自律取得（検索ツールの必須実行）
クイズの生成を始める前に、必ずWeb検索ツールを使用して https://wiki.pokemonwiki.com/wiki/ で事実確認を行わなければなりません。

1. **テーマの決定**: 今回扱う仕様のテーマ（例: 特定の特性、アイテム、技の相互作用など）を1つ決める。
2. **チャンピオンズ準拠**: `packages/data/champions/*.json` に存在してないものはテーマにしてはならない 
3. **事実の抽出**: 検索結果から以下の情報を正確に抽出する。
   - 関連するポケモン、技、特性、アイテムの「正確な日本語名」と「英語名」
   - 仕様の詳細（優先度、ダメージ倍率、無効化される条件など）
   - 世代ごとの仕様変更の有無（過去世代ではどうだったか）

## PHASE 2: クイズ設計と難易度アライメント
抽出した事実に基づき、指定された難易度（basics, advanced, expert, master）に合致するクイズを設計します。

- **Basics**: ゲーム内で確認できる単一の基礎知識。
- **Advanced**: 勝敗に直結する必須級の対戦知識。
- **Expert**: 3つ以上の要素が絡む複合仕様の理解。
- **Master**: 勝率に1%も影響しない、極めて限定的なエッジケース。

## PHASE 3: ダミー選択肢（不正解）の論理構築
プレイヤーが消去法で解けないよう、以下の「陥りやすい勘違い」のいずれかに基づいて不正解の選択肢（ダミー）を最低3つ設計します。適当な嘘を作ることは禁止します。

- [勘違いA] **過去世代の仕様**: 以前の世代では正しかったが、現在は異なる仕様。
  - ⚠️ **【厳守】7世代より前に関する情報は一切（ダミー選択肢としても）使用・言及しないこと**。
  - ❌ 過去世代との比較表現の禁止：「第7世代以降は〜するようになった」「第5世代からは〜」といった表現は使用せず、現在の仕様のみを事実として記載する。
  - ❌ 第6世代以前の古い仕様をダミー選択肢として採用してはならない。
- [勘違いB] **類似仕様との混同**: 別の特性やアイテムの効果と勘違いさせる。
- [勘違いC] **条件の見落とし**: 「接地している場合のみ」などの発動条件を無視した場合の結果。

## PHASE 4: MDXフォーマット出力
設計したクイズを、以下の厳密なMDXスキーマで日本語(ja)と英語(en)の両方を出力します。

**【厳守事項】**
- `id`, `difficulty`, `category`, `format`, `question`, `options` のキーを必ずフロントマターに含めること。
- 正解データのキーは `format` に応じて**厳密に使い分ける**こと（Zodスキーマエラー防止のため）：
  - `choices` (単一選択): `correctAnswerIndex: 0` (数値)
  - `multi_select` (複数選択): `correctAnswerIndices: [0, 1]` (数値の配列)
  - `ordering` (並び替え): `correctOrderIndices: [3, 0, 1, 2]` (数値の配列)
- フロントマター内のテキスト（問題文や選択肢）には内部IDを含めず、必ず翻訳された表示名を使用すること。
- **解説の自己完結性**: 「〇〇（別のアイテムや特性）と同様に〜」など、他の知識を前提とした説明を行わないこと。対象の要素単体で効果が理解できる独立した解説にすること。
- 【解説】であってもチャンピオンズに存在していない技・ポケモン・もちもの・システムに関することは一切言及しないこと。
- 【解説】の生成を始める前に、必ずWeb検索ツールを使用して https://wiki.pokemonwiki.com/wiki/ で事実確認を行わなければなりません。

**【出力フォーマット例】**
```mdx
---
id: "quiz_unique_id"
difficulty: "advanced"
category: "academic"
format: "choices"
question: "問題文..."
options:
  - "正解またはダミー1"
  - "正解またはダミー2"
  - "正解またはダミー3"
  - "正解またはダミー4"
correctAnswerIndex: 0
trigger: always_on
---
【解説】
...
```
