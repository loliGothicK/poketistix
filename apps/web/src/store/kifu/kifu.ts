import * as v from "valibot";

export type KifuSheetType = "OTS" | "CTS";
export type KifuResultType = "WIN" | "LOSS" | "DRAW" | "UNKNOWN";

/** 棋譜内の1イベント（ブロックネストは children に格納） */
export interface KifuEvent {
  readonly verb: string;
  readonly args: readonly string[];
  readonly bracket?: string;
  readonly comment?: string;
  readonly children?: readonly KifuEvent[];
}

export interface KifuTurn {
  readonly turnNumber: number;
  readonly timestampMs: number | null;
  readonly field: readonly string[];
  readonly cmd: {
    readonly p1a: string | null;
    readonly p1b: string | null;
  };
  readonly events: readonly KifuEvent[];
}

/** PBN 1.0 を構造化した JSONB ドキュメント（SQL / GIN インデックスで集計・検索可能） */
export interface KifuDocument {
  readonly version: string;
  readonly regulation: string | null;
  readonly sheet: KifuSheetType | null;
  readonly result: KifuResultType;
  readonly p1Select: readonly number[];
  readonly p2Roster: readonly string[];
  readonly lead: {
    readonly timestampMs: number | null;
    readonly events: readonly KifuEvent[];
  };
  readonly turns: readonly KifuTurn[];
}

/** API / クライアント間でやり取りする Kifu DTO */
export interface Kifu {
  readonly id: string;
  readonly battleRecordId: string | null;
  readonly pbn: string;
  readonly data: KifuDocument;
  readonly regulation: string | null;
  readonly turnCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const kifuInputSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.minLength(1))),
  battleRecordId: v.nullish(v.pipe(v.string(), v.minLength(1))),
  pbn: v.pipe(v.string(), v.trim(), v.minLength(1)),
  regulation: v.nullish(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32))),
});

export type KifuInput = v.InferOutput<typeof kifuInputSchema>;

export const kifuUpdateSchema = v.object({
  battleRecordId: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  pbn: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  regulation: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32)))),
});

export type KifuUpdate = v.InferOutput<typeof kifuUpdateSchema>;

/** 1行の PBN イベント行を KifuEvent にパースする */
function parseEventLine(rawContent: string): KifuEvent {
  let content = rawContent.trim();
  let comment: string | undefined;
  let bracket: string | undefined;

  // インラインコメント `{ protected }` / `{ failed }` など（ブロック開始 `{` を除く）
  const inlineBrace = /\s*\{\s*([^{}]+?)\s*\}$/.exec(content);
  if (inlineBrace?.[1]) {
    comment = inlineBrace[1].trim();
    content = content.slice(0, inlineBrace.index).trim();
  }

  // 角括弧ブラケット `[sandstorm]` / `[leftovers]` / `[crit]` など
  const bracketMatch = /\s*\[([^\]]+)\]$/.exec(content);
  if (bracketMatch?.[1]) {
    bracket = bracketMatch[1].trim();
    content = content.slice(0, bracketMatch.index).trim();
  }

  // ターゲット結果行（例: `p1a: 202/202 -> 154/202` / `p2b: atk -1, spa -1`）
  const colonIdx = content.indexOf(":");
  if (colonIdx > 0 && /^p[12][ab]$/.test(content.slice(0, colonIdx).trim())) {
    const slot = content.slice(0, colonIdx).trim();
    const rest = content.slice(colonIdx + 1).trim();
    return {
      verb: "target",
      args: rest ? [slot, rest] : [slot],
      ...(bracket ? { bracket } : {}),
      ...(comment ? { comment } : {}),
    };
  }

  const tokens = content.split(/\s+/).filter(Boolean);
  const verb = tokens[0] ?? "";
  const args = tokens.slice(1);
  return {
    verb,
    args,
    ...(bracket ? { bracket } : {}),
    ...(comment ? { comment } : {}),
  };
}

/**
 * PBN 1.0 テキストを構造化 `KifuDocument` (JSONB) にパースする。
 * サーバー側で `kifus.data` を生成する際の正規パーサー。
 */
