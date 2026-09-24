import { describe, expect, it } from "vitest";
import { matchSearchText, normalizeForSearch, toHiraganaForSearch } from "./text";

describe("normalizeForSearch", () => {
  it("converts Katakana to Hiragana", () => {
    expect(normalizeForSearch("ピカチュウ")).toBe("ぴかちゅう");
    expect(normalizeForSearch("リザードン")).toBe("りざーどん");
  });

  it("leaves Hiragana unchanged", () => {
    expect(normalizeForSearch("ぴかちゅう")).toBe("ぴかちゅう");
  });

  it("converts full-width alphanumeric to half-width lowercase", () => {
    expect(normalizeForSearch("ＰＩＫＡ１２３")).toBe("pika123");
  });

  it("trims whitespace", () => {
    expect(normalizeForSearch("  ピカチュウ  ")).toBe("ぴかちゅう");
  });
});

describe("toHiraganaForSearch", () => {
  it("converts Katakana to Hiragana preserving long vowel marks", () => {
    expect(toHiraganaForSearch("リザードン")).toBe("りざーどん");
    expect(toHiraganaForSearch("サーフゴー")).toBe("さーふごー");
  });

  it("converts Romaji to Hiragana", () => {
    expect(toHiraganaForSearch("pikachu")).toBe("ぴかちゅ");
    expect(toHiraganaForSearch("pikachuu")).toBe("ぴかちゅう");
    expect(toHiraganaForSearch("gaburiasu")).toBe("がぶりあす");
    expect(toHiraganaForSearch("gabu")).toBe("がぶ");
    expect(toHiraganaForSearch("riza-don")).toBe("りざーどん");
    expect(toHiraganaForSearch("rizadon")).toBe("りざどん");
  });
});

describe("matchSearchText", () => {
  describe("Japanese mode (isJapanese: true)", () => {
    const charizard = "リザードン";
    const garchomp = "ガブリアス";
    const gholdengo = "サーフゴー";
    const pikachu = "ピカチュウ";
    const urshifu = "ウーラオス れんげきのかた";
    const abomasnow = "ユキノオー";

    it("matches Katakana input against Katakana target", () => {
      expect(matchSearchText(charizard, "リザ", true)).toBe(true);
      expect(matchSearchText(charizard, "リザードン", true)).toBe(true);
      expect(matchSearchText(pikachu, "ピカ", true)).toBe(true);
    });

    it("matches Hiragana input against Katakana target", () => {
      expect(matchSearchText(charizard, "りざ", true)).toBe(true);
      expect(matchSearchText(charizard, "りざーどん", true)).toBe(true);
      expect(matchSearchText(pikachu, "ぴか", true)).toBe(true);
      expect(matchSearchText(pikachu, "ぴかちゅう", true)).toBe(true);
    });

    it("matches Romaji input against Japanese Pokémon names via wanakana", () => {
      // Direct Romaji
      expect(matchSearchText(garchomp, "gabu", true)).toBe(true);
      expect(matchSearchText(garchomp, "gaburiasu", true)).toBe(true);
      expect(matchSearchText(pikachu, "pika", true)).toBe(true);
      expect(matchSearchText(pikachu, "pikachu", true)).toBe(true);
      expect(matchSearchText(pikachu, "pikachuu", true)).toBe(true);

      // Romaji with hyphen long vowels
      expect(matchSearchText(charizard, "riza-don", true)).toBe(true);
      expect(matchSearchText(gholdengo, "sa-fugo-", true)).toBe(true);

      // Romaji without hyphen (e.g. rizadon matching リザードン)
      expect(matchSearchText(charizard, "rizadon", true)).toBe(true);
      expect(matchSearchText(gholdengo, "safugo", true)).toBe(true);
    });

    it("matches Hiragana form names (e.g. れんげきのかた)", () => {
      expect(matchSearchText(urshifu, "れんげき", true)).toBe(true);
      expect(matchSearchText(urshifu, "rengeki", true)).toBe(true);
      expect(matchSearchText(urshifu, "u-raosu", true)).toBe(true);
      expect(matchSearchText(urshifu, "uraosu", true)).toBe(true);
    });

    it("does not match false positives from English names (e.g. あーぼ does not match ユキノオー)", () => {
      expect(matchSearchText(abomasnow, "あーぼ", true)).toBe(false);
      expect(matchSearchText(abomasnow, "あぼ", true)).toBe(false);
      expect(matchSearchText(abomasnow, "yukino", true)).toBe(true);
      expect(matchSearchText(abomasnow, "ゆき", true)).toBe(true);
    });

    it("does not match unrelated queries", () => {
      expect(matchSearchText(charizard, "pika", true)).toBe(false);
      expect(matchSearchText(charizard, "ピカ", true)).toBe(false);
      expect(matchSearchText(charizard, "gabu", true)).toBe(false);
    });
  });

  describe("English mode (isJapanese: false)", () => {
    const charizard = "charizard Charizard";

    it("matches English text case-insensitively", () => {
      expect(matchSearchText(charizard, "char", false)).toBe(true);
      expect(matchSearchText(charizard, "CHARIZARD", false)).toBe(true);
      expect(matchSearchText(charizard, "zard", false)).toBe(true);
    });

    it("does not match non-matching English text", () => {
      expect(matchSearchText(charizard, "pika", false)).toBe(false);
    });
  });
});
