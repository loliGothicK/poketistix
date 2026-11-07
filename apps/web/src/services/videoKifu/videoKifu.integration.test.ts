import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createWorker } from "tesseract.js";
import { isRight } from "fp-ts/lib/Either";
import { importSets } from "@/lib/pokepaste";
import { VideoKifuAnalyzer } from "./analyzer";
import { createPreprocessedOcrBmp } from "./htmlVideoSource";
import { buildChampionsDictionaries } from "./kifuSummary";
import { loadAllFixtureCases } from "./testCases";
import type { NormalizedRect, RoiOcrHint, VideoFrameCaptured, VideoFrameSource } from "./types";

const W = 960;
const H = 540;
const FRAME_BYTES = W * H * 4;

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

        const maxSec = tc.maxDurationSec;
        const frames: Uint8Array[] = [];
        await new Promise<void>((resolve, reject) => {
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
              const frameBuf = buf.subarray(0, FRAME_BYTES);
              frames.push(new Uint8Array(frameBuf));
              buf = buf.subarray(FRAME_BYTES);
            }
          });

          ff.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
          });
          ff.on("error", reject);
        });

        expect(frames.length).toBeGreaterThan(30);

        const workers = await Promise.all([
          createWorker(["eng", "jpn"]),
          createWorker(["eng", "jpn"]),
          createWorker(["eng", "jpn"]),
          createWorker(["eng", "jpn"]),
        ]);

        let curSec = 0;
        let workerRR = 0;

        const frameSource: VideoFrameSource = {
          durationSec: frames.length,
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
            const bmp = createPreprocessedOcrBmp(frames[curSec]!, W, H, rect);
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

        // 最新の出力を常に latest.pbn に書き出し（差分修正用ベース）
        const latestPath = path.join(tc.dirPath, "latest.pbn");
        fs.writeFileSync(latestPath, actualPbn + "\n", "utf8");

        if (!tc.truthPbn) {
          console.warn(
            `[NOTICE] No truth.pbn found for ${tc.id}. Wrote generated PBN to latest.pbn. Please inspect, modify diffs, and save as truth.pbn.`,
          );
          return;
        }

        // truth.pbn と actualPbn を比較（不一致なら Vitest が明快な Diff を出力）
        expect(actualPbn).toBe(tc.truthPbn.trim());
      },
      180_000,
    );
  });
});