export function parsePbnToKifuDocument(pbnText: string): KifuDocument {
  let version = "1.0";
  let regulation: string | null = null;
  let sheet: KifuSheetType | null = null;
  let result: KifuResultType = "UNKNOWN";
  const p1Select: number[] = [];
  const p2Roster: string[] = [];

  let leadTimestampMs: number | null = null;
  const leadEvents: KifuEvent[] = [];
  const turns: {
    turnNumber: number;
    timestampMs: number | null;
    field: string[];
    cmd: { p1a: string | null; p1b: string | null };
    events: KifuEvent[];
  }[] = [];

  type MutableEvent = {
    verb: string;
    args: readonly string[];
    bracket?: string;
    comment?: string;
    children?: readonly KifuEvent[];
  };

  let section: "header" | "lead" | "turn" = "header";
  let inStateBlock = false;
  let currentTargetEvents: KifuEvent[] = leadEvents;
  const blockStack: KifuEvent[][] = [];

  const pushEvent = (ev: KifuEvent) => {
    const container =
      blockStack.length > 0 ? blockStack[blockStack.length - 1]! : currentTargetEvents;
    container.push(ev);
  };

  for (const rawLine of pbnText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;

    // ヘッダータグ `[Key "Value"]`
    const headerMatch = /^\[([A-Za-z0-9_-]+)\s+"([^"]*)"\]$/.exec(trimmed);
    if (headerMatch) {
      const key = headerMatch[1]?.toLowerCase();
      const val = headerMatch[2]?.trim() ?? "";
      if (key === "pbn" && val) version = val;
      else if (key === "regulation" && val) regulation = val;
      else if (key === "sheet" && (val === "OTS" || val === "CTS")) sheet = val;
      else if (
        key === "result" &&
        (val === "WIN" || val === "LOSS" || val === "DRAW" || val === "UNKNOWN")
      ) {
        result = val;
      }
      continue;
    }

    if (trimmed.startsWith("@select ")) {
      p1Select.length = 0;
      for (const tok of trimmed.slice("@select ".length).split(",")) {
        const n = Number.parseInt(tok.trim(), 10);
        if (Number.isFinite(n) && n >= 0 && n < 6) p1Select.push(n);
      }
      continue;
    }

    if (trimmed.startsWith("@p2 ")) {
      const left = trimmed.slice("@p2 ".length).split("|")[0]?.split("@")[0]?.trim() ?? "";
      const toks = left.split(/\s+/);
      const slug = (toks.length >= 2 ? toks[1] : toks[0])?.trim();
      if (slug && !p2Roster.includes(slug)) p2Roster.push(slug);
      continue;
    }

    if (trimmed.startsWith("@p1 ")) {
      continue;
    }

    if (trimmed.startsWith("@lead")) {
      section = "lead";
      inStateBlock = false;
      blockStack.length = 0;
      currentTargetEvents = leadEvents;
      const ts = /@t=(\d+)ms/.exec(trimmed);
      leadTimestampMs = ts?.[1] ? Number.parseInt(ts[1], 10) : null;
      continue;
    }

    if (trimmed.startsWith("@turn ")) {
      section = "turn";
      inStateBlock = false;
      blockStack.length = 0;
      const numMatch = /^@turn\s+(\d+)/.exec(trimmed);
      const turnNumber = numMatch?.[1] ? Number.parseInt(numMatch[1], 10) : turns.length + 1;
      const ts = /@t=(\d+)ms/.exec(trimmed);
      const turn = {
        turnNumber,
        timestampMs: ts?.[1] ? Number.parseInt(ts[1], 10) : null,
        field: [] as string[],
        cmd: { p1a: null as string | null, p1b: null as string | null },
        events: [] as KifuEvent[],
      };
      turns.push(turn);
      currentTargetEvents = turn.events;
      continue;
    }

    if (section === "turn" && turns.length > 0) {
      const currentTurn = turns[turns.length - 1]!;
      if (trimmed.startsWith("@field ")) {
        inStateBlock = false;
        const items = trimmed
          .slice("@field ".length)
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
        currentTurn.field.push(...items);
        continue;
      }
      if (trimmed === "@state") {
        inStateBlock = true;
        continue;
      }
      if (trimmed.startsWith("@cmd ")) {
        inStateBlock = false;
        for (const part of trimmed.slice("@cmd ".length).split("|")) {
          const p = part.trim();
          if (p.startsWith("p1a:")) currentTurn.cmd.p1a = p.slice(4).trim() || null;
          else if (p.startsWith("p1b:")) currentTurn.cmd.p1b = p.slice(4).trim() || null;
        }
        continue;
      }
      if (inStateBlock) {
        if (
          trimmed === "p1:" ||
          trimmed === "p2:" ||
          trimmed.startsWith("|") ||
          /^p[12][ab]:/.test(trimmed)
        ) {
          continue;
        }
        inStateBlock = false;
      }
    }

    if (section === "header") continue;

    if (trimmed === "}") {
      if (blockStack.length > 0) blockStack.pop();
      continue;
    }

    if (trimmed.endsWith("{")) {
      const head = trimmed.slice(0, -1).trim();
      const children: KifuEvent[] = [];
      const ev: MutableEvent = { ...parseEventLine(head), children };
      pushEvent(ev);
      blockStack.push(children);
      continue;
    }

    pushEvent(parseEventLine(trimmed));
  }

  return {
    version,
    regulation,
    sheet,
    result,
    p1Select,
    p2Roster,
    lead: {
      timestampMs: leadTimestampMs,
      events: leadEvents,
    },
    turns,
  };
}
