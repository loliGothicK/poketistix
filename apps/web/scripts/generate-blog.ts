import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const changelogPath = path.resolve(__dirname, "../CHANGELOG.md");
const blogBaseDir = path.resolve(__dirname, "../content/blog");

const categoryHeaders: Record<string, { ja: string; en: string }> = {
  "major changes": { ja: "### 🚀 メジャーアップデート", en: "### 🚀 Major Updates" },
  "minor changes": { ja: "### ✨ 新機能・変更点", en: "### ✨ Minor Changes" },
  "patch changes": { ja: "### 🐛 パッチ・修正", en: "### 🐛 Patch Changes" },
  features: { ja: "### ✨ 新機能", en: "### ✨ Features" },
  "bug fixes": { ja: "### 🐛 バグ修正", en: "### 🐛 Bug Fixes" },
};

export function normalizeCategory(title: string): string {
  return title
    .replace(/^[\p{Emoji}\p{Extended_Pictographic}\uFE0F\s]+/u, "")
    .trim()
    .toLowerCase();
}

export type ParsedRelease = {
  readonly version: string;
  readonly dateStr: string;
  readonly jaContent: string;
  readonly enContent: string;
};

type Entry = {
  commitPrefix: string;
  ja: string[];
  en: string[];
  both: string[];
};

type Category = {
  rawTitle: string;
  entries: Entry[];
};

