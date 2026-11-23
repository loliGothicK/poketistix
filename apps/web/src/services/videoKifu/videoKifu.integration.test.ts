import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createWorker, PSM } from "tesseract.js";
import { isRight } from "fp-ts/lib/Either";
import { importSets } from "@/lib/pokepaste";
import { VideoKifuAnalyzer } from "./analyzer";
import { createPreprocessedOcrBmp, createPreprocessedOcrBmpFromCrop } from "./htmlVideoSource";
import { buildChampionsDictionaries } from "./kifuSummary";
import { detectVideoLanguage, toTesseractLanguageArg } from "./languageDetection";
import { DEFAULT_CHAMPIONS_ROI_LAYOUT, toPixelBounds } from "./roiLayout";
import { loadAllFixtureCases } from "./testCases";
import type { NormalizedRect, RoiOcrHint, VideoFrameCaptured, VideoFrameSource } from "./types";

const W = 960;
const H = 540;
const FRAME_BYTES = W * H * 4;
const OCR_W = 1920;
const OCR_H = 1080;
const OCR_FRAME_BYTES = OCR_W * OCR_H * 4;

interface HiResOcrCrops {
  readonly msgCrop: Uint8Array;
  readonly p1BannerCrop: Uint8Array;
  readonly p2BannerCrop: Uint8Array;
}

function cropRgbaRect(
  src: Uint8Array,
  srcW: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcOff = ((y0 + y) * srcW + x0) * 4;
    out.set(src.subarray(srcOff, srcOff + w * 4), y * w * 4);
  }
  return out;
}

function getNested(obj: Record<string, unknown>, keyPath: string): string {
  const parts = keyPath.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return keyPath;
    }
  }
  return typeof cur === "string" ? cur : keyPath;
}

const testCases = loadAllFixtureCases();

