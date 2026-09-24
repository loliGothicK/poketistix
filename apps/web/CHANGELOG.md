# Changelog

## 0.7.0

### Minor Changes

- [`9e9fd6c`](https://github.com/loliGothicK/poketistix/commit/9e9fd6cc9418550da60e68e2f4647d2fe927a730) Thanks [@loliGothicK](https://github.com/loliGothicK)! - Features:

    - damage-calc: Added a dialog to quickly load trained Pokémon directly from the BOX
    - team-builder: Enhanced the BOX tab in the Pokémon selection dialog with item, EV, and move details, plus multi-field search
    - team-builder: Added direct "Load from Box" actions to empty slots and the slot detail header
    - team-builder: Added team revision history and version restore functionality with semantic and Pokepaste diff views
    - team-builder: Added "Strategy Notes" workspace to document build process, core gameplans, and matchup plans
    - team-builder: Optimized revision history dialog layout and diff view for mobile screens
    - team-builder: Supported Hiragana normalization and Romaji search inputs (e.g. `gabu`, `rizadon`, `sa-fugo-`) for Pokémon and move selection when Japanese is active, excluding English identifiers to prevent false matches
    - team-builder: Automatically reset AutoComplete search queries and token chips in Pokémon selection, move selection, and BOX loader dialogs when opening, switching slots, or making a selection
    - battle-record: Added tabbed analytics in `/battle-analytics` to view pick rates and win rates for user's Pokémon, team performance, and opponent win rates
    - battle-record: Displayed active team win rate badge on party panels in `/battle-record`
    - blog: Added a user feedback response blog post and FeedbackCard component
    - monitoring: Added client-side error filtering for Sentry

    Fixes:

    - data: Fixed base stats for Floette (Eternal Flower)
    - battle-record: Fixed match history display and team selection behavior
    - team-builder: Fixed CORS error (`TypeError: Load failed`) during Pokepaste URL import with a server-side proxy, automatic URL/ID parsing, and user-friendly error diagnostics

## 0.6.2

### Patch Changes

- [`a8a0154`](https://github.com/loliGothicK/poketistix/commit/a8a0154db3f2b106d379494992d59842fef9a763) Thanks [@loliGothicK](https://github.com/loliGothicK)! - - Fix an error that occurs when click edit/delete icon in season at `/battle-record` page.

## 0.6.1

### Patch Changes

- [`e7bbf22`](https://github.com/loliGothicK/poketistix/commit/e7bbf22dd10e68768abb27f201bf3f4d721a8e7c) Thanks [@loliGothicK](https://github.com/loliGothicK)! - Fixes:

    - team builder: Fixed a bug where Meowsticite was not designated as a Mega Stone for Meowstic
    - team builder: Fixed a bug where Baxcalibrite Knight was not designated as a Mega Stone for Baxcalibur
    - damage-calc: Fixed a bug where ‘Scrappy’ was not applied

- [`e7bbf22`](https://github.com/loliGothicK/poketistix/commit/e7bbf22dd10e68768abb27f201bf3f4d721a8e7c) Thanks [@loliGothicK](https://github.com/loliGothicK)! - - Add `Report an Issue / Feedback`

## [0.6.0](https://github.com/loliGothicK/poketistix/compare/app-v0.5.0...app-v0.6.0) (2026-08-16)

### Features

- add quizzes ([5b8aa0d](https://github.com/loliGothicK/poketistix/commit/5b8aa0d6cae1960af83cc602b9be4c663d84f46a))
- opengraph-image ([1280e99](https://github.com/loliGothicK/poketistix/commit/1280e9992603d8c6e6a4fdfd20cead8c7669294f))

### Bug Fixes

- **damage:** ground status correctly accounts for Dig, Fly, Dive, and Phantom Force ([623d668](https://github.com/loliGothicK/poketistix/commit/623d668ddd6578aa5f0e9f2ccf68e73a4760a4bf))
- quiz ([dddc986](https://github.com/loliGothicK/poketistix/commit/dddc9865ffd5528d9bd581df9561857c8567afb0))
- quiz ([ee5c888](https://github.com/loliGothicK/poketistix/commit/ee5c8882621593c3c32cc500c4490fa1937fb6ce))
- quiz ([a85309d](https://github.com/loliGothicK/poketistix/commit/a85309d8f30b57e3b33ca7cf8a26cc879255ceef))
- quiz ([b5acdd2](https://github.com/loliGothicK/poketistix/commit/b5acdd20bd3edf25c102af2f9eda5733fb321a45))

## [0.5.0](https://github.com/loliGothicK/poketistix/compare/app-v0.4.0...app-v0.5.0) (2026-08-14)

### Features

- add quizzes ([7b4d7a4](https://github.com/loliGothicK/poketistix/commit/7b4d7a45b3aff1762781013101db475e8ae8443e))
- add quizzes ([6163eaa](https://github.com/loliGothicK/poketistix/commit/6163eaa90446a92346e6e7b5c74d7b9f2c38b0f2))
- add quizzes ([203f7b4](https://github.com/loliGothicK/poketistix/commit/203f7b48ebbdce7905bbe2f60901b2b351d801ad))
- add quizzes ([561a46e](https://github.com/loliGothicK/poketistix/commit/561a46e5ffd54560478787d85392c669e1325e41))
- add quizzes ([bee49e1](https://github.com/loliGothicK/poketistix/commit/bee49e1c2fc69848c4a96da274288b1a92b744f3))
- add quizzes ([3918549](https://github.com/loliGothicK/poketistix/commit/3918549c2fbdde18a8570ac6fd2c4e1c71293b12))
- add quizzes ([ee29873](https://github.com/loliGothicK/poketistix/commit/ee29873b2ed57161825c06fd7e5ac175f7f57324))
- add quizzes ([de801ef](https://github.com/loliGothicK/poketistix/commit/de801ef22b3ae4fb1f86625db8e354f1d5e811fb))
- migrate Next.js to v16.3.0 ([75fbf8e](https://github.com/loliGothicK/poketistix/commit/75fbf8ef6cf5989861b624482e7917e46912361d))
- **package:** update ([8dcb135](https://github.com/loliGothicK/poketistix/commit/8dcb135c5ca2a82c40c0507a7cc23eb37feb2ace))
- quiz debug ([34b9168](https://github.com/loliGothicK/poketistix/commit/34b9168be7d95614e5d951d01a2f03790ac68562))
- quiz wip ([11e82cc](https://github.com/loliGothicK/poketistix/commit/11e82cc98976b6f663d3c2c0db417b8c3e722bdb))
- quiz wip ([f0d9714](https://github.com/loliGothicK/poketistix/commit/f0d971451ac65d9823448300a465d7f6d6daebc3))
- quiz wip ([a0dd401](https://github.com/loliGothicK/poketistix/commit/a0dd4014d105bc0498522e20217e942f603eabe7))
- quiz wip ([d2f0916](https://github.com/loliGothicK/poketistix/commit/d2f0916a8fb0f051bc0d79a45749eb42f3f910ad))
- quiz wip ([83e12d9](https://github.com/loliGothicK/poketistix/commit/83e12d9645d08320039c4155f367919e2aea7bb0))
- quiz wip ([7fd01dc](https://github.com/loliGothicK/poketistix/commit/7fd01dcd122e2b783eac8e3895f2887269d879a7))
- quiz wip ([7e87c41](https://github.com/loliGothicK/poketistix/commit/7e87c41a1d8ee6ae7c44d303e55305762b08d720))
- quiz wip ([d5c9f28](https://github.com/loliGothicK/poketistix/commit/d5c9f2879c7b13fb09056350681d0d02fc91d97b))
- quiz wip ([144d56d](https://github.com/loliGothicK/poketistix/commit/144d56dc2a53b92b79f0c20e0578de5e1338eb5d))
- quiz wip ([d6a33b6](https://github.com/loliGothicK/poketistix/commit/d6a33b62ad1e742e413d94a2d1c8e311144391b7))
- quiz wip ([1f63e1e](https://github.com/loliGothicK/poketistix/commit/1f63e1ea11a127d99612c4bf2bde31d4d7b33396))
- quiz wip ([b75d70c](https://github.com/loliGothicK/poketistix/commit/b75d70c6689550e82f476f352f2ef227589ebe9f))
- **quiz:** basics/academic ([4546848](https://github.com/loliGothicK/poketistix/commit/45468483e38c6cb60ff8fa2f4a9831e7dd9b450f))
- **quiz:** expert/academic ([70e7ea6](https://github.com/loliGothicK/poketistix/commit/70e7ea651f927692c06170079679e4864c5fae07))
- **quiz:** expert/academic ([4127ea7](https://github.com/loliGothicK/poketistix/commit/4127ea72349e936bee1455a509cb719cbf2c8a3d))
- wip ([15575d9](https://github.com/loliGothicK/poketistix/commit/15575d9ba083bf64c7914dc9706ec5df737421d5))

### Bug Fixes

- bg ([cd7df72](https://github.com/loliGothicK/poketistix/commit/cd7df72df977457eeffbd547a83a9b4a3360b5c6))
- fix ci ([1cd8d6a](https://github.com/loliGothicK/poketistix/commit/1cd8d6a0ca366abb1fb0752334252a45d609c03c))
- fix ci ([b8f796f](https://github.com/loliGothicK/poketistix/commit/b8f796f89b8fa00bbb4422e0692c376a4eb4b755))
- PMX-21 [damage-calc] ([446af7b](https://github.com/loliGothicK/poketistix/commit/446af7be985b9e9b695f071243326bc748683b96))

## [0.4.0](https://github.com/loliGothicK/poketistix/compare/app-v0.3.1...app-v0.4.0) (2026-08-01)

### Features

- FTS ([7b3589b](https://github.com/loliGothicK/poketistix/commit/7b3589b1ac4761f6016d1d6c1706e542e6c239c8))
- more i18n ([5f399d1](https://github.com/loliGothicK/poketistix/commit/5f399d10ccfcb5148cf0c7ff5e033019a25da807))
- more i18n ([1cf5525](https://github.com/loliGothicK/poketistix/commit/1cf552522b6fb8b93f9f541c83b05e086a2118bb))
- PMX-20 [docs] ドキュメントを書く ([97b65be](https://github.com/loliGothicK/poketistix/commit/97b65beddacdbf19d4bf9593dadfb9fd2bcbbf84))

### Bug Fixes

- appbar ([f0f3736](https://github.com/loliGothicK/poketistix/commit/f0f37369e4dfd38b7a6d5a547e579bde62bf97cd))
- AuthButton ([e9c9d48](https://github.com/loliGothicK/poketistix/commit/e9c9d48b371c54d6e106aeac5eeeecbfecf7fcec))
- damage-calc ([6a7040b](https://github.com/loliGothicK/poketistix/commit/6a7040bed4049f846b7e2e15ba07e6de4443350d))
- damage-calc UX ([1e0c107](https://github.com/loliGothicK/poketistix/commit/1e0c1075330637963560289230af46df22b48885))
- damage-calc UX ([0e31fb7](https://github.com/loliGothicK/poketistix/commit/0e31fb7483b9b1ecaa7ffeb8b207aa7aa134334b))
- damage-calc UX ([27d36a6](https://github.com/loliGothicK/poketistix/commit/27d36a6d96596ab0b340b3f3c77c29fe4a46414b))
- damage-calc UX ([39af96e](https://github.com/loliGothicK/poketistix/commit/39af96e1c94e8dd1cf76b5b0ca35b5647d42b0b6))
- document ([2d39194](https://github.com/loliGothicK/poketistix/commit/2d39194152cde60bfb9a19c4d0060ec0688d0ef7))
- documents ([bea83b1](https://github.com/loliGothicK/poketistix/commit/bea83b129516738a797ed6c66bd8d8c28df8ef38))
- documents ([c3d989e](https://github.com/loliGothicK/poketistix/commit/c3d989e198f1d551c9dd50f5e09aa3f1a58dd35a))
- documents ([d8de504](https://github.com/loliGothicK/poketistix/commit/d8de50429003fdcdcc0f57c64153220c50a44a6c))
- documents ([d7d4a86](https://github.com/loliGothicK/poketistix/commit/d7d4a86b2afd1f9f057f196744260499fa8932cc))
- hp bar ([5e074c4](https://github.com/loliGothicK/poketistix/commit/5e074c435705fa0b2d44e19777098b4c85527262))
- more more i18n ([9c7bc2c](https://github.com/loliGothicK/poketistix/commit/9c7bc2c10370167ef17ef2a5957606982c56ffbf))
- more more i18n ([b854ed6](https://github.com/loliGothicK/poketistix/commit/b854ed6f9f5aa8746067c3994c1b0914bea00d88))
- more more i18n ([c369f47](https://github.com/loliGothicK/poketistix/commit/c369f476249c46da8627db09bce653f9941f853b))
- normalise ([d8c0ff2](https://github.com/loliGothicK/poketistix/commit/d8c0ff24aab1bbbd1a4492d3e7927a85f1b66606))
- PMX-16 [overall] returnEmptyString: true ([347fe04](https://github.com/loliGothicK/poketistix/commit/347fe04f72f87da29dec1b53c51ed3aa1243744f))
- PMX-17 [overall] ポケモンを削除したときに一瞬だけ「pokemon.unknownを削除しますか」という Dialog がでる ([b620227](https://github.com/loliGothicK/poketistix/commit/b6202273c94fdab03d35b4b0362152516e9c18e1))
- PMX-19 [team-builder] Link miss mega-stone of Pokémon with M-B ([695ce79](https://github.com/loliGothicK/poketistix/commit/695ce79f24648b3a862df7bb1fe4c134a6520b28))
- PMX-21 ([328c084](https://github.com/loliGothicK/poketistix/commit/328c08474943db23a8ab5e073e27b386a1411cf8))
- PMX-21 ([fb88ecd](https://github.com/loliGothicK/poketistix/commit/fb88ecd679a39129c15eec4b03a01a3c28467997))
- PMX-21 ([5d3f437](https://github.com/loliGothicK/poketistix/commit/5d3f437c3d0e8f94c1e22895a7657de0bfff0087))
- PMX-21 ([2d36dae](https://github.com/loliGothicK/poketistix/commit/2d36dae5e877eed8c02b06b177cf4956bd3a67cf))
- PMX-21 [damage-calc] 威力変動 ([1dc3a5f](https://github.com/loliGothicK/poketistix/commit/1dc3a5fc8ee807589589153c07df434da91a1b79))
- PMX-22 [damage-calc] gravity ([bbf91cc](https://github.com/loliGothicK/poketistix/commit/bbf91cc70526c6defd982b4e867301a4b7ea2750))
- PMX-24 [team-builder] メガ進化ボタンを押すとポケモン変更がトリガーされる ([d64dfb2](https://github.com/loliGothicK/poketistix/commit/d64dfb24e19830c7180f484930d0ea61e17db379))
- spacing ([d7bc696](https://github.com/loliGothicK/poketistix/commit/d7bc69660a03693c8bed3b4d7043c36b3691f603))
- top page ([f8c028d](https://github.com/loliGothicK/poketistix/commit/f8c028dedd11bbdc4857b61ca5e856546e75f501))
- trans ([018b001](https://github.com/loliGothicK/poketistix/commit/018b0011e9254e3a8404e7c732bc9f289cf59939))

## [0.3.1](https://github.com/loliGothicK/poketistix/compare/app-v0.3.0...app-v0.3.1) (2026-07-28)

### Bug Fixes

- i18n in training ([6554f5a](https://github.com/loliGothicK/poketistix.mitama.iomit/6554f5a774b2995a0816928744dfcd9f1904fad8))
- PMX-11 [team-builder] 性格を選択できない ([f4fc25b](https://github.com/loliGothicK/poketistix.mitama.iomit/f4fc25b7d9d6066f96e215f82565bf303d5463e7))
- PMX-2 ([eb978c5](https://github.com/loliGothicK/poketistix.mitama.iomit/eb978c54188d570852cac02e8a5b163eae568fb1))
- PMX-3 [damage-calc] ダメージ計算でこだわりはちまき/メガネが存在する ([183c8c9](https://github.com/loliGothicK/poketistix.mitama.iomit/183c8c942f218bb8282016a96cffd52139315670))
- PMX-5 [damage-calc] 数値の入力が backspace で消す時に挙動がおかしい ([e82396e](https://github.com/loliGothicK/poketistix.mitama.iomit/e82396e85360cd57066dc4343d48a5570e86ee9b))
- share ([87a85e0](https://github.com/loliGothicK/poketistix.mitama.iomit/87a85e09271036aa58658b89b37792192e5a2aa9))

## [0.3.0](https://github.com/loliGothicK/poketistix.mitama.iopare/app-v0.2.0...app-v0.3.0) (2026-07-27)

### Features

- ??? ([4d5bf47](https://github.com/loliGothicK/poketistix.mitama.iomit/4d5bf47e05f4826a0fb66352062df3b43195b16a))
- ??? ([1886211](https://github.com/loliGothicK/poketistix.mitama.iomit/1886211e6548131cc725162f3286d2f3a54a225f))
- ??? ([43e29d7](https://github.com/loliGothicK/poketistix.mitama.iomit/43e29d74baa1e28f42352405cfdf98541b63c0f1))
- **dashboard:** add dashboard feature with SQL editor and visualizers ([df0c4e3](https://github.com/loliGothicK/poketistix.mitama.iomit/df0c4e3e1eaa5be9c13fd9ea3f7e61ee1aa8e98d))
- **dashboard:** add dashboard page and widgets ([1e5a3d7](https://github.com/loliGothicK/poketistix.mitama.iomit/1e5a3d7de4bf7f6413a9716793d438e557750fc7))
- **dashboard:** resizable and grid appearance ([a479052](https://github.com/loliGothicK/poketistix.mitama.iomit/a4790527391b9b67dde9da47731c050b54dbef29))
- more metadata ([3f9bb44](https://github.com/loliGothicK/poketistix.mitama.iomit/3f9bb440df38300d75e7741c43dda2db196d6ad8))

### Bug Fixes

- **auth:** fix double login problem ([64d738d](https://github.com/loliGothicK/poketistix.mitama.iomit/64d738d13ef4165359daa0a6edfb00d0a81d071e))
- **auth:** fix fp-ts imports ([e1ac1d7](https://github.com/loliGothicK/poketistix.mitama.iomit/e1ac1d786417f4ef45a6d464f9f0f581125d7264))
- **auth:** fix handle ([ad15a20](https://github.com/loliGothicK/poketistix.mitama.iomit/ad15a200ae6f764bc15f1e13936da8acc5770e4f))
- change pokemon ([9c8abcb](https://github.com/loliGothicK/poketistix.mitama.iomit/9c8abcb0d9e0de46070fcd3e8361b6024bf492a7))
- CI ([7a93256](https://github.com/loliGothicK/poketistix.mitama.iomit/7a932562298a2c4d06af1b1af059278ad11ba767))
- CI ([26ee0a8](https://github.com/loliGothicK/poketistix.mitama.iomit/26ee0a870e95acfa33bcba64da587eb8909ca134))
- **ci:** release-please ([3068e9c](https://github.com/loliGothicK/poketistix.mitama.iomit/3068e9c1a9defa7809bbff25ee1a8db6d02128aa))
- **database:** enable RLS for shared_team ([323213a](https://github.com/loliGothicK/poketistix.mitama.iomit/323213ac77be951216097cdac7dedba6e8b6e183))
- dedup moves in drawer ([bda36b6](https://github.com/loliGothicK/poketistix.mitama.iomit/bda36b60d21122650756619d799960ef553d5b2f))
- i18n in training ([cb91080](https://github.com/loliGothicK/poketistix.mitama.iomit/cb910808a467902f2390dcb14c834c0ff64d74db))
- item slug ([272154f](https://github.com/loliGothicK/poketistix.mitama.iomit/272154f65e9da0b8850ed48aa309a2a1efad09b0))
- **renponsive:** fix battle records ([94585bb](https://github.com/loliGothicK/poketistix.mitama.iomit/94585bb3131bd3b5893466ca7a88202e9fa67919))
- **renponsive:** fix merge dialog ([b19a659](https://github.com/loliGothicK/poketistix.mitama.iomit/b19a659db7dce883a00746b3426727e6be9ba774))
- **renponsive:** fix training ([f6547b9](https://github.com/loliGothicK/poketistix.mitama.iomit/f6547b9360611c2a4db878cd78a74b9f07304778))
- **renponsive:** fix training ([c941fed](https://github.com/loliGothicK/poketistix.mitama.iomit/c941feda139360d81aaafb41ab2741367ad65988))
