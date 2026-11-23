import { describe, expect, it } from "vitest";
import {
  buildLanguageProbeTimestamps,
  classifyVideoLanguageFromTexts,
  scoreVideoLanguageText,
  toTesseractLanguageArg,
} from "./languageDetection";

describe("languageDetection", () => {
  it("classifies English team preview and battle messages as en even with isolated CJK OCR noise", () => {
    const texts = [
      "Select 4 Pokémon to send into battle.",
      "’ ces 衣 * CN r Co * y",
      "The opposing Indeedee used Psychic!",
    ];
    expect(classifyVideoLanguageFromTexts(texts)).toBe("en");
  });

  it("classifies Japanese team preview and battle messages as ja", () => {
    const texts = [
      "戦うポケモンを 4匹 選出してください",
      "ゲンガー ゲンガナイト",
      "相手の バンギラスの いわなだれ！",
    ];
    expect(classifyVideoLanguageFromTexts(texts)).toBe("ja");
  });

  it("returns null when only noise or short strings are observed", () => {
    expect(classifyVideoLanguageFromTexts(["", "— a Co < っ", "NTN", "4 . A"])).toBeNull();
  });

  it("does not award Japanese score for isolated 1-2 char kana noise", () => {
    const score = scoreVideoLanguageText("ces 衣 っ 放 a");
    expect(score.ja).toBe(0);
  });

  it("builds bounded, deduplicated probe timestamps", () => {
    expect(buildLanguageProbeTimestamps(0)).toEqual([]);
    expect(buildLanguageProbeTimestamps(10)).toEqual([5, 9, 1, 3, 4]);
    const times = buildLanguageProbeTimestamps(600);
    expect(times[0]).toBe(5);
    expect(times[1]).toBe(12);
    expect(new Set(times).size).toBe(times.length);
  });

  it("maps detected language to Tesseract worker language arg", () => {
    expect(toTesseractLanguageArg("ja")).toBe("jpn");
    expect(toTesseractLanguageArg("en")).toBe("eng");
    expect(toTesseractLanguageArg(null)).toEqual(["eng", "jpn"]);
  });
});
