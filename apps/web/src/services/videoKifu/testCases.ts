import fs from "node:fs";
import path from "node:path";

export interface VideoTestCaseMeta {
  readonly videoPath: string;
  readonly regulation?: string;
  readonly maxDurationSec?: number;
  readonly description?: string;
}

export interface VideoFixtureCase {
  readonly id: string;
  readonly description: string;
  readonly dirPath: string;
  readonly videoPath: string;
  readonly pokepaste: string;
  readonly regulation: string;
  readonly maxDurationSec: number;
  readonly truthPbn: string | null;
}

const FIXTURES_DIR = path.resolve(__dirname, "__fixtures__");

/**
 * `__fixtures__/<id>` 配下のフィクスチャを自動検出してテストケース配列を返す。
 */
export function loadAllFixtureCases(): readonly VideoFixtureCase[] {
  if (!fs.existsSync(FIXTURES_DIR)) {
    return [];
  }

  const entries = fs.readdirSync(FIXTURES_DIR, { withFileTypes: true });
  const cases: VideoFixtureCase[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const caseDir = path.join(FIXTURES_DIR, entry.name);
    const metaPath = path.join(caseDir, "meta.json");
    const pastePath = path.join(caseDir, "pokepaste.txt");
    const truthPath = path.join(caseDir, "truth.pbn");

    if (!fs.existsSync(metaPath) || !fs.existsSync(pastePath)) {
      continue;
    }

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as VideoTestCaseMeta;
      const pokepaste = fs.readFileSync(pastePath, "utf8");
      const truthPbn = fs.existsSync(truthPath) ? fs.readFileSync(truthPath, "utf8") : null;

      cases.push({
        id: entry.name,
        description: meta.description ?? entry.name,
        dirPath: caseDir,
        videoPath: meta.videoPath,
        pokepaste,
        regulation: meta.regulation ?? "M-C",
        maxDurationSec: meta.maxDurationSec ?? 120,
        truthPbn,
      });
    } catch (e) {
      console.warn(`Failed to load fixture ${entry.name}:`, e);
    }
  }

  return cases;
}
