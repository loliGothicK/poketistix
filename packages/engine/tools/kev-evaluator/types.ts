export type QuestionType = "noul" | "choice" | "score";

export interface NoulQuestion {
  type: "noul";
  instructions: string;
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type KevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface KevRequest {
  state: string;
  model?: string;
  questions: Record<string, KevQuestion>;
}

export interface NoulAnswer {
  type: "noul";
  noul: number; // 0.0 (no) to 1.0 (yes)
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

export interface ScoreAnswer {
  type: "score";
  score: number;
  confidence?: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
}

export type KevAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface KevResponse {
  model: string;
  answers: {
    is_meaningful?: NoulAnswer;
    validity_category?: ChoiceAnswer;
    quality_score?: ScoreAnswer;
    [key: string]: KevAnswer | undefined;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  latency_ms?: number;
}

export interface ParsedTestCase {
  title: string;
  rawCode: string;
  filePath: string;
  startLine: number;
  setupSummary?: string;
  actionsSummary?: string;
  assertionsSummary?: string;
}

export interface EvaluationResult {
  testCase: ParsedTestCase;
  isMeaningfulProbability: number;
  category: string;
  categoryProbabilities?: Record<string, number>;
  qualityScore: number;
  scoreProbabilities?: Record<string, number>;
  isPassed: boolean;
  verdict: "VALID" | "SUSPICIOUS" | "INVALID";
  reasons: string[];
  latencyMs?: number;
}
