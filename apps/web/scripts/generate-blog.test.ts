import { describe, expect, it } from "vitest";
import {
  createMdx,
  formatJaStaging,
  parseChangelog,
  parseChangelogSection,
  splitSummary,
} from "./generate-blog";

describe("generate-blog", () => {
  it("parses changelog entries with ### ja and ### en headings", () => {
    const changelogText = `
### Minor Changes

- 5b8aa0d: ### ja
  クイズ結果のシェア機能を追加
  - 正解率とタイムの共有
  - OGP画像の自動生成
  ### en
  Add quiz result sharing feature
  - Share accuracy and time
  - Automatically generate OGP images

### Patch Changes

- 1234567: ### ja
  バグ修正
  ### en
  Bug fixes
`;

    const { ja, en } = parseChangelogSection(changelogText);

    expect(ja).toContain("### ✨ 新機能・変更点");
    expect(ja).toContain("- 5b8aa0d: クイズ結果のシェア機能を追加");
    expect(ja).toContain("  - 正解率とタイムの共有");
    expect(ja).toContain("  - OGP画像の自動生成");
    expect(ja).toContain("### 🐛 パッチ・修正");
    expect(ja).toContain("- 1234567: バグ修正");
    expect(ja).not.toContain("Add quiz result sharing feature");

    expect(en).toContain("### ✨ Minor Changes");
    expect(en).toContain("- 5b8aa0d: Add quiz result sharing feature");
    expect(en).toContain("  - Share accuracy and time");
    expect(en).toContain("  - Automatically generate OGP images");
    expect(en).toContain("### 🐛 Patch Changes");
    expect(en).toContain("- 1234567: Bug fixes");
    expect(en).not.toContain("クイズ結果のシェア機能を追加");
  });

  it("parses changelog entries with [ja] and [en] bracket tags", () => {
    const changelogText = `
### Patch Changes

- 5b8aa0d: [ja]
  バグ修正:
  - team builder: ニャオニクスナイトの修正
  [en]
  Fixes:
  - team builder: Fixed Meowsticite bug
`;

    const { ja, en } = parseChangelogSection(changelogText);

    expect(ja).toContain("### 🐛 パッチ・修正");
    expect(ja).toContain("- 5b8aa0d: バグ修正:");
    expect(ja).toContain("  - team builder: ニャオニクスナイトの修正");
    expect(ja).not.toContain("Fixed Meowsticite bug");

    expect(en).toContain("### 🐛 Patch Changes");
    expect(en).toContain("- 5b8aa0d: Fixes:");
    expect(en).toContain("  - team builder: Fixed Meowsticite bug");
    expect(en).not.toContain("ニャオニクスナイトの修正");
  });

  it("parses multiple changeset entries under the same category including changelog-github formatting", () => {
    const multiEntryChangelog = `
### Patch Changes

- [#12](https://github.com/example/pull/12) [\`5b8aa0d\`](https://github.com/example/commit/5b8aa0d) Thanks [@alice]! - [ja]
  バグ修正1:
  - team builder: ニャオニクスナイトの修正
  - team builder: セグレイブナイトの修正
  [en]
  Fixes 1:
  - team builder: Fixed Meowsticite bug
  - team builder: Fixed Baxcalibur bug

- [\`1280e99\`](https://github.com/example/commit/1280e99) Thanks [@bob]! - ### ja
  バグ修正2:
  - damage-calc: きもったまの修正
  ### en
  Fixes 2:
  - damage-calc: Fixed Scrappy bug

- 623d668: [ja] バグ修正3 [en] Fix 3
`;

    const { ja, en } = parseChangelogSection(multiEntryChangelog);

    expect(ja).toContain("### 🐛 パッチ・修正");
    expect(ja).toContain(
      "- [#12](https://github.com/example/pull/12) [`5b8aa0d`](https://github.com/example/commit/5b8aa0d) Thanks [@alice]! - バグ修正1:",
    );
    expect(ja).toContain("  - team builder: ニャオニクスナイトの修正");
    expect(ja).toContain("  - team builder: セグレイブナイトの修正");
    expect(ja).toContain(
      "- [`1280e99`](https://github.com/example/commit/1280e99) Thanks [@bob]! - バグ修正2:",
    );
    expect(ja).toContain("  - damage-calc: きもったまの修正");
    expect(ja).toContain("- 623d668: バグ修正3");
    expect(ja).not.toContain("Fixes 1:");
    expect(ja).not.toContain("Fixes 2:");
    expect(ja).not.toContain("Fix 3");

    expect(en).toContain("### 🐛 Patch Changes");
    expect(en).toContain(
      "- [#12](https://github.com/example/pull/12) [`5b8aa0d`](https://github.com/example/commit/5b8aa0d) Thanks [@alice]! - Fixes 1:",
    );
    expect(en).toContain("  - team builder: Fixed Meowsticite bug");
    expect(en).toContain("  - team builder: Fixed Baxcalibur bug");
    expect(en).toContain(
      "- [`1280e99`](https://github.com/example/commit/1280e99) Thanks [@bob]! - Fixes 2:",
    );
    expect(en).toContain("  - damage-calc: Fixed Scrappy bug");
    expect(en).toContain("- 623d668: Fix 3");
    expect(en).not.toContain("バグ修正1:");
    expect(en).not.toContain("バグ修正2:");
    expect(en).not.toContain("バグ修正3");
  });

  it("handles legacy/single-language changelog by sharing content to both languages", () => {
    const legacyText = `
### Features

- add quizzes ([5b8aa0d](https://github.com/example/commit/5b8aa0d))
- opengraph-image ([1280e99](https://github.com/example/commit/1280e99))

### Bug Fixes

- damage fix ([623d668](https://github.com/example/commit/623d668))
`;

    const { ja, en } = parseChangelogSection(legacyText);

    expect(ja).toContain("### ✨ 新機能");
    expect(ja).toContain("- add quizzes ([5b8aa0d]");
    expect(ja).toContain("### 🐛 バグ修正");
    expect(ja).toContain("- damage fix ([623d668]");

    expect(en).toContain("### ✨ Features");
    expect(en).toContain("- add quizzes ([5b8aa0d]");
    expect(en).toContain("### 🐛 Bug Fixes");
    expect(en).toContain("- damage fix ([623d668]");
  });

  it("extracts version, date, and content from full CHANGELOG.md content", () => {
    const fullChangelog = `# Changelog

## [0.7.0](https://github.com/example/compare/v0.6.0...v0.7.0) (2026-09-20)

### Patch Changes

- abcdef1: ### ja
  テスト修正
  ### en
  Test fix

## [0.6.0](https://github.com/example/compare/v0.5.0...v0.6.0) (2026-08-16)

### Features

- old feature
`;

    const parsed = parseChangelog(fullChangelog);
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe("0.7.0");
    expect(parsed?.dateStr).toBe("2026-09-20");
    expect(parsed?.jaContent).toContain("- abcdef1: テスト修正");
    expect(parsed?.enContent).toContain("- abcdef1: Test fix");
    expect(parsed?.jaContent).not.toContain("old feature");
  });

  it("generates correct MDX frontmatter for each locale", () => {
    const jaMdx = createMdx({
      version: "0.7.0",
      dateStr: "2026-09-20",
      lang: "ja",
      body: "- テスト",
    });
    expect(jaMdx).toContain('title: "リリース v0.7.0"');
    expect(jaMdx).toContain('description: "バージョン 0.7.0 のリリースノート"');
    expect(jaMdx).toContain('date: "2026-09-20"');
    expect(jaMdx).toContain("- テスト");

    const enMdx = createMdx({
      version: "0.7.0",
      dateStr: "2026-09-20",
      lang: "en",
      body: "- test",
    });
    expect(enMdx).toContain('title: "Release v0.7.0"');
    expect(enMdx).toContain('description: "Release notes for version 0.7.0"');
    expect(enMdx).toContain('date: "2026-09-20"');
    expect(enMdx).toContain("- test");
  });

  describe("splitSummary", () => {
    it("splits ### ja and ### en headings cleanly without leaking tags", () => {
      const summary = `
### ja

バグ修正:
- team builder: ニャオニクスナイトの修正
- damage-calc: きもったまの修正

### en

Fixes:
- team builder: Fixed Meowsticite bug
- damage-calc: Fixed Scrappy bug
`;
      const { en, ja } = splitSummary(summary);

      expect(en).toContain("Fixes:");
      expect(en).toContain("- team builder: Fixed Meowsticite bug");
      expect(en).not.toContain("バグ修正:");
      expect(en).not.toContain("### en");
      expect(en).not.toContain("### ja");

      expect(ja).toContain("バグ修正:");
      expect(ja).toContain("- team builder: ニャオニクスナイトの修正");
      expect(ja).not.toContain("Fixes:");
      expect(ja).not.toContain("### en");
      expect(ja).not.toContain("### ja");
    });

    it("splits [ja] and [en] bracket tags cleanly", () => {
      const summary = `
[ja]
バグ修正
[en]
Bug fixes
`;
      const { en, ja } = splitSummary(summary);
      expect(en).toBe("Bug fixes");
      expect(ja).toBe("バグ修正");
    });

    it("splits inline dual-language tags", () => {
      const summary = "[ja] バグ修正3 [en] Fix 3";
      const { en, ja } = splitSummary(summary);
      expect(en).toBe("Fix 3");
      expect(ja).toBe("バグ修正3");
    });

    it("returns the full text for both if no language tags exist", () => {
      const summary = "Fixed a bug with damage calc";
      const { en, ja } = splitSummary(summary);
      expect(en).toBe("Fixed a bug with damage calc");
      expect(ja).toBe("Fixed a bug with damage calc");
    });
  });

  describe("formatJaStaging", () => {
    it("formats staged entries into appropriate Japanese category headings", () => {
      const staged = [
        {
          type: "patch",
          line: "- 1234567: バグ修正A",
        },
        {
          type: "patch",
          line: "- 89abcde: バグ修正B",
        },
        {
          type: "minor",
          line: "- fedcba9: 新機能C",
        },
      ];

      const formatted = formatJaStaging(staged);
      expect(formatted).toContain("### ✨ 新機能・変更点\n\n- fedcba9: 新機能C");
      expect(formatted).toContain(
        "### 🐛 パッチ・修正\n\n- 1234567: バグ修正A\n- 89abcde: バグ修正B",
      );
    });
  });
});