const LANG_TAG_REGEX =
  /^(?:#{2,4}\s*|\[|<!--\s*|\b)(ja|japanese|en|english)(?:\]:?|:|\s*-->|\b)\s*$/i;
const INLINE_LANG_TAG_REGEX = /^(?:\[|<!--\s*)(ja|japanese|en|english)(?:\]:?|\s*-->)\s*(.*)$/i;

function parseInlineDualLang(text: string): { ja?: string; en?: string } | null {
  const jaFirst = text.match(
    /(?:\[|<!--\s*)(?:ja|japanese)(?:\]:?|\s*-->)\s*(.*?)\s*(?:\[|<!--\s*)(?:en|english)(?:\]:?|\s*-->)\s*(.*)/i,
  );
  if (jaFirst) {
    return { ja: jaFirst[1].trim(), en: jaFirst[2].trim() };
  }
  const enFirst = text.match(
    /(?:\[|<!--\s*)(?:en|english)(?:\]:?|\s*-->)\s*(.*?)\s*(?:\[|<!--\s*)(?:ja|japanese)(?:\]:?|\s*-->)\s*(.*)/i,
  );
  if (enFirst) {
    return { ja: enFirst[2].trim(), en: enFirst[1].trim() };
  }
  return null;
}

export function splitSummary(summary: string): { en: string; ja: string } {
  const trimmed = (summary || "").trim();
  if (!trimmed) return { en: "", ja: "" };

  const lines = trimmed.split("\n");
  const jaLines: string[] = [];
  const enLines: string[] = [];
  let currentLang: "ja" | "en" | "both" = "both";
  let foundLangTag = false;

  for (const line of lines) {
    const lTrim = line.trim();

    const headingMatch = lTrim.match(LANG_TAG_REGEX);
    if (headingMatch) {
      foundLangTag = true;
      currentLang = headingMatch[1].toLowerCase().startsWith("ja") ? "ja" : "en";
      continue;
    }

    const dual = parseInlineDualLang(lTrim);
    if (dual) {
      foundLangTag = true;
      if (dual.ja) jaLines.push(dual.ja);
      if (dual.en) enLines.push(dual.en);
      continue;
    }

    const singleMatch = lTrim.match(INLINE_LANG_TAG_REGEX);
    if (singleMatch) {
      foundLangTag = true;
      currentLang = singleMatch[1].toLowerCase().startsWith("ja") ? "ja" : "en";
      const rest = singleMatch[2].trim();
      if (rest) {
        if (currentLang === "ja") jaLines.push(rest);
        else enLines.push(rest);
      }
      continue;
    }

    if (currentLang === "ja") {
      jaLines.push(line);
    } else if (currentLang === "en") {
      enLines.push(line);
    } else {
      jaLines.push(line);
      enLines.push(line);
    }
  }

  if (!foundLangTag) {
    return { en: trimmed, ja: trimmed };
  }

  const en = enLines.join("\n").trim();
  const ja = jaLines.join("\n").trim();

  return {
    en: en || ja || trimmed,
    ja: ja || en || trimmed,
  };
}

export function parseChangelogSection(sectionText: string): { ja: string; en: string } {
  const lines = sectionText.split("\n");
  const categories: Category[] = [];

  let activeCategory: Category | null = null;
  let activeEntry: Entry | null = null;
  let activeLang: "ja" | "en" | "both" = "both";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for category headings like "### Minor Changes", "### Features"
    // Must not be language tags like "### ja" or "### en"
    const isCategoryHeading =
      /^###\s+(?!ja\b|en\b|japanese\b|english\b).+/i.test(trimmed) &&
      !/^(?:#{2,4})\s*(ja|japanese|en|english)\s*$/i.test(trimmed);

    if (isCategoryHeading) {
      activeCategory = { rawTitle: trimmed.replace(/^###\s+/, "").trim(), entries: [] };
      categories.push(activeCategory);
      activeEntry = null;
      activeLang = "both";
      continue;
    }

    if (!activeCategory) {
      continue;
    }

    // Top-level bullet starts at the beginning of the line without indentation: e.g. "- 5b8aa0d: ..."
    const isTopLevelBullet = /^-\s+/.test(line);
    if (isTopLevelBullet) {
      activeEntry = { commitPrefix: "", ja: [], en: [], both: [] };
      activeCategory.entries.push(activeEntry);
      activeLang = "both";

      // Match commit/PR prefix like "- 5b8aa0d: ", "- [#123](url): ", or changelog-github format: "- [#123](url) [`5b8aa0d`](url) Thanks [@user]! - "
      const commitPrefixRegex =
        /^(-\s*(?:(?:\[.*?\]\(.*?\)|`?[a-f0-9]{7,40}`?|#\d+|Thanks\s+[^!\n]+!?|\s+)+(?::|-))\s*)/i;
      const prefixMatch = trimmed.match(commitPrefixRegex);

      if (prefixMatch) {
        activeEntry.commitPrefix = prefixMatch[1].trim();
        const afterPrefix = trimmed.slice(prefixMatch[1].length).trim();

        const dual = parseInlineDualLang(afterPrefix);
        if (dual) {
          if (dual.ja) activeEntry.ja.push(dual.ja);
          if (dual.en) activeEntry.en.push(dual.en);
          continue;
        }

        const headingMatch = afterPrefix.match(LANG_TAG_REGEX);
        const inlineMatch = afterPrefix.match(INLINE_LANG_TAG_REGEX);

        if (headingMatch) {
          const tag = headingMatch[1].toLowerCase();
          activeLang = tag.startsWith("ja") ? "ja" : "en";
        } else if (inlineMatch) {
          const tag = inlineMatch[1].toLowerCase();
          activeLang = tag.startsWith("ja") ? "ja" : "en";
          const content = inlineMatch[2].trim();
          if (content) {
            if (activeLang === "ja") activeEntry.ja.push(content);
            else activeEntry.en.push(content);
          }
        } else if (afterPrefix) {
          activeEntry.both.push(afterPrefix);
        }
        continue;
      }

      // No commit/PR prefix found; check if bullet line starts with language tag
      const plainBulletText = trimmed.replace(/^-\s+/, "").trim();
      if (plainBulletText) {
        const dual = parseInlineDualLang(plainBulletText);
        if (dual) {
          if (dual.ja) activeEntry.ja.push(dual.ja);
          if (dual.en) activeEntry.en.push(dual.en);
          continue;
        }

        const headingMatch = plainBulletText.match(LANG_TAG_REGEX);
        const inlineMatch = plainBulletText.match(INLINE_LANG_TAG_REGEX);

        if (headingMatch) {
          const tag = headingMatch[1].toLowerCase();
          activeLang = tag.startsWith("ja") ? "ja" : "en";
        } else if (inlineMatch) {
          const tag = inlineMatch[1].toLowerCase();
          activeLang = tag.startsWith("ja") ? "ja" : "en";
          const content = inlineMatch[2].trim();
          if (content) {
            if (activeLang === "ja") activeEntry.ja.push(content);
            else activeEntry.en.push(content);
          }
        } else {
          activeEntry.both.push(plainBulletText);
        }
      }
      continue;
    }

    const dual = parseInlineDualLang(trimmed);
    if (dual && activeEntry) {
      if (dual.ja) activeEntry.ja.push(dual.ja);
      if (dual.en) activeEntry.en.push(dual.en);
      continue;
    }

    // Language sub-heading inside an active entry (e.g. "  [en]", "  ### ja", "  ja:")
    const langHeadingMatch = trimmed.match(LANG_TAG_REGEX);
    const inlineMatch = trimmed.match(INLINE_LANG_TAG_REGEX);

    if (langHeadingMatch && activeEntry) {
      const tag = langHeadingMatch[1].toLowerCase();
      activeLang = tag.startsWith("ja") ? "ja" : "en";
      continue;
    }

    if (inlineMatch && activeEntry) {
      const tag = inlineMatch[1].toLowerCase();
      activeLang = tag.startsWith("ja") ? "ja" : "en";
      const content = inlineMatch[2].trim();
      if (content) {
        if (activeLang === "ja") activeEntry.ja.push(content);
        else activeEntry.en.push(content);
      }
      continue;
    }

    // Regular content lines inside active entry
    if (activeEntry && trimmed) {
      if (activeLang === "ja") {
        activeEntry.ja.push(trimmed);
      } else if (activeLang === "en") {
        activeEntry.en.push(trimmed);
      } else {
        activeEntry.both.push(trimmed);
      }
    }
  }

  const render = (targetLang: "ja" | "en") => {
    const sections: string[] = [];

    for (const cat of categories) {
      const entryLines: string[] = [];

      for (const entry of cat.entries) {
        let content: string[] = [];
        if (targetLang === "ja") {
          content = entry.ja.length > 0 ? entry.ja : entry.both.length > 0 ? entry.both : entry.en;
        } else {
          content = entry.en.length > 0 ? entry.en : entry.both.length > 0 ? entry.both : entry.ja;
        }

        if (content.length === 0) continue;

        const prefix = entry.commitPrefix ? `${entry.commitPrefix} ` : "- ";
        const firstLine = content[0].replace(/^-\s*/, "");
        entryLines.push(`${prefix}${firstLine}`);

        for (let j = 1; j < content.length; j++) {
          const line = content[j];
          if (line.startsWith("- ")) {
            entryLines.push(`  ${line}`);
          } else {
            entryLines.push(`    ${line}`);
          }
        }
      }

      if (entryLines.length > 0) {
        const key = normalizeCategory(cat.rawTitle);
        const headerConfig = categoryHeaders[key];
        let title: string;
        if (targetLang === "ja") {
          title = headerConfig?.ja ?? `### ${cat.rawTitle}`;
        } else {
          title = headerConfig?.en ?? `### ${cat.rawTitle}`;
        }
        sections.push(`${title}\n\n${entryLines.join("\n")}`);
      }
    }

    return sections.join("\n\n").trim();
  };

  return {
    ja: render("ja"),
    en: render("en"),
  };
}

export function parseChangelog(content: string): ParsedRelease | null {
  const lines = content.split("\n");
  let inLatestRelease = false;
  let releaseHeading = "";
  const releaseNotes: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (!inLatestRelease) {
        inLatestRelease = true;
        releaseHeading = line;
      } else {
        break;
      }
    } else if (inLatestRelease) {
      releaseNotes.push(line);
    }
  }

  if (!releaseHeading) {
    return null;
  }

  const versionMatch = releaseHeading.match(/\[?v?(\d+\.\d+\.\d+)]?/);
  const version = versionMatch ? versionMatch[1] : "unknown";

  const dateMatch = releaseHeading.match(/\((\d{4}-\d{2}-\d{2})\)/);
  const dateStr = dateMatch ? dateMatch[1] : new Date().toISOString().split("T")[0];

  const { ja, en } = parseChangelogSection(releaseNotes.join("\n"));

  return {
    version,
    dateStr,
    jaContent: ja,
    enContent: en,
  };
}

export function createMdx(params: {
  version: string;
  dateStr: string;
  lang: "ja" | "en";
  body: string;
}): string {
  const isJa = params.lang === "ja";
  const title = isJa ? `リリース v${params.version}` : `Release v${params.version}`;
  const description = isJa
    ? `バージョン ${params.version} のリリースノート`
    : `Release notes for version ${params.version}`;

  return `---
title: "${title}"
description: "${description}"
date: "${params.dateStr}"
tags: ["release"]
draft: false
---

${params.body.trim()}
`;
}

export function formatJaStaging(entries: Array<{ type: string; line: string }>): string {
  const sections: Record<string, string[]> = {
    major: [],
    minor: [],
    patch: [],
  };

  for (const entry of entries) {
    const t = entry.type.toLowerCase();
    if (sections[t]) {
      sections[t].push(entry.line);
    } else {
      sections.patch.push(entry.line);
    }
  }

  const output: string[] = [];

  if (sections.major.length > 0) {
    output.push(`### 🚀 メジャーアップデート\n\n${sections.major.join("\n")}`);
  }
  if (sections.minor.length > 0) {
    output.push(`### ✨ 新機能・変更点\n\n${sections.minor.join("\n")}`);
  }
  if (sections.patch.length > 0) {
    output.push(`### 🐛 パッチ・修正\n\n${sections.patch.join("\n")}`);
  }

  return output.join("\n\n").trim();
}

async function main() {
  const content = await fs.readFile(changelogPath, "utf8");
  const parsed = parseChangelog(content);

  if (!parsed) {
    console.log("No release found in CHANGELOG.md");
    return;
  }

  const { version, dateStr, jaContent, enContent } = parsed;
  let jaBody = jaContent;

  const stagingPath = path.resolve(__dirname, "../../.changeset/.changelog-ja-staging.json");
  try {
    const stagingRaw = await fs.readFile(stagingPath, "utf8");
    const stagingEntries = JSON.parse(stagingRaw);
    if (Array.isArray(stagingEntries) && stagingEntries.length > 0) {
      jaBody = formatJaStaging(stagingEntries);
    }
    await fs.unlink(stagingPath);
  } catch {
    // Staging file does not exist, fallback to jaContent parsed from CHANGELOG.md
  }

  const fileName = `${dateStr}-v${version}.mdx`;

  const enMdx = createMdx({ version, dateStr, lang: "en", body: enContent });
  const jaMdx = createMdx({ version, dateStr, lang: "ja", body: jaBody });

  const enDir = path.join(blogBaseDir, "en");
  const jaDir = path.join(blogBaseDir, "ja");

  await fs.mkdir(enDir, { recursive: true });
  await fs.mkdir(jaDir, { recursive: true });

  const enFilePath = path.join(enDir, fileName);
  const jaFilePath = path.join(jaDir, fileName);

  await fs.writeFile(enFilePath, enMdx, "utf8");
  await fs.writeFile(jaFilePath, jaMdx, "utf8");

  console.log(`Generated English blog post at ${enFilePath}`);
  console.log(`Generated Japanese blog post at ${jaFilePath}`);
}

// Only execute main when run directly as a CLI script
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
