---
"@poketistix/app": minor
---

[ja]

新機能・変更点:

- damage-calc: BOXに登録済みのポケモンをワンクリックで読み込めるダイアログを追加
- team-builder: ポケモン選択ダイアログのBOXタブをリッチ化し、持ち物・努力値・技での検索および直接選択に対応
- team-builder: スロット詳細および空スロットから直接BOXのポケモンを読み込む機能を追加
- blog: ユーザーフィードバックへの対応状況をまとめた記事およびFeedbackCardコンポーネントを追加
- monitoring: Sentryクライアント向けのエラーフィルタリングを追加

バグ修正:

- data: フラエッテ（えいえんのはな）の種族値を修正
- battle-record: 対戦記録の表示・保存およびチームセレクターの挙動を修正

[en]

Features:

- damage-calc: Added a dialog to quickly load trained Pokémon directly from the BOX
- team-builder: Enhanced the BOX tab in the Pokémon selection dialog with item, EV, and move details, plus multi-field search
- team-builder: Added direct "Load from Box" actions to empty slots and the slot detail header
- blog: Added a user feedback response blog post and FeedbackCard component
- monitoring: Added client-side error filtering for Sentry

Fixes:

- data: Fixed base stats for Floette (Eternal Flower)
- battle-record: Fixed match history display and team selection behavior
