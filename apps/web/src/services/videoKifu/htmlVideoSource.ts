import { createWorker, PSM, type Worker as TesseractWorker } from "tesseract.js";
import type {
  DetectedVideoLanguage,
  NormalizedRect,
  RoiOcrHint,
  RoiOcrProvider,
  VideoFrameCaptured,
  VideoFrameSource,
} from "./types";
import { DEFAULT_CHAMPIONS_ROI_LAYOUT, toPixelBounds } from "./roiLayout";
import { analyzeVideoFrameRgba, computeRoiLumaHash } from "./frameSampling";
import { detectVideoLanguage, toTesseractLanguageArg } from "./languageDetection";

/**
 * メッセージ枠・特性バナーの白文字を高コントラスト二値化（白背景に黒文字化）する共通前処理
 */
export function binarizeOcrPixels(data: Uint8ClampedArray | Uint8Array): void {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
    let val = 255;
    if (luma >= 120 && maxDiff <= 65) {
      val = Math.max(0, Math.min(255, Math.round(((235 - luma) / 115) * 255)));
    }
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
}

/**
 * 既に切り出された ROI の RGBA ピクセルから 24-bit BMP バッファを生成する共通前処理。
 * 720p/1080p 等の高解像度入力（scale=1）ではドット複製を避けてネイティブ解像度を維持し、
 * 低解像度入力（540p 等、scale=2）では 2 倍拡大して OCR に渡す。
 */
export function createPreprocessedOcrBmpFromCrop(
  cropRgba: Uint8ClampedArray | Uint8Array,
  sw: number,
  sh: number,
  scale = 1,
): Uint8Array {
  const pad = 12;
  const dw = sw * scale + pad * 2;
  const dh = sh * scale + pad * 2;

  const rowStride = (dw * 3 + 3) & ~3;
  const bmp = new Uint8Array(54 + rowStride * dh);
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);

  // BMP Header
  bmp[0] = 0x42; // 'B'
  bmp[1] = 0x4d; // 'M'
  view.setUint32(2, 54 + rowStride * dh, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, dw, true);
  view.setInt32(22, -dh, true); // top-down
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, rowStride * dh, true);

  for (let dy = 0; dy < dh; dy++) {
    const rowOff = 54 + dy * rowStride;
    const sy = Math.floor((dy - pad) / scale);
    const inY = dy >= pad && dy < dh - pad && sy >= 0 && sy < sh;

    for (let dx = 0; dx < dw; dx++) {
      let val = 255;
      if (inY && dx >= pad && dx < dw - pad) {
        const sx = Math.floor((dx - pad) / scale);
        if (sx >= 0 && sx < sw) {
          const idx = (sy * sw + sx) * 4;
          const r = cropRgba[idx] ?? 0;
          const g = cropRgba[idx + 1] ?? 0;
          const b = cropRgba[idx + 2] ?? 0;
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
          if (scale === 1) {
            if (luma >= 155 && maxDiff <= 65) {
              val = Math.max(0, Math.min(255, Math.round(((235 - luma) / 80) * 255)));
            }
          } else if (luma >= 120 && maxDiff <= 65) {
            val = Math.max(0, Math.min(255, Math.round(((235 - luma) / 115) * 255)));
          }
        }
      }
      const pOff = rowOff + dx * 3;
      bmp[pOff] = val;
      bmp[pOff + 1] = val;
      bmp[pOff + 2] = val;
    }
  }
  return bmp;
}

/**
 * Node.js (テスト・バッチ) 環境用: Canvas API なしで RGBA ピクセルから直接 24-bit BMP バッファを生成する共通前処理
 */
export function createPreprocessedOcrBmp(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rect: NormalizedRect,
): Uint8Array {
  const [x0, y0, x1, y1] = toPixelBounds(rect, width, height);
  const sw = Math.max(1, x1 - x0);
  const sh = Math.max(1, y1 - y0);
  const scale = width >= 1200 ? 1 : 2;
  const pad = 12;
  const dw = sw * scale + pad * 2;
  const dh = sh * scale + pad * 2;

  const rowStride = (dw * 3 + 3) & ~3;
  const bmp = new Uint8Array(54 + rowStride * dh);
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);

  // BMP Header
  bmp[0] = 0x42; // 'B'
  bmp[1] = 0x4d; // 'M'
  view.setUint32(2, 54 + rowStride * dh, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, dw, true);
  view.setInt32(22, -dh, true); // top-down
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, rowStride * dh, true);

  for (let dy = 0; dy < dh; dy++) {
    const rowOff = 54 + dy * rowStride;
    const sy = y0 + Math.floor((dy - pad) / scale);
    const inY = dy >= pad && dy < dh - pad && sy >= 0 && sy < height;

    for (let dx = 0; dx < dw; dx++) {
      let val = 255;
      if (inY && dx >= pad && dx < dw - pad) {
        const sx = x0 + Math.floor((dx - pad) / scale);
        if (sx >= 0 && sx < width) {
          const idx = (sy * width + sx) * 4;
          const r = rgba[idx] ?? 0;
          const g = rgba[idx + 1] ?? 0;
          const b = rgba[idx + 2] ?? 0;
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
          if (scale === 1) {
            if (luma >= 155 && maxDiff <= 65) {
              val = Math.max(0, Math.min(255, Math.round(((235 - luma) / 80) * 255)));
            }
          } else if (luma >= 120 && maxDiff <= 65) {
            val = Math.max(0, Math.min(255, Math.round(((235 - luma) / 115) * 255)));
          }
        }
      }
      const pOff = rowOff + dx * 3;
      bmp[pOff] = val;
      bmp[pOff + 1] = val;
      bmp[pOff + 2] = val;
    }
  }
  return bmp;
}

