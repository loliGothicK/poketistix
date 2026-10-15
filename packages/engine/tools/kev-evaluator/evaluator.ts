import type { KevClient } from "./kev-client.js";
import { formatTestCaseForKev } from "./extractor.js";
import type { EvaluationResult, KevRequest, ParsedTestCase } from "./types.js";

export interface EvaluatorThresholds {
  minMeaningfulScore?: number; // e.g. 0.50
  minQualityScore?: number; // e.g. 1.5
}

export class ScenarioTestEvaluator {
  private readonly client: KevClient;
  private readonly thresholds: Required<EvaluatorThresholds>;

  constructor(client: KevClient, thresholds: EvaluatorThresholds = {}) {
    this.client = client;
    this.thresholds = {
      minMeaningfulScore: thresholds.minMeaningfulScore ?? 0.5,
      minQualityScore: thresholds.minQualityScore ?? 1.5,
    };
  }

  /**
   * Evaluates a single test case using Kev decision model.
   */
  async evaluateTestCase(testCase: ParsedTestCase): Promise<EvaluationResult> {
    const formattedState = formatTestCaseForKev(testCase);

    const request: KevRequest = {
      state: formattedState,
      questions: {
        is_meaningful: {
          type: "noul",
          instructions:
            "Does this test verify the core effects and state changes described in the official mechanic specification, rather than merely checking trivial or unrelated flags?",
        },
        validity_category: {
          type: "choice",
          instructions: "How well does this test cover the official specification?",
          criteria: {
            sound:
              "Thorough test covering key mechanics, form/stat changes, and battle effects stated in the specification",
            shallow_flag: "Superficial test checking only placeholder or unexercised boolean flags",
            tautology: "Trivial test where assertions pass without exercising described mechanics",
            broken: "Contradicts the specification or contains impossible rules",
          },
        },
        quality_score: {
          type: "score",
          instructions:
            "Rate how thoroughly this test verifies the official mechanic specification:",
          criteria: [
            "Superficial (misses core effects or form changes)",
            "Incomplete specification coverage",
            "Good verification of described mechanics",
            "Comprehensive test covering all specification details",
          ],
        },
      },
    };

    const response = await this.client.decide(request);

    const noulAns = response.answers.is_meaningful;
    const choiceAns = response.answers.validity_category;
    const scoreAns = response.answers.quality_score;

    const isMeaningfulProb = noulAns?.type === "noul" ? noulAns.noul : 0.5;
    const category = choiceAns?.type === "choice" ? choiceAns.choice : "unknown";
    const qualityScore = scoreAns?.type === "score" ? scoreAns.score : 1.5;

    const reasons: string[] = [];

    if (category !== "sound" && category !== "valid") {
      reasons.push(`Flaw category detected: ${category}`);
    }
    if (isMeaningfulProb < this.thresholds.minMeaningfulScore) {
      reasons.push(
        `Low meaningfulness probability (${(isMeaningfulProb * 100).toFixed(1)}% < ${(this.thresholds.minMeaningfulScore * 100).toFixed(1)}%)`,
      );
    }
    if (qualityScore < this.thresholds.minQualityScore) {
      reasons.push(
        `Low quality score (${qualityScore.toFixed(2)} / 3.0 < ${this.thresholds.minQualityScore.toFixed(2)})`,
      );
    }

    const isPassed =
      isMeaningfulProb >= this.thresholds.minMeaningfulScore &&
      qualityScore >= this.thresholds.minQualityScore &&
      (category === "sound" || category === "valid");

    let verdict: "VALID" | "SUSPICIOUS" | "INVALID" = "VALID";
    if (!isPassed) {
      verdict = qualityScore < 1.0 || isMeaningfulProb < 0.3 ? "INVALID" : "SUSPICIOUS";
    }

    return {
      testCase,
      isMeaningfulProbability: isMeaningfulProb,
      category,
      categoryProbabilities: choiceAns?.probabilities,
      qualityScore,
      scoreProbabilities: scoreAns?.probabilities,
      isPassed,
      verdict,
      reasons,
      latencyMs: response.latency_ms,
    };
  }

  /**
   * Evaluates multiple test cases with optional concurrency.
   */
  async evaluateBatch(testCases: ParsedTestCase[], concurrency = 6): Promise<EvaluationResult[]> {
    if (testCases.length === 0) return [];
    const results: EvaluationResult[] = Array.from({ length: testCases.length });
    let currentIndex = 0;

    const workerCount = Math.min(concurrency, testCases.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (currentIndex < testCases.length) {
        const idx = currentIndex++;
        results[idx] = await this.evaluateTestCase(testCases[idx]);
      }
    });

    await Promise.all(workers);
    return results;
  }
}
