import { createWorker, type Worker as TesseractWorker } from "tesseract.js";
import type {
  NormalizedRect,
  RoiOcrHint,
  RoiOcrProvider,
  VideoFrameCaptured,
  VideoFrameSource,
} from "./types";
import { DEFAULT_CHAMPIONS_ROI_LAYOUT, toPixelBounds } from "./roiLayout";
import { analyzeVideoFrameRgba, computeRoiLumaHash } from "./frameSampling";

/**
 * ブラウザ標準の実験的 `TextDetector` API（存在する場合）または外部注入された `RoiOcrProvider` で
 * 指定した正規化 ROI 領域を 2x コントラスト強調してテキスト抽出する
 */
export async function recognizeRoiText(
  sourceCanvas: HTMLCanvasElement,
  rect: NormalizedRect,
  hint: RoiOcrHint,
  ocrProvider?: RoiOcrProvider,
  tesseractWorker?: TesseractWorker | null,
): Promise<string | null> {
  if (typeof document === "undefined") return null;

  const [x0, y0, x1, y1] = toPixelBounds(rect, sourceCanvas.width, sourceCanvas.height);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = w * 2;
  cropCanvas.height = h * 2;
  const ctx = cropCanvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(sourceCanvas, x0, y0, w, h, 0, 0, cropCanvas.width, cropCanvas.height);

  if (ocrProvider) {
    return ocrProvider(cropCanvas, hint);
  }

  if (tesseractWorker) {
    try {
      const imgData = ctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
        const val =
          luma >= 120 && maxDiff <= 55
            ? Math.max(0, Math.min(255, Math.round(((235 - luma) / 115) * 255)))
            : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
      ctx.putImageData(imgData, 0, 0);

      const ocrPromise = tesseractWorker.recognize(cropCanvas);
      const timeoutPromise = new Promise<{ data: { text: string } }>((_, reject) =>
        setTimeout(() => reject(new Error("OCR timeout")), 2000),
      );
      const ret = await Promise.race([ocrPromise, timeoutPromise]);
      const text = ret.data.text.trim();
      return text || null;
    } catch {
      // Fallback below
    }
  }

  // Browser Shape Detection API (TextDetector) fallback if available in Chromium
  const win = window as unknown as {
    TextDetector?: new () => {
      detect: (source: HTMLCanvasElement) => Promise<readonly { readonly rawValue?: string }[]>;
    };
  };
  if (typeof win.TextDetector === "function") {
    try {
      const detector = new win.TextDetector();
      const blocks = await detector.detect(cropCanvas);
      const joined = blocks
        .map((b) => b.rawValue?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      return joined || null;
    } catch {
      return null;
    }
  }

  return null;
}

interface VideoDecoderSlot {
  readonly video: HTMLVideoElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  busy: boolean;
}

interface PrefetchedFrameEntry {
  readonly timeKeyMs: number;
  readonly promise: Promise<{
    readonly captured: VideoFrameCaptured;
    readonly sourceCanvas: HTMLCanvasElement;
  }>;
}

const VIDEO_DECODER_POOL_SIZE = 4;
const OCR_WORKER_POOL_SIZE = 4;

export class HtmlVideoFrameSource implements VideoFrameSource {
  private objectUrl: string | null = null;
  private slots: VideoDecoderSlot[] = [];
  private currentCanvas: HTMLCanvasElement | null = null;
  private currentCaptured: VideoFrameCaptured | null = null;
  private currentTimeMs = 0;

  private prefetchedFrames = new Map<number, PrefetchedFrameEntry>();
  private speculativeOcrCache = new Map<string, Promise<string | null>>();
  private lastPrefetchedMsgHash = 0;
  private lastPrefetchedBannerHash = 0;

  private tesseractWorkers: TesseractWorker[] = [];
  private nextWorkerIdx = 0;
  private _durationSec = 0;

  constructor(
    private readonly file: File,
    private readonly ocrProvider?: RoiOcrProvider,
  ) {}

  get durationSec(): number {
    return this._durationSec;
  }

  private async createVideoSlot(url: string): Promise<VideoDecoderSlot> {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to load video metadata"));
      };
      const onTimeout = () => {
        cleanup();
        if (Number.isFinite(video.duration) && video.duration > 0) {
          resolve();
        } else {
          reject(new Error("Timeout loading video metadata"));
        }
      };
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("error", onError);
      };

      timer = setTimeout(onTimeout, 10000);
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onError);
      video.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Failed to acquire 2D canvas context");

    return { video, canvas, ctx, busy: false };
  }

  async init(): Promise<void> {
    this.objectUrl = URL.createObjectURL(this.file);

    // 1本目のデコーダでメタデータと duration を確実に取得
    const primarySlot = await this.createVideoSlot(this.objectUrl);
    this.slots.push(primarySlot);
    this._durationSec =
      Number.isFinite(primarySlot.video.duration) && primarySlot.video.duration > 0
        ? primarySlot.video.duration
        : 0;

    // 残りのデコーダスロット（3本）と Tesseract Worker Pool（4本）を並列で初期化
    const extraSlotsPromise = Promise.all(
      Array.from({ length: VIDEO_DECODER_POOL_SIZE - 1 }, () =>
        this.createVideoSlot(this.objectUrl!).catch(() => null),
      ),
    );

    const ocrPoolPromise =
      !this.ocrProvider && typeof window !== "undefined"
        ? (async () => {
            try {
              const workerPromises = Array.from({ length: OCR_WORKER_POOL_SIZE }, () =>
                createWorker("eng"),
              );
              const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 6000));
              return await Promise.race([Promise.all(workerPromises), timeoutPromise]);
            } catch (err) {
              console.warn("Could not start Tesseract workers:", err);
              return null;
            }
          })()
        : Promise.resolve(null);

    const [extraSlots, workers] = await Promise.all([extraSlotsPromise, ocrPoolPromise]);
    for (const s of extraSlots) {
      if (s) this.slots.push(s);
    }
    if (workers) {
      this.tesseractWorkers = workers;
    }
  }

  private seekVideoElement(video: HTMLVideoElement, targetSec: number): Promise<void> {
    const target = Math.min(this._durationSec, Math.max(0, targetSec));
    if (Math.abs(video.currentTime - target) < 0.05 && video.readyState >= 2) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Video seek failed at ${targetSec}s`));
      };
      const onTimeout = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };
      timer = setTimeout(onTimeout, 2000);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      video.currentTime = target;
    });
  }

  private triggerSpeculativeOcrForFrame(
    captured: VideoFrameCaptured,
    snapshotCanvas: HTMLCanvasElement,
  ): void {
    const analysis = analyzeVideoFrameRgba(
      captured.rgba,
      captured.width,
      captured.height,
      captured.timestampMs,
    );

    // メッセージ枠に新しいハッシュが出現していれば、メインループ到達前に裏でOCRを開始
    if (
      analysis.messageBoxVisible &&
      analysis.messageRoiHash !== 0 &&
      analysis.messageRoiHash !== this.lastPrefetchedMsgHash
    ) {
      this.lastPrefetchedMsgHash = analysis.messageRoiHash;
      const rect = DEFAULT_CHAMPIONS_ROI_LAYOUT.messageBox;
      const cacheKey = `msg:${analysis.messageRoiHash}`;
      if (!this.speculativeOcrCache.has(cacheKey)) {
        const worker =
          this.tesseractWorkers.length > 0
            ? this.tesseractWorkers[this.nextWorkerIdx++ % this.tesseractWorkers.length]
            : null;
        this.speculativeOcrCache.set(
          cacheKey,
          recognizeRoiText(snapshotCanvas, rect, "message", this.ocrProvider, worker),
        );
      }
    }

    // バナーに新しいハッシュが出現していれば、同様に裏でOCRを開始
    if (
      (analysis.p1AbilityBannerVisible || analysis.p2AbilityBannerVisible) &&
      analysis.abilityRoiHash !== 0 &&
      analysis.abilityRoiHash !== this.lastPrefetchedBannerHash
    ) {
      this.lastPrefetchedBannerHash = analysis.abilityRoiHash;
      const side = analysis.p1AbilityBannerVisible ? "p1" : "p2";
      const rect =
        side === "p1"
          ? DEFAULT_CHAMPIONS_ROI_LAYOUT.p1AbilityBanner
          : DEFAULT_CHAMPIONS_ROI_LAYOUT.p2AbilityBanner;
      const cacheKey = `ab:${side}:${analysis.abilityRoiHash}`;
      if (!this.speculativeOcrCache.has(cacheKey)) {
        const worker =
          this.tesseractWorkers.length > 0
            ? this.tesseractWorkers[this.nextWorkerIdx++ % this.tesseractWorkers.length]
            : null;
        this.speculativeOcrCache.set(
          cacheKey,
          recognizeRoiText(snapshotCanvas, rect, "ability", this.ocrProvider, worker),
        );
      }
    }
  }

  prefetchSchedule(upcomingTimesSec: readonly number[]): void {
    // 過去の不要なプリフェッチエントリを掃除してメモリリークを防ぐ
    for (const key of this.prefetchedFrames.keys()) {
      if (key < this.currentTimeMs) {
        this.prefetchedFrames.delete(key);
      }
    }
    if (this.speculativeOcrCache.size > 64) {
      const firstKey = this.speculativeOcrCache.keys().next().value;
      if (firstKey !== undefined) this.speculativeOcrCache.delete(firstKey);
    }

    for (const tSec of upcomingTimesSec) {
      if (tSec > this._durationSec) continue;
      const timeKeyMs = Math.round(tSec * 1000);
      if (this.prefetchedFrames.has(timeKeyMs)) continue;

      const freeSlot = this.slots.find((s) => !s.busy);
      if (!freeSlot) break;

      freeSlot.busy = true;
      const promise = (async () => {
        try {
          await this.seekVideoElement(freeSlot.video, tSec);
          // 次のプリフェッチで freeSlot.canvas が上書きされても大丈夫なよう、独立したCanvasにコピー
          const snapCanvas = document.createElement("canvas");
          snapCanvas.width = freeSlot.canvas.width;
          snapCanvas.height = freeSlot.canvas.height;
          const snapCtx = snapCanvas.getContext("2d", { willReadFrequently: true })!;
          snapCtx.drawImage(freeSlot.video, 0, 0, snapCanvas.width, snapCanvas.height);
          const imgData = snapCtx.getImageData(0, 0, snapCanvas.width, snapCanvas.height);
          const captured: VideoFrameCaptured = {
            rgba: imgData.data,
            width: snapCanvas.width,
            height: snapCanvas.height,
            timestampMs: Math.round(freeSlot.video.currentTime * 1000),
          };
          this.triggerSpeculativeOcrForFrame(captured, snapCanvas);
          return { captured, sourceCanvas: snapCanvas };
        } finally {
          freeSlot.busy = false;
        }
      })();

      this.prefetchedFrames.set(timeKeyMs, { timeKeyMs, promise });
    }
  }

  async seek(timeSec: number): Promise<void> {
    if (this.slots.length === 0) return;
    const timeKeyMs = Math.round(timeSec * 1000);
    this.currentTimeMs = timeKeyMs;

    // プリフェッチ済みのフレームがあればそれを受け取る（シーク待ちほぼ 0ms）
    const prefetched = this.prefetchedFrames.get(timeKeyMs);
    if (prefetched) {
      this.prefetchedFrames.delete(timeKeyMs);
      const { captured, sourceCanvas } = await prefetched.promise;
      this.currentCaptured = captured;
      this.currentCanvas = sourceCanvas;
      return;
    }

    // プリフェッチになければ空きスロット（または0番スロット）で直接シーク
    const slot = this.slots.find((s) => !s.busy) ?? this.slots[0]!;
    slot.busy = true;
    try {
      await this.seekVideoElement(slot.video, timeSec);
      slot.ctx.drawImage(slot.video, 0, 0, slot.canvas.width, slot.canvas.height);
      const imgData = slot.ctx.getImageData(0, 0, slot.canvas.width, slot.canvas.height);
      this.currentCaptured = {
        rgba: imgData.data,
        width: slot.canvas.width,
        height: slot.canvas.height,
        timestampMs: Math.round(slot.video.currentTime * 1000),
      };
      this.currentCanvas = slot.canvas;
    } finally {
      slot.busy = false;
    }
  }

  async captureFrame(): Promise<VideoFrameCaptured> {
    if (!this.currentCaptured) {
      throw new Error("HtmlVideoFrameSource not initialized or seek not called");
    }
    return this.currentCaptured;
  }

  async recognizeRoiText(rect: NormalizedRect, hint: RoiOcrHint): Promise<string | null> {
    if (!this.currentCanvas || !this.currentCaptured) return null;

    // 投機的OCRキャッシュにヒットすれば待ち時間 0ms で返す
    if (hint === "message" && rect === DEFAULT_CHAMPIONS_ROI_LAYOUT.messageBox) {
      const hash = computeRoiLumaHash(
        this.currentCaptured.rgba,
        this.currentCaptured.width,
        this.currentCaptured.height,
        rect,
      );
      const cached = this.speculativeOcrCache.get(`msg:${hash}`);
      if (cached) return cached;
    } else if (hint === "ability") {
      const side = rect === DEFAULT_CHAMPIONS_ROI_LAYOUT.p1AbilityBanner ? "p1" : "p2";
      const hash = computeRoiLumaHash(
        this.currentCaptured.rgba,
        this.currentCaptured.width,
        this.currentCaptured.height,
        rect,
      );
      const cached = this.speculativeOcrCache.get(`ab:${side}:${hash}`);
      if (cached) return cached;
    }

    const worker =
      this.tesseractWorkers.length > 0
        ? this.tesseractWorkers[this.nextWorkerIdx++ % this.tesseractWorkers.length]
        : null;
    return recognizeRoiText(this.currentCanvas, rect, hint, this.ocrProvider, worker);
  }

  async dispose(): Promise<void> {
    this.prefetchedFrames.clear();
    this.speculativeOcrCache.clear();
    if (this.tesseractWorkers.length > 0) {
      await Promise.all(this.tesseractWorkers.map((w) => w.terminate().catch(() => {})));
      this.tesseractWorkers = [];
    }
    for (const slot of this.slots) {
      slot.video.removeAttribute("src");
      slot.video.load();
    }
    this.slots = [];
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
