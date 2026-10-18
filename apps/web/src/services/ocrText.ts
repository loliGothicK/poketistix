/**
 * OCR テキストの正規化とファジーマッチングの共有ヘルパー。
 * 動画解析 (`videoKifuAnalyzer`) とバトルログ解析 (`battleLogParser`) の双方から使う。
 */

export interface LocalizedEntityAlias {
  readonly slug: string;
  readonly alias: string;
}

/** OCR トークンの正規化（小文字化、ひらがな→カタカナ統一、記号除去） */
export function normalizeOcrToken(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      out += ch.toLowerCase();
    } else if (code >= 0x3041 && code <= 0x3096) {
      out += String.fromCodePoint(code + 0x60);
    } else if ((code >= 0x30a1 && code <= 0x30fc) || (code >= 0x4e00 && code <= 0x9fff)) {
      out += ch;
    }
  }
  return out;
}

/** レーベンシュタイン編集距離 */
export function charLevenshtein(a: string, b: string): number {
  const aChars = Array.from(a);
  const bChars = Array.from(b);
  const m = aChars.length;
  const n = bChars.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = Array.from({ length: n + 1 }, () => 0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = aChars[i - 1] === bChars[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n] ?? 0;
}

/** ファジー辞書マッチング（最高一致スラッグと信頼度 0..=100 を返す） */
export function fuzzyMatchEntity(
  query: string,
  dictionary: readonly LocalizedEntityAlias[],
): { readonly slug: string; readonly confidence: number } | null {
  const normQ = normalizeOcrToken(query);
  if (!normQ) return null;

  let bestSlug: string | null = null;
  let bestScore = 0;

  for (const entry of dictionary) {
    for (const rawCandidate of [entry.alias, entry.slug]) {
      const candidate = normalizeOcrToken(rawCandidate);
      if (!candidate) continue;
      if (normQ === candidate) {
        return { slug: entry.slug, confidence: 100 };
      }
      const dist = charLevenshtein(normQ, candidate);
      const maxLen = Math.max(Array.from(normQ).length, Array.from(candidate).length);
      if (maxLen === 0) continue;
      const similarity = Math.round(((maxLen - dist) / maxLen) * 100);
      if (similarity > bestScore && similarity >= 55) {
        bestScore = similarity;
        bestSlug = entry.slug;
      }
    }
  }

  return bestSlug ? { slug: bestSlug, confidence: bestScore } : null;
}

export interface ApproxMatch {
  /** `needle` が `haystack` 内でどれだけ一致したか (0..=1, 1 が完全一致) */
  readonly score: number;
  /** 最良一致が終わる位置（`haystack` の文字数単位, 排他的終端） */
  readonly end: number;
}

/**
 * `haystack` の部分文字列として `needle` を編集距離つきで探す (Sellers 法)。
 * OCR の1〜2文字の誤読があっても固定フレーズを検出できる。
 *
 * @param anchorStart `true` のとき `needle` は `haystack` の先頭から始まる必要がある
 */
export function approxFind(haystack: string, needle: string, anchorStart = false): ApproxMatch {
  const hay = Array.from(haystack);
  const pat = Array.from(needle);
  const m = pat.length;
  if (m === 0) return { score: 1, end: 0 };

  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let bestDistance = prev[m] ?? m;
  let bestEnd = 0;

  for (let j = 1; j <= hay.length; j++) {
    const curr: number[] = [anchorStart ? j : 0];
    for (let i = 1; i <= m; i++) {
      const cost = pat[i - 1] === hay[j - 1] ? 0 : 1;
      curr[i] = Math.min((prev[i] ?? 0) + 1, (curr[i - 1] ?? 0) + 1, (prev[i - 1] ?? 0) + cost);
    }
    const distance = curr[m] ?? m;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestEnd = j;
    }
    prev = curr;
  }

  return { score: Math.max(0, 1 - bestDistance / m), end: bestEnd };
}

/** 2 文字列の類似度 (0..=1)。編集距離を長い方の文字数で正規化する */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(Array.from(a).length, Array.from(b).length);
  if (maxLen === 0) return 1;
  return 1 - charLevenshtein(a, b) / maxLen;
}
