import { analyzeVideoFrameRgba } from "./frameSampling";
import { DEFAULT_CHAMPIONS_ROI_LAYOUT, from1080p } from "./roiLayout";
import type {
  DetectedVideoLanguage,
  NormalizedRect,
  RoiOcrHint,
  VideoFrameCaptured,
} from "./types";

/** 見せ合い画面の中央プロンプト（「戦うポケモンを 4匹 選出してください」 / "Select 4 Pokémon to send into battle."） */
export const TEAM_PREVIEW_PROMPT_ROI: NormalizedRect = from1080p(680, 210, 420, 110);

const JA_STRONG_KEYWORDS =
  /ポケモン|選出|バトル|どうする|たたかう|にげる|使[っつ]|繰り?出|くりだ|たおれ|相手の|効果は|守りの体勢|回復|滅び|カウント|能力|下がった|上がった|降参|勝負/u;

const EN_STRONG_KEYWORDS =
  /\b(select|pok[eé]mon|battle|ranked|double|what\s+will|fight|used|opposing|fainted|protected|restored|perish|sent\s+out|withdrew|attack|defense|fell|rose|effective|affect|forfeit)\b/i;

/** 3文字以上連続するひらがな・カタカナ（英語画面の誤読ノイズではまず出現しない） */
const JA_CONTIGUOUS_KANA = /[\u3040-\u309F\u30A0-\u30FF]{3,}/u;

/** 4文字以上の英単語 */
const EN_WORD_GLOBAL = /\b[A-Za-z]{4,}\b/g;

/**
 * 1つの OCR テキストから日本語・英語の確度スコアを算出する。
 */
export function scoreVideoLanguageText(text: string): { ja: number; en: number } {
  const trimmed = text.trim();
  if (trimmed.length < 3) return { ja: 0, en: 0 };

  let ja = 0;
  let en = 0;

  if (JA_STRONG_KEYWORDS.test(trimmed)) {
    ja += 3;
  }
  if (JA_CONTIGUOUS_KANA.test(trimmed)) {
    ja += 2;
  }

  if (EN_STRONG_KEYWORDS.test(trimmed)) {
    en += 3;
  }
  const enWords = trimmed.match(EN_WORD_GLOBAL);
  if (enWords && enWords.length >= 2 && ja === 0) {
    en += 1;
  }

  return { ja, en };
}

/**
 * 複数フレームから取得した OCR テキスト群を集計して動画のゲーム言語を判定する。
 * 判別不能な場合は null（日英混在フォールバック）を返す。
 */
export function classifyVideoLanguageFromTexts(
  texts: readonly string[],
): DetectedVideoLanguage | null {
  let jaTotal = 0;
  let enTotal = 0;

  for (const text of texts) {
    const { ja, en } = scoreVideoLanguageText(text);
    jaTotal += ja;
    enTotal += en;
  }

  if (jaTotal >= 2 && jaTotal > enTotal) return "ja";
  if (enTotal >= 2 && enTotal > jaTotal) return "en";
  return null;
}

/**
 * 事前言語判定のためにサンプリングするタイムスタンプ列（秒）を生成する。
 * 見せ合い画面（冒頭）を優先しつつ、見せ合いカット動画にも対応するため中盤も候補に含める。
 */
export function buildLanguageProbeTimestamps(durationSec: number): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const maxSec = Math.max(0, Math.floor(durationSec) - 1);
  const raw = [
    Math.min(5, maxSec),
    Math.min(12, maxSec),
    Math.round(maxSec * 0.15),
    Math.round(maxSec * 0.3),
    Math.round(maxSec * 0.45),
    Math.round(maxSec * 0.6),
  ];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const s of raw) {
    const clamped = Math.max(0, Math.min(maxSec, s));
    if (!seen.has(clamped)) {
      seen.add(clamped);
      out.push(clamped);
    }
  }
  return out;
}

export interface VideoLanguageProbeSource {
  readonly durationSec: number;
  captureAt(timeSec: number): Promise<VideoFrameCaptured>;
  recognizeRoi(
    captured: VideoFrameCaptured,
    rect: NormalizedRect,
    hint: RoiOcrHint,
  ): Promise<string | null>;
}

/**
 * 本解析の前に数フレームだけ軽量サンプリングして動画のゲーム言語（"ja" / "en"）を判定する。
 * 十分な確度が得られた時点で即座に早期終了する。
 */
export async function detectVideoLanguage(
  source: VideoLanguageProbeSource,
): Promise<DetectedVideoLanguage | null> {
  const probeTimes = buildLanguageProbeTimestamps(source.durationSec);
  const texts: string[] = [];

  for (const sec of probeTimes) {
    const captured = await source.captureAt(sec);
    const analysis = analyzeVideoFrameRgba(
      captured.rgba,
      captured.width,
      captured.height,
      captured.timestampMs,
    );

    if (analysis.phase === "TeamPreview") {
      const promptText = await source.recognizeRoi(captured, TEAM_PREVIEW_PROMPT_ROI, "message");
      if (promptText) texts.push(promptText);
      const cardText = await source.recognizeRoi(
        captured,
        DEFAULT_CHAMPIONS_ROI_LAYOUT.p1PreviewCards[0],
        "species",
      );
      if (cardText) texts.push(cardText);
    } else if (analysis.messageBoxVisible) {
      const msgText = await source.recognizeRoi(
        captured,
        DEFAULT_CHAMPIONS_ROI_LAYOUT.messageBox,
        "message",
      );
      if (msgText) texts.push(msgText);
    }

    const decided = classifyVideoLanguageFromTexts(texts);
    if (decided !== null) {
      return decided;
    }
  }

  return classifyVideoLanguageFromTexts(texts);
}

/**
 * 判定されたゲーム言語に対応する Tesseract.js の言語引数を返す。
 * - 日本語 ("ja"): "jpn" 単体モデル
 * - 英語 ("en"): "eng" 単体モデル
 * - 判別不能 (null): ["eng", "jpn"] にフォールバックする
 */
export function toTesseractLanguageArg(lang: DetectedVideoLanguage): "jpn" | "eng";
export function toTesseractLanguageArg(
  lang: DetectedVideoLanguage | null,
): "jpn" | "eng" | ["eng", "jpn"];
export function toTesseractLanguageArg(
  lang: DetectedVideoLanguage | null,
): "jpn" | "eng" | ["eng", "jpn"] {
  if (lang === "ja") return "jpn";
  if (lang === "en") return "eng";
  return ["eng", "jpn"];
}
