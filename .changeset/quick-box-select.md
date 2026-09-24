---
"@poketistix/app": minor
---

[ja]

新機能・変更点:

- damage-calc: BOXに登録済みのポケモンをワンクリックで読み込めるダイアログを追加
- team-builder: ポケモン選択ダイアログのBOXタブをリッチ化し、持ち物・努力値・技での検索および直接選択に対応
- team-builder: スロット詳細および空スロットから直接BOXのポケモンを読み込む機能を追加
- team-builder: チームの変更履歴（リビジョン履歴）閲覧および過去バージョンの復元機能を追加。
- team-builder: チームの変更履歴でセマンティック差分および Pokepaste テキスト差分の表示に対応（デスクトップのみ）
- team-builder: 構築経緯・基本選出・相手別プランを記録できる「戦略ノート」機能を追加
- team-builder: 日本語選択時のポケモン選択検索において、ひらがな正規化および `wanakana` によるローマ字入力（`gabu`, `rizadon`, `sa-fugo-` 等）での検索に対応（日本語検索時の英語識別子を除外して誤一致を防止）
- team-builder: ポケモン選択ダイアログ・技選択ドロワー・BOX読み込みダイアログにおいて、別スロットや別のポケモン・技を選択した際に検索キーワードや選択状態が残らないよう自動リセット処理を追加
- blog: ユーザーフィードバックへの対応状況をまとめた記事およびFeedbackCardコンポーネントを追加
- monitoring: Sentryクライアント向けのエラーフィルタリングを追加

バグ修正:

- data: フラエッテ（えいえんのはな）の種族値を修正
- battle-record: 対戦記録の表示・保存およびチームセレクターの挙動を修正
- team-builder: Pokepaste の URL インポート時に発生していた CORS エラー（Load failed）および未存在 URL 入力時の例外を修正。サーバープロキシ経由でのフェッチおよび URL/ID の自動抽出に対応

[en]

Features:

- damage-calc: Added a dialog to quickly load trained Pokémon directly from the BOX
- team-builder: Enhanced the BOX tab in the Pokémon selection dialog with item, EV, and move details, plus multi-field search
- team-builder: Added direct "Load from Box" actions to empty slots and the slot detail header
- team-builder: Added team revision history and version restore functionality with semantic and Pokepaste diff views
- team-builder: Added "Strategy Notes" workspace to document build process, core gameplans, and matchup plans
- team-builder: Optimized revision history dialog layout and diff view for mobile screens
- team-builder: Supported Hiragana normalization and Romaji search inputs (e.g. `gabu`, `rizadon`, `sa-fugo-`) for Pokémon and move selection when Japanese is active, excluding English identifiers to prevent false matches
- team-builder: Automatically reset AutoComplete search queries and token chips in Pokémon selection, move selection, and BOX loader dialogs when opening, switching slots, or making a selection
- blog: Added a user feedback response blog post and FeedbackCard component
- monitoring: Added client-side error filtering for Sentry

Fixes:

- data: Fixed base stats for Floette (Eternal Flower)
- battle-record: Fixed match history display and team selection behavior
- team-builder: Fixed CORS error (`TypeError: Load failed`) during Pokepaste URL import with a server-side proxy, automatic URL/ID parsing, and user-friendly error diagnostics