/**
 * ブラウザ標準の実験的 `TextDetector` API（存在する場合）または外部注入された `RoiOcrProvider` で
 * 指定した正規化 ROI 領域を高解像度ソースから直接切り出してテキスト抽出する
 */
export async function recognizeRoiText(
  source: HTMLCanvasElement | HTMLVideoElement,
  rect: NormalizedRect,
  hint: RoiOcrHint,
  ocrProvider?: RoiOcrProvider,
  tesseractWorker?: TesseractWorker | null,
): Promise<string | null> {
  if (typeof document === "undefined") return null;

  const isVideo = typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement;
  const srcW = isVideo ? source.videoWidth || 960 : (source as HTMLCanvasElement).width;
  const srcH = isVideo ? source.videoHeight || 540 : (source as HTMLCanvasElement).height;
  const [x0, y0, x1, y1] = toPixelBounds(rect, srcW, srcH);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  if (ocrProvider) {
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = w;
    cropCanvas.height = h;
    const ctx = cropCanvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(source, x0, y0, w, h, 0, 0, w, h);
      return ocrProvider(cropCanvas, hint);
    }
    return null;
  }

  if (tesseractWorker) {
    try {
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = w;
      cropCanvas.height = h;
      const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
      if (cropCtx) {
        cropCtx.drawImage(source, x0, y0, w, h, 0, 0, w, h);
        const cropImg = cropCtx.getImageData(0, 0, w, h);
        const scale = srcW >= 1200 ? 1 : 2;
        const bmp = createPreprocessedOcrBmpFromCrop(cropImg.data, w, h, scale);
        const blob =
          typeof Blob !== "undefined"
            ? new Blob([bmp.buffer as ArrayBuffer], { type: "image/bmp" })
            : Buffer.from(bmp.buffer, bmp.byteOffset, bmp.byteLength);
        const ocrPromise = tesseractWorker.recognize(blob as unknown as string);
        const timeoutPromise = new Promise<{ data: { text: string } }>((_, reject) =>
          setTimeout(() => reject(new Error("OCR timeout")), 12000),
        );
        const ret = await Promise.race([ocrPromise, timeoutPromise]);
        const text = ret.data.text.trim();
        return text || null;
      }
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
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = w;
      cropCanvas.height = h;
      const ctx = cropCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(source, x0, y0, w, h, 0, 0, w, h);
        const detector = new win.TextDetector();
        const blocks = await detector.detect(cropCanvas);
        const joined = blocks
          .map((b) => b.rawValue?.trim() ?? "")
          .filter(Boolean)
          .join(" ");
        return joined || null;
      }
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
  private currentOcrSource: HTMLCanvasElement | HTMLVideoElement | null = null;
  private currentCaptured: VideoFrameCaptured | null = null;
  private currentTimeMs = 0;

  private prefetchedFrames = new Map<number, PrefetchedFrameEntry>();
  private speculativeOcrCache = new Map<string, Promise<string | null>>();
  private lastPrefetchedMsgHash = 0;
  private lastPrefetchedBannerHash = 0;

  private tesseractWorkers: TesseractWorker[] = [];
  private nextWorkerIdx = 0;
  private _durationSec = 0;
  private _detectedLanguage: DetectedVideoLanguage | null = null;

  constructor(
    private readonly file: File,
    private readonly ocrProvider?: RoiOcrProvider,
    private readonly languageOverride?: DetectedVideoLanguage,
  ) {}

  get durationSec(): number {
    return this._durationSec;
  }

  get detectedLanguage(): DetectedVideoLanguage | null {
    return this._detectedLanguage;
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

    const probeLanguageOnPrimarySlot = async (
      worker: TesseractWorker | null,
    ): Promise<DetectedVideoLanguage | null> => {
      if (this.languageOverride) return this.languageOverride;
      if (this._durationSec <= 0) return null;
      return detectVideoLanguage({
        durationSec: this._durationSec,
        captureAt: async (sec: number): Promise<VideoFrameCaptured> => {
          await this.seekVideoElement(primarySlot.video, sec);
          const vw = primarySlot.video.videoWidth || primarySlot.canvas.width;
          const vh = primarySlot.video.videoHeight || primarySlot.canvas.height;
          primarySlot.ctx.drawImage(
            primarySlot.video,
            0,
            0,
            vw,
            vh,
            0,
            0,
            primarySlot.canvas.width,
            primarySlot.canvas.height,
          );
          const img = primarySlot.ctx.getImageData(
            0,
            0,
            primarySlot.canvas.width,
            primarySlot.canvas.height,
          );
          return {
            rgba: img.data,
            width: primarySlot.canvas.width,
            height: primarySlot.canvas.height,
            timestampMs: Math.round(sec * 1000),
          };
        },
        recognizeRoi: async (
          _captured: VideoFrameCaptured,
          rect: NormalizedRect,
          hint: RoiOcrHint,
        ): Promise<string | null> => {
          return recognizeRoiText(primarySlot.video, rect, hint, this.ocrProvider, worker);
        },
      });
    };

    const ocrPoolPromise =
      !this.ocrProvider && typeof window !== "undefined"
        ? (async () => {
            try {
              const initAll = (async () => {
                if (this.languageOverride) {
                  this._detectedLanguage = this.languageOverride;
                  const targetLang = toTesseractLanguageArg(this.languageOverride);
                  const first = await createWorker(targetLang);
                  const rest = await Promise.all(
                    Array.from({ length: OCR_WORKER_POOL_SIZE - 1 }, () =>
                      createWorker(targetLang),
                    ),
                  );
                  const all = [first, ...rest];
                  await Promise.all(
                    all.map((w) => w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })),
                  );
                  return all;
                }

                // まず1本のプローブワーカーで動画の言語（ja / en）を事前判定し、
                // 本解析用ワーカープールを単一言語モデルに絞って精度と速度を高める
                const probeWorker = await createWorker(["eng", "jpn"]);
                await probeWorker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
                const detected = await probeLanguageOnPrimarySlot(probeWorker).catch(() => null);
                this._detectedLanguage = detected;
                const targetLang = toTesseractLanguageArg(detected);

                const [reinitDone, rest] = await Promise.all([
                  detected !== null
                    ? probeWorker.reinitialize(toTesseractLanguageArg(detected))
                    : Promise.resolve(null),
                  Promise.all(
                    Array.from({ length: OCR_WORKER_POOL_SIZE - 1 }, () =>
                      createWorker(targetLang),
                    ),
                  ),
                ]);
                void reinitDone;
                const all = [probeWorker, ...rest];
                await Promise.all(
                  all.map((w) => w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })),
                );
                return all;
              })();
              const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 25000));
              return await Promise.race([initAll, timeoutPromise]);
            } catch (err) {
              console.warn("Could not start Tesseract workers:", err);
              return null;
            }
          })()
        : (async () => {
            this._detectedLanguage = await probeLanguageOnPrimarySlot(null).catch(() => null);
            return null;
          })();

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
    ocrSource: HTMLCanvasElement | HTMLVideoElement,
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
          recognizeRoiText(ocrSource, rect, "message", this.ocrProvider, worker),
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
          recognizeRoiText(ocrSource, rect, "ability", this.ocrProvider, worker),
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
          // フレーム解析用 (960x540)
          freeSlot.ctx.drawImage(
            freeSlot.video,
            0,
            0,
            freeSlot.canvas.width,
            freeSlot.canvas.height,
          );
          const imgData = freeSlot.ctx.getImageData(
            0,
            0,
            freeSlot.canvas.width,
            freeSlot.canvas.height,
          );
          const captured: VideoFrameCaptured = {
            rgba: new Uint8ClampedArray(imgData.data),
            width: freeSlot.canvas.width,
            height: freeSlot.canvas.height,
            timestampMs: Math.round(freeSlot.video.currentTime * 1000),
          };
          // 投機的OCRは元動画のネイティブ高解像度 (1080p等) から直接 ROI を切り出して実行
          this.triggerSpeculativeOcrForFrame(captured, freeSlot.video);
          // 非投機的 ROI 用に高解像度スナップショット (最大 1280x720) を保持
          const ocrW = Math.min(1280, freeSlot.video.videoWidth || freeSlot.canvas.width);
          const ocrH = Math.min(720, freeSlot.video.videoHeight || freeSlot.canvas.height);
          const snapCanvas = document.createElement("canvas");
          snapCanvas.width = ocrW;
          snapCanvas.height = ocrH;
          const snapCtx = snapCanvas.getContext("2d", { willReadFrequently: true })!;
          snapCtx.drawImage(freeSlot.video, 0, 0, ocrW, ocrH);
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
      this.currentOcrSource = sourceCanvas;
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
      this.currentOcrSource = slot.video;
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
    if (!this.currentOcrSource || !this.currentCaptured) return null;

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
    return recognizeRoiText(this.currentOcrSource, rect, hint, this.ocrProvider, worker);
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
