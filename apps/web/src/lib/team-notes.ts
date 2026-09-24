/**
 * チーム全体の戦略・構築ノート
 */
export interface TeamNotes {
  /** 構築経緯 */
  readonly buildProcess?: string;
  /** 基本コンセプト・立ち回り */
  readonly basicConcepts?: string;
  /** 対戦相手別・選出メモ */
  readonly metaPlans?: string;
}

/**
 * チームの description 文字列から TeamNotes を復元する。
 * JSON形式でない旧プレーンテキストの場合は、後方互換性のため basicConcepts に格納する。
 */
export function parseTeamNotes(rawDescription?: string): TeamNotes {
  if (!rawDescription) return {};
  const trimmed = rawDescription.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        buildProcess:
          typeof parsed.buildProcess === "string" && parsed.buildProcess.trim()
            ? parsed.buildProcess
            : undefined,
        basicConcepts:
          typeof parsed.basicConcepts === "string" && parsed.basicConcepts.trim()
            ? parsed.basicConcepts
            : undefined,
        metaPlans:
          typeof parsed.metaPlans === "string" && parsed.metaPlans.trim()
            ? parsed.metaPlans
            : undefined,
      };
    }
  } catch {
    // JSON でない旧プレーンテキスト
  }

  return { basicConcepts: trimmed };
}

/**
 * TeamNotes を保存用の文字列（JSON）に直列化する。
 * 全セクションが空の場合は空文字列を返す。
 */
export function serializeTeamNotes(notes: TeamNotes): string {
  const clean: Record<string, string> = {};
  if (notes.buildProcess && notes.buildProcess.trim()) {
    clean.buildProcess = notes.buildProcess.trim();
  }
  if (notes.basicConcepts && notes.basicConcepts.trim()) {
    clean.basicConcepts = notes.basicConcepts.trim();
  }
  if (notes.metaPlans && notes.metaPlans.trim()) {
    clean.metaPlans = notes.metaPlans.trim();
  }

  if (Object.keys(clean).length === 0) {
    return "";
  }
  return JSON.stringify(clean);
}

/**
 * いずれかのセクションに記述があるかを判定する。
 */
export function hasTeamNotes(notes: TeamNotes): boolean {
  return Boolean(
    (notes.buildProcess && notes.buildProcess.trim()) ||
    (notes.basicConcepts && notes.basicConcepts.trim()) ||
    (notes.metaPlans && notes.metaPlans.trim()),
  );
}
