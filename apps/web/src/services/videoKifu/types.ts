import type { TrainedPokemon } from "@/store/team/team";
import type { BattleResult } from "@/store/battle-record/battleRecord";
import type { LocalizedEntityAlias } from "@/services/ocrText";

export type { LocalizedEntityAlias };

/** 『Pokémon Champions』 (1920x1080 基準) の正規化 ROI 矩形 `[0.0, 1.0]` */
export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 実機キャプチャ (`1920x1080`) からキャリブレーションした標準 ROI レイアウト */
export interface ChampionsRoiLayout {
  readonly p1PreviewCards: readonly [
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
  ];
  readonly p2PreviewCards: readonly [
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
    NormalizedRect,
  ];
  readonly battleHuds: readonly [NormalizedRect, NormalizedRect, NormalizedRect, NormalizedRect];
  readonly hpBars: readonly [NormalizedRect, NormalizedRect, NormalizedRect, NormalizedRect];
  readonly p1HpNumbers: readonly [NormalizedRect, NormalizedRect];
  readonly messageBox: NormalizedRect;
  readonly p1AbilityBanner: NormalizedRect;
  readonly p2AbilityBanner: NormalizedRect;
  readonly weatherFieldBadge: NormalizedRect;
  readonly moveMenuSlots: readonly [NormalizedRect, NormalizedRect, NormalizedRect, NormalizedRect];
  readonly targetSelectionPanel: NormalizedRect;
  readonly communicatingBox: NormalizedRect;
  readonly commandTimerBox: NormalizedRect;
}

export type VideoScreenPhase =
  | "TeamPreview"
  | "VsSplash"
  | "CommandSelect"
  | "MoveSelect"
  | "Communicating"
  | "BattleAnimation"
  | "ResultScreen"
  | "Unknown";

export type HpBarColorZone = "Green" | "Yellow" | "Red" | "Empty" | "Hidden";

export interface HpBarMeasurement {
  readonly visible: boolean;
  readonly percent: number;
  readonly colorZone: HpBarColorZone;
  /** HUD 白文字数値の直接認識結果（P1 は実数値 curr、P2 は 1..100%） */
  readonly exactHp?: number | null;
}

export interface VideoFrameAnalysis {
  readonly timestampMs: number;
  readonly phase: VideoScreenPhase;
  readonly hpBars: readonly [
    HpBarMeasurement,
    HpBarMeasurement,
    HpBarMeasurement,
    HpBarMeasurement,
  ];
  readonly activeP1Slot: 0 | 1 | null;
  readonly selectedMoveIndex: 0 | 1 | 2 | 3 | null;
  readonly selectedTargetSlot?: "p2a" | "p2b" | "p1a" | "p1b" | null;
  readonly previewSelectedP1Indices: readonly number[];
  readonly messageBoxVisible: boolean;
  readonly commandTimerVisible: boolean;
  readonly isMoveTime45: boolean;
  readonly p1AbilityBannerVisible: boolean;
  readonly p2AbilityBannerVisible: boolean;
  readonly messageRoiHash: number;
  readonly abilityRoiHash: number;
  readonly targetSelectionRoiHash?: number;
}

export interface ChampionsEntityDictionaries {
  readonly species: readonly LocalizedEntityAlias[];
  readonly moves: readonly LocalizedEntityAlias[];
  readonly abilities: readonly LocalizedEntityAlias[];
  readonly items: readonly LocalizedEntityAlias[];
}

export interface VideoReviewEventItem {
  readonly id: string;
  readonly turnNumber: number | null;
  readonly lineText: string;
  readonly timestampMs: number | null;
  readonly needsReview: boolean;
}

export interface VideoAnalysisProgress {
  readonly currentTimeSec: number;
  readonly durationSec: number;
  readonly sampledFrames: number;
  readonly detectedTurns: number;
  readonly currentPhase: VideoScreenPhase;
}

export interface VideoKifuAnalysisSummary {
  readonly pbnText: string;
  readonly result: BattleResult;
  readonly detectedRating: number | null;
  readonly p1Selection: readonly number[];
  readonly opponentSlugs: readonly string[];
  readonly opponentLeadSlugs: readonly string[];
  readonly opponentBackSlugs: readonly string[];
  readonly revealedMovesByOpponent: Readonly<Record<string, readonly string[]>>;
  readonly revealedAbilityByOpponent: Readonly<Record<string, string>>;
  readonly reviewEvents: readonly VideoReviewEventItem[];
  readonly turnTimestamps: Readonly<Record<number, number>>;
  readonly totalSampledFrames: number;
  readonly detectedTurnCount: number;
}

export type RoiOcrHint = "species" | "move" | "ability" | "message" | "hp" | "result";

export type RoiOcrProvider = (
  croppedCanvas: HTMLCanvasElement,
  hint: RoiOcrHint,
) => Promise<string | null>;

export interface VideoFrameCaptured {
  readonly rgba: Uint8ClampedArray | Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly timestampMs: number;
}

export interface VideoFrameSource {
  readonly durationSec: number;
  seek(timeSec: number): Promise<void>;
  captureFrame(): Promise<VideoFrameCaptured>;
  recognizeRoiText(rect: NormalizedRect, hint: RoiOcrHint): Promise<string | null>;
  prefetchSchedule?(upcomingTimesSec: readonly number[]): void;
  dispose?(): Promise<void> | void;
}

export interface VideoKifuAnalyzerOptions {
  readonly myTeam: readonly TrainedPokemon[];
  readonly dictionaries: ChampionsEntityDictionaries;
  /** レギュレーション識別子（デフォルト: "M-C"） */
  readonly regulation?: string;
  /** サンプリング間隔（秒）。デフォルトは 1.0 秒 */
  readonly sampleStepSec?: number;
  readonly onProgress?: (progress: VideoAnalysisProgress) => void;
  readonly signal?: AbortSignal;
}

export interface AnalyzeBattleVideoOptions extends VideoKifuAnalyzerOptions {
  readonly file: File;
  readonly ocrProvider?: RoiOcrProvider;
}
