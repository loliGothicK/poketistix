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
export function approxFindMyers(
  haystack: string,
  needle: string,
  anchorStart = false,
): ApproxMatch {
  const hay = Array.from(haystack);
  const pat = Array.from(needle);
  const m = pat.length;
  if (m === 0) return { score: 1, end: 0 };

  // 1. 前処理: 各文字が needle のどの位置にあるかをビットマスク化 (Peqテーブル)
  const peq = new Map<string, bigint>();
  for (let i = 0; i < m; i++) {
    const ch = pat[i]!;
    peq.set(ch, (peq.get(ch) ?? 0n) | (1n << BigInt(i)));
  }

  const allOnes = (1n << BigInt(m)) - 1n;
  const highestBit = 1n << BigInt(m - 1);

  // 2. DPの初期状態: 0列目は [0, 1, 2, ..., m] なので、縦の差分は全て +1
  let Pv = allOnes; // +1 の位置を表すビット列
  let Mv = 0n; // -1 の位置を表すビット列
  let currentDistance = m;

  let bestDistance = m;
  let bestEnd = 0;

  // 3. haystack を1文字ずつ走査（内側の i ループが消滅し、ビット演算のみになる）
  for (let j = 1; j <= hay.length; j++) {
    const Eq = peq.get(hay[j - 1]!) ?? 0n;

    const Xv = Eq | Mv;
    // anchorStart が true なら 0行目の横差分が +1 になるよう調整
    const Xh = (((Eq & Pv) + Pv) ^ Pv) | Eq | (anchorStart ? Mv : 0n);

    let Ph = Mv | ~(Xh | Pv);
    let Mh = Pv & Xh;

    // 最終行 (i = m) の横方向の差分を見て、現在の編集距離を更新
    if ((Ph & highestBit) !== 0n) {
      currentDistance += 1;
    } else if ((Mh & highestBit) !== 0n) {
      currentDistance -= 1;
    }

    // 次の列へ進むために横差分を1ビット左シフト（0行目の境界条件をここで注入）
    // anchorStart = true なら 0行目は毎回 +1 されるため Ph の最下位ビットに 1n を入れる
    // anchorStart = false (Sellers) なら 0行目は常に 0 なので 0n を入れる
    Ph = (Ph << 1n) | (anchorStart ? 1n : 0n);
    Mh = Mh << 1n;

    // 次の列の縦差分 (Pv, Mv) を確定
    Pv = Mh | ~(Xv | Ph);
    Mv = Ph & Xv;

    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestEnd = j;
      if (bestDistance === 0) break; // 完全一致が見つかったら早期終了も可能
    }
  }

  return { score: Math.max(0, 1 - bestDistance / m), end: bestEnd };
}

export const approxFind = approxFindMyers;

/** 2 文字列の類似度 (0..=1)。編集距離を長い方の文字数で正規化する */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(Array.from(a).length, Array.from(b).length);
  if (maxLen === 0) return 1;
  return 1 - charLevenshtein(a, b) / maxLen;
}
