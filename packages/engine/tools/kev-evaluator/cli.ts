import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import { KevClient } from "./kev-client.js";
import { ScenarioTestEvaluator } from "./evaluator.js";
import { extractTestCasesFromFile } from "./extractor.js";
import type { EvaluationResult, ParsedTestCase } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);

  let jsonOutput = false;
  let warnOnly = false;
  let serverUrl = process.env.KEV_BASE_URL || "http://127.0.0.1:8009";
  let minScore = 1.5;
  let concurrency = 1;
  const filePatterns: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "--warn-only") {
      warnOnly = true;
    } else if (arg === "--all") {
      const allPattern = path.resolve(__dirname, "../../tests/**/*.{test,spec}.ts");
      filePatterns.push(allPattern);
    } else if (arg === "--concurrency" && i + 1 < args.length) {
      concurrency = Number.parseInt(args[++i], 10) || 8;
    } else if (arg === "--url" && i + 1 < args.length) {
      serverUrl = args[++i];
    } else if (arg === "--min-score" && i + 1 < args.length) {
      minScore = Number.parseFloat(args[++i]);
    } else if (!arg.startsWith("-")) {
      filePatterns.push(arg);
    }
  }

  // If no files specified, search default scenario tests
  if (filePatterns.length === 0) {
    const defaultPattern = path.resolve(__dirname, "../../tests/senarios/**/*.spec.ts");
    filePatterns.push(defaultPattern);
  }

  // Resolve matching files
  const matchedFiles: string[] = [];
  for (const pattern of filePatterns) {
    const cleanPattern = pattern.replace(/\\/g, "/");
    let files = await glob(cleanPattern);
    if (files.length === 0) {
      const stripped = cleanPattern.replace(/^packages\/engine\//, "");
      const fromEngine = path.resolve(__dirname, "../../", stripped).replace(/\\/g, "/");
      files = await glob(fromEngine);
    }
    matchedFiles.push(...files);
  }

  const uniqueFiles = [...new Set(matchedFiles)];

  if (uniqueFiles.length === 0) {
    console.error(`[kev-eval] No test files matched pattern: ${filePatterns.join(", ")}`);
    process.exit(1);
  }

  const client = new KevClient({
    baseUrl: serverUrl,
  });

  const isHealthy = await client.isHealthy();
  if (!isHealthy) {
    console.error(
      `\x1b[31m[ERROR]\x1b[0m Kev server is not reachable at ${serverUrl}.\n\n` +
        `Start Kev locally with:\n` +
        `  pnpm run kev:serve\n`,
    );
    process.exit(1);
  }

  const evaluator = new ScenarioTestEvaluator(client, {
    minQualityScore: minScore,
  });

  // Collect all test cases from matched files
  const allTestCases: ParsedTestCase[] = [];
  for (const filePath of uniqueFiles) {
    try {
      const tcs = extractTestCasesFromFile(filePath);
      allTestCases.push(...tcs);
    } catch (err) {
      console.error(`\x1b[31m[ERROR]\x1b[0m Failed parsing ${filePath}:`, err);
    }
  }

  const totalTests = allTestCases.length;

  if (!jsonOutput) {
    console.log(`\n======================================================`);
    console.log(` 🛡️  Kev Battle Scenario Validator`);
    console.log(` Server URL : ${serverUrl}`);
    console.log(` Files to evaluate: ${uniqueFiles.length} (${totalTests} test cases)`);
    console.log(` Concurrency: ${concurrency}`);
    if (warnOnly) console.log(` Mode: Warn-only (filtering out passing tests)`);
    console.log(`======================================================\n`);
  }

  const allResults: EvaluationResult[] = [];
  let completedCount = 0;
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, totalTests) }, async () => {
    while (currentIndex < totalTests) {
      const idx = currentIndex++;
      const tc = allTestCases[idx];
      try {
        const res = await evaluator.evaluateTestCase(tc);
        allResults.push(res);
        completedCount++;

        if (!jsonOutput) {
          const isFlagged = res.verdict !== "VALID";
          if (!warnOnly || isFlagged) {
            const badge =
              res.verdict === "VALID"
                ? "\x1b[32m[PASS]\x1b[0m"
                : res.verdict === "SUSPICIOUS"
                  ? "\x1b[33m[WARN]\x1b[0m"
                  : "\x1b[31m[FAIL]\x1b[0m";

            const fileTag = `\x1b[90m${path.basename(tc.filePath)}:${tc.startLine}\x1b[0m`;
            console.log(
              `[${completedCount}/${totalTests}] ${badge} ${fileTag} ${res.testCase.title} (Quality: ${res.qualityScore.toFixed(1)}/3.0, SoundProb: ${(res.isMeaningfulProbability * 100).toFixed(0)}%, Cat: ${res.category})`,
            );
            if (res.reasons.length > 0) {
              for (const reason of res.reasons) {
                console.log(`         ↳ \x1b[90m${reason}\x1b[0m`);
              }
            }
          } else if (completedCount % 50 === 0 || completedCount === totalTests) {
            process.stdout.write(`... Progress: ${completedCount}/${totalTests} tests evaluated\n`);
          }
        }
      } catch (err) {
        completedCount++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `\x1b[31m[ERROR]\x1b[0m [${completedCount}/${totalTests}] Failed evaluating ${tc.filePath}:${tc.startLine}: ${message}`,
        );
      }
    }
  });

  await Promise.all(workers);

  if (jsonOutput) {
    console.log(JSON.stringify(allResults, null, 2));
    return;
  }

  const validCount = allResults.filter((r) => r.verdict === "VALID").length;
  const suspiciousCount = allResults.filter((r) => r.verdict === "SUSPICIOUS").length;
  const invalidCount = allResults.filter((r) => r.verdict === "INVALID").length;

  console.log(`\n---------------- Summary ----------------`);
  console.log(` Total test cases evaluated : ${totalTests}`);
  console.log(
    ` ✅ Valid / Meaningful       : ${validCount} (${((validCount / (totalTests || 1)) * 100).toFixed(1)}%)`,
  );
  console.log(
    ` ⚠️ Suspicious / Weak        : ${suspiciousCount} (${((suspiciousCount / (totalTests || 1)) * 100).toFixed(1)}%)`,
  );
  console.log(
    ` ❌ Invalid / Tautology      : ${invalidCount} (${((invalidCount / (totalTests || 1)) * 100).toFixed(1)}%)`,
  );
  console.log(`-----------------------------------------`);

  // Group flagged tests by category
  const flagged = allResults.filter((r) => r.verdict !== "VALID");
  if (flagged.length > 0) {
    const byCategory: Record<string, EvaluationResult[]> = {};
    for (const r of flagged) {
      const cat = r.category || "unknown";
      byCategory[cat] = byCategory[cat] || [];
      byCategory[cat].push(r);
    }

    console.log(`\n📋 Flagged Tests by Category (${flagged.length} tests):`);
    for (const [cat, items] of Object.entries(byCategory)) {
      console.log(`\n  🏷️  Category: "${cat}" (${items.length} tests)`);
      for (const item of items) {
        const badge =
          item.verdict === "SUSPICIOUS" ? "\x1b[33m[WARN]\x1b[0m" : "\x1b[31m[FAIL]\x1b[0m";
        console.log(
          `     ${badge} ${path.basename(item.testCase.filePath)}:${item.testCase.startLine} - "${item.testCase.title}" (Q: ${item.qualityScore.toFixed(1)}, Sound: ${(item.isMeaningfulProbability * 100).toFixed(0)}%)`,
        );
      }
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