describe("VideoKifuAnalyzer Fixture Regression Tests", () => {
  describe.each(testCases)("$id: $description", (tc) => {
    const videoExists = fs.existsSync(tc.videoPath);

    it.skipIf(!videoExists)(
      "matches Ground Truth PBN via diff",
      async () => {
        const enJson = JSON.parse(
          fs.readFileSync(
            path.resolve(process.cwd(), "public/locales/en/translation.json"),
            "utf8",
          ),
        ) as Record<string, unknown>;
        const jaJson = JSON.parse(
          fs.readFileSync(
            path.resolve(process.cwd(), "public/locales/ja/translation.json"),
            "utf8",
          ),
        ) as Record<string, unknown>;
        const dictionaries = buildChampionsDictionaries(
          (k) => getNested(enJson, k),
          (k) => getNested(jaJson, k),
        );

        const parsedTeam = importSets(tc.pokepaste);
        expect(isRight(parsedTeam)).toBe(true);
        if (!isRight(parsedTeam)) return;
        const myTeam = parsedTeam.right.members.filter(
          (m): m is NonNullable<typeof m> => m !== null,
        );

        const msgBounds = toPixelBounds(DEFAULT_CHAMPIONS_ROI_LAYOUT.messageBox, OCR_W, OCR_H);
        const p1bBounds = toPixelBounds(DEFAULT_CHAMPIONS_ROI_LAYOUT.p1AbilityBanner, OCR_W, OCR_H);
        const p2bBounds = toPixelBounds(DEFAULT_CHAMPIONS_ROI_LAYOUT.p2AbilityBanner, OCR_W, OCR_H);

        const maxSec = tc.maxDurationSec;
        const frames: Uint8Array[] = [];
        const hiResCrops: HiResOcrCrops[] = [];
        await Promise.all([
          new Promise<void>((resolve, reject) => {
            const ff = spawn("ffmpeg", [
              "-v",
              "error",
              "-ss",
              "0",
              "-t",
              String(maxSec),
              "-i",
              tc.videoPath,
              "-vf",
              `fps=1,scale=${W}:${H}`,
              "-pix_fmt",
              "rgba",
              "-f",
              "rawvideo",
              "pipe:1",
            ]);

            let buf = Buffer.alloc(0);
            ff.stdout.on("data", (chunk: Buffer) => {
              buf = Buffer.concat([buf, chunk]);
              while (buf.length >= FRAME_BYTES) {
                frames.push(new Uint8Array(buf.subarray(0, FRAME_BYTES)));
                buf = buf.subarray(FRAME_BYTES);
              }
            });

            ff.on("close", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`ffmpeg 540p exited with code ${code}`));
            });
            ff.on("error", reject);
          }),
          new Promise<void>((resolve, reject) => {
            const ff = spawn("ffmpeg", [
              "-v",
              "error",
              "-ss",
              "0",
              "-t",
              String(maxSec),
              "-i",
              tc.videoPath,
              "-vf",
              `fps=1,scale=${OCR_W}:${OCR_H}`,
              "-pix_fmt",
              "rgba",
              "-f",
              "rawvideo",
              "pipe:1",
            ]);

            let buf = Buffer.alloc(0);
            ff.stdout.on("data", (chunk: Buffer) => {
              buf = Buffer.concat([buf, chunk]);
              while (buf.length >= OCR_FRAME_BYTES) {
                const frameBuf = new Uint8Array(buf.subarray(0, OCR_FRAME_BYTES));
                hiResCrops.push({
                  msgCrop: cropRgbaRect(
                    frameBuf,
                    OCR_W,
                    msgBounds[0],
                    msgBounds[1],
                    msgBounds[2] - msgBounds[0],
                    msgBounds[3] - msgBounds[1],
                  ),
                  p1BannerCrop: cropRgbaRect(
                    frameBuf,
                    OCR_W,
                    p1bBounds[0],
                    p1bBounds[1],
                    p1bBounds[2] - p1bBounds[0],
                    p1bBounds[3] - p1bBounds[1],
                  ),
                  p2BannerCrop: cropRgbaRect(
                    frameBuf,
                    OCR_W,
                    p2bBounds[0],
                    p2bBounds[1],
                    p2bBounds[2] - p2bBounds[0],
                    p2bBounds[3] - p2bBounds[1],
                  ),
                });
                buf = buf.subarray(OCR_FRAME_BYTES);
              }
            });

            ff.on("close", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`ffmpeg 1080p exited with code ${code}`));
            });
            ff.on("error", reject);
          }),
        ]);

        expect(frames.length).toBeGreaterThan(30);

        const buildOcrBmp = (sec: number, rect: NormalizedRect): Uint8Array => {
          const hi = hiResCrops[sec];
          if (hi && rect === DEFAULT_CHAMPIONS_ROI_LAYOUT.messageBox) {
            return createPreprocessedOcrBmpFromCrop(
              hi.msgCrop,
              msgBounds[2] - msgBounds[0],
              msgBounds[3] - msgBounds[1],
              1,
            );
          }
          if (hi && rect === DEFAULT_CHAMPIONS_ROI_LAYOUT.p1AbilityBanner) {
            return createPreprocessedOcrBmpFromCrop(
              hi.p1BannerCrop,
              p1bBounds[2] - p1bBounds[0],
              p1bBounds[3] - p1bBounds[1],
              1,
            );
          }
          if (hi && rect === DEFAULT_CHAMPIONS_ROI_LAYOUT.p2AbilityBanner) {
            return createPreprocessedOcrBmpFromCrop(
              hi.p2BannerCrop,
              p2bBounds[2] - p2bBounds[0],
              p2bBounds[3] - p2bBounds[1],
              1,
            );
          }
          return createPreprocessedOcrBmp(frames[sec]!, W, H, rect);
        };

        const probeWorker = await createWorker(["eng", "jpn"]);
        await probeWorker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
        const detectedLanguage = await detectVideoLanguage({
          durationSec: frames.length,
          async captureAt(timeSec: number): Promise<VideoFrameCaptured> {
            const idx = Math.max(0, Math.min(frames.length - 1, Math.floor(timeSec)));
            return {
              rgba: frames[idx]!,
              width: W,
              height: H,
              timestampMs: idx * 1000,
            };
          },
          async recognizeRoi(
            captured: VideoFrameCaptured,
            rect: NormalizedRect,
            _hint: RoiOcrHint,
          ): Promise<string | null> {
            const sec = Math.max(
              0,
              Math.min(frames.length - 1, Math.floor(captured.timestampMs / 1000)),
            );
            const bmp = buildOcrBmp(sec, rect);
            const res = await probeWorker.recognize(
              Buffer.from(bmp.buffer, bmp.byteOffset, bmp.byteLength),
            );
            const text = res.data.text.trim();
            return text || null;
          },
        });
        const targetLang = toTesseractLanguageArg(detectedLanguage);
        if (detectedLanguage !== null) {
          await probeWorker.reinitialize(toTesseractLanguageArg(detectedLanguage));
        }

        const extraWorkers = await Promise.all([
          createWorker(targetLang),
          createWorker(targetLang),
          createWorker(targetLang),
        ]);
        const workers = [probeWorker, ...extraWorkers];
        await Promise.all(
          workers.map((w) => w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })),
        );

        let curSec = 0;
        let workerRR = 0;

        const frameSource: VideoFrameSource = {
          durationSec: frames.length,
          detectedLanguage,
          async seek(timeSec: number): Promise<void> {
            curSec = Math.max(0, Math.min(frames.length - 1, Math.floor(timeSec)));
          },
          async captureFrame(): Promise<VideoFrameCaptured> {
            return {
              rgba: frames[curSec]!,
              width: W,
              height: H,
              timestampMs: curSec * 1000,
            };
          },
          async recognizeRoiText(rect: NormalizedRect, _hint: RoiOcrHint): Promise<string | null> {
            const bmp = buildOcrBmp(curSec, rect);
            const worker = workers[workerRR++ % workers.length]!;
            const res = await worker.recognize(
              Buffer.from(bmp.buffer, bmp.byteOffset, bmp.byteLength),
            );
            const text = res.data.text.trim();
            return text || null;
          },
          async dispose() {},
        };

        const analyzer = new VideoKifuAnalyzer({
          myTeam,
          dictionaries,
          regulation: tc.regulation,
          sampleStepSec: 1.0,
        });

        const summary = await analyzer.analyze(frameSource);
        await Promise.all(workers.map((w) => w.terminate()));

        const actualPbn = summary.pbnText.trim();
        const latestPath = path.join(tc.dirPath, "latest.pbn");

        if (!tc.truthPbn) {
          fs.writeFileSync(latestPath, actualPbn + "\n", "utf8");
          console.warn(
            `[NOTICE] No truth.pbn found for ${tc.id}. Wrote generated PBN to latest.pbn. Please inspect, modify diffs, and save as truth.pbn.`,
          );
          return;
        }

        if (actualPbn !== tc.truthPbn.trim()) {
          fs.writeFileSync(latestPath, actualPbn + "\n", "utf8");
        } else if (fs.existsSync(latestPath)) {
          fs.unlinkSync(latestPath);
        }

        // truth.pbn と actualPbn を比較（不一致なら Vitest が明快な Diff を出力）
        expect(actualPbn).toBe(tc.truthPbn.trim());
      },
      450_000,
    );
  });
});
