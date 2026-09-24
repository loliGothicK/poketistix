import * as wanakana from "wanakana";

/**
 * Normalizes text for searching.
 * 1. Trims and lowercases.
 * 2. Converts full-width alphanumeric to half-width.
 * 3. Converts Katakana to Hiragana (u30A1-u30F6 -> u3041-u3096).
 */
export function normalizeForSearch(text: string): string {
  if (!text) return "";

  let normalized = text.trim().toLowerCase();

  // Convert full-width alphanumeric to half-width
  normalized = normalized.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) - 0xfee0);
  });

  // Convert Katakana to Hiragana (so Hiragana and Katakana match identically)
  normalized = normalized.replace(/[\u30a1-\u30f6]/g, (match) => {
    const chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });

  return normalized;
}

/**
 * Converts text (including Katakana and Romaji) to Hiragana for search.
 * Preserves long vowel marks (ー).
 */
export function toHiraganaForSearch(text: string): string {
  if (!text) return "";
  const trimmed = text.trim().toLowerCase();
  const halfWidth = trimmed.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0xfee0),
  );
  return wanakana.toHiragana(halfWidth, { convertLongVowelMark: false });
}

/**
 * Matches target text against query text.
 * When isJapanese is true:
 * 1. Matches via normalizeForSearch (handles direct English, exact Katakana/Hiragana).
 * 2. Matches via wanakana.toHiragana (handles Romaji -> Hiragana, e.g. "gabu" -> "がぶ").
 * 3. Matches without long vowel marks / hyphens (e.g. "rizadon" -> "りざどん" matching "リザードン" -> "りざどん").
 */
export function matchSearchText(
  targetText: string,
  queryText: string,
  isJapanese: boolean = false,
): boolean {
  const q = queryText.trim();
  if (!q) return true;
  if (!targetText) return false;

  // 1. Direct case-insensitive / Hiragana-normalized substring match
  if (normalizeForSearch(targetText).includes(normalizeForSearch(q))) {
    return true;
  }

  if (isJapanese) {
    // 2. Hiragana match using wanakana (handles Romaji input)
    const targetKana = toHiraganaForSearch(targetText);
    const queryKana = toHiraganaForSearch(q);
    if (queryKana && targetKana.includes(queryKana)) {
      return true;
    }

    // 3. Match without long vowel marks / hyphens (e.g. "rizadon" vs "リザードン", "safugo" vs "サーフゴー")
    const targetWithoutChouon = targetKana.replace(/[ー−-]/g, "");
    const queryWithoutChouon = queryKana.replace(/[ー−-]/g, "");
    if (queryWithoutChouon && targetWithoutChouon.includes(queryWithoutChouon)) {
      return true;
    }
  }

  return false;
}
