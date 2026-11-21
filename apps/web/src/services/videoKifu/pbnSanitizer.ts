import { right, left, isLeft } from "fp-ts/lib/Either";
import { getApplicativeValidation } from "fp-ts/lib/Either";
import { getSemigroup } from "fp-ts/lib/ReadonlyArray";
import { sequenceT } from "fp-ts/lib/Apply";
import { MitamaError, ValidateResult, anyhow } from "@/errors/anyhow/error";
import type { TurnRecord, LogEvent } from "@/services/battleLogParser";

const ap = getApplicativeValidation(getSemigroup<MitamaError>());

/**
 * PBN 文字列にレンダリングされる「前」の構造化データ（TurnRecord / LogEvent）に対して
 * ダブルバトル（VGC）の不変条件を型安全に検証・サニタイズする。
 * fp-ts の Validated を用いて、すべての不変条件違反を集約して報告する。
 */

const RESIDUAL_BRACKETS = new Set<string>([
  "sandstorm",
  "life-orb",
  "burn",
  "poison",
  "recoil",
  "crash",
  "leech-seed",
  "curse",
  "spikes",
  "stealth-rock",
  "bind",
  "grassy-terrain",
]);

const NON_ATTACKING_MOVES =
  /protect|detect|endure|spiky-shield|kings-shield|baneful-bunker|wide-guard|quick-guard|swords-dance|tailwind|trick-room|helping-hand|parting-shot|yawn|taunt|will-o-wisp|thunder-wave|spore/i;

/**
 * 物理的サニタイズ（PBN レンダリング前のターンデータ健全化）:
 * 1. 同一ターン内での同一スロットによる二重行動（重複 move イベント）を物理的に排除
 * 2. 単体技における誤った自己攻撃ターゲット（-> slot）の除去
 */
export function sanitizeTurnEvents(turn: TurnRecord): TurnRecord {
  const actedSlots = new Set<string>();
  const sanitizedEvents: LogEvent[] = [];

  for (const ev of turn.events) {
    if (ev.verb === "move") {
      const slot = ev.args[0] ?? "";
      const moveSlug = ev.args[1] ?? "";

      // 同一ターンで既に技行使済みのスロットによる2回目の技はノイズとして物理的に除外
      if (actedSlots.has(slot)) {
        continue;
      }
      actedSlots.add(slot);

      // 単体技でターゲットが自身になっている不正な指定を修正
      const isSelfMove = /curse|belly-drum|substitute|pain-split/i.test(moveSlug);
      const arrowIdx = ev.args.indexOf("->");
      if (!isSelfMove && arrowIdx >= 0 && arrowIdx + 1 < ev.args.length) {
        const target = ev.args[arrowIdx + 1];
        if (target === slot) {
          // 自身のスロットへのターゲット指定を除去
          const cleanArgs = [...ev.args.slice(0, arrowIdx), ...ev.args.slice(arrowIdx + 2)];
          sanitizedEvents.push({ ...ev, args: cleanArgs });
          continue;
        }
      }
    }

    sanitizedEvents.push(ev);
  }

  return {
    ...turn,
    events: sanitizedEvents,
  };
}

/**
 * 全ターンの構造的サニタイズ
 */
export function sanitizeAllTurns(turns: readonly TurnRecord[]): readonly TurnRecord[] {
  return turns.map(sanitizeTurnEvents);
}

/**
 * 1. 初手アクティブスロットの検証
 * Turn 1 の stateSnapshot において、自分側(p1a, p1b)および相手側(p2a, p2b)の
 * アクティブスロットの種族スラッグが null のまま進行していないことを検証する。
 * これが未解決の場合、以降の全解析が破綻するため即座に検証失敗とする。
 */
export function validateLeadActiveSlots(
  turns: readonly TurnRecord[],
): ValidateResult<readonly TurnRecord[]> {
  const errors: MitamaError[] = [];
  const turn1 = turns.find((t) => t.turnNumber === 1);

  if (turn1) {
    const snap = turn1.stateSnapshot;
    if (!snap.p1a.slug || !snap.p1b.slug) {
      errors.push(
        anyhow(
          `[LeadSlotUnresolved] Turn 1 player active slot is unresolved (p1a: ${snap.p1a.slug ?? "null"}, p1b: ${snap.p1b.slug ?? "null"}). Lead deployment was missed.`,
        ),
      );
    }
    if (!snap.p2a.slug || !snap.p2b.slug) {
      errors.push(
        anyhow(
          `[LeadSlotUnresolved] Turn 1 opponent active slot is unresolved (p2a: ${snap.p2a.slug ?? "null"}, p2b: ${snap.p2b.slug ?? "null"}). Lead deployment was missed.`,
        ),
      );
    }
  }

  if (errors.length > 0) {
    return left(errors);
  }
  return right(turns);
}

/**
 * 2. 自己攻撃の検証
 * 単体攻撃技において、攻撃スロット自身を対象として直接ダメージを与えている異常を検出する。
 */
export function validateNoSelfAttack(
  turns: readonly TurnRecord[],
): ValidateResult<readonly TurnRecord[]> {
  const errors: MitamaError[] = [];

  for (const turn of turns) {
    let currentActor: string | null = null;
    let currentMove: string | null = null;

    for (let i = 0; i < turn.events.length; i++) {
      const ev = turn.events[i]!;

      if (ev.verb === "move") {
        currentActor = ev.args[0] ?? null;
        currentMove = ev.args[1] ?? null;
        if (currentMove && NON_ATTACKING_MOVES.test(currentMove)) {
          currentActor = null;
          currentMove = null;
        }
        continue;
      }

      if (ev.verb === "switch" || ev.verb === "weather" || ev.verb === "terrain") {
        currentActor = null;
        currentMove = null;
        continue;
      }

      if (ev.verb === "damage" && currentActor && currentMove) {
        const target = ev.args[0] ?? null;
        const isResidual = Boolean(ev.bracket && RESIDUAL_BRACKETS.has(ev.bracket));
        const isSelfHurtMove = /curse|belly-drum|substitute|pain-split/i.test(currentMove);

        if (target === currentActor && !isResidual && !isSelfHurtMove) {
          errors.push(
            anyhow(
              `[SelfAttackDetected] Turn ${turn.turnNumber}: Move "${currentMove}" used by ${currentActor} inflicts direct target damage to itself (${target}).`,
            ),
          );
        }
        currentActor = null;
        currentMove = null;
      }
    }
  }

  if (errors.length > 0) {
    return left(errors);
  }
  return right(turns);
}

/**
 * 3. ターンの二重行動の検証
 * 1ターン内で同一スロットが2回以上通常技を行使していないかを検証する。
 */
export function validateNoDuplicateActionPerTurn(
  turns: readonly TurnRecord[],
): ValidateResult<readonly TurnRecord[]> {
  const errors: MitamaError[] = [];

  for (const turn of turns) {
    const moveCountBySlot = new Map<string, string[]>();

    for (const ev of turn.events) {
      if (ev.verb === "move") {
        const slot = ev.args[0] ?? "unknown";
        const moveSlug = ev.args[1] ?? "unknown";
        const list = moveCountBySlot.get(slot) ?? [];
        list.push(moveSlug);
        moveCountBySlot.set(slot, list);
      }
    }

    for (const [slot, moves] of moveCountBySlot.entries()) {
      if (moves.length > 1) {
        errors.push(
          anyhow(
            `[DuplicateActionPerTurn] Turn ${turn.turnNumber}: Slot ${slot} executed multiple moves in one turn: [${moves.join(", ")}].`,
          ),
        );
      }
    }
  }

  if (errors.length > 0) {
    return left(errors);
  }
  return right(turns);
}

/**
 * PBN 文字列にレンダリングする前に、構造化されたターン情報・イベント列に対して
 * 1. 物理的サニタイズ（重複行動・自己攻撃ターゲットの除去）を適用
 * 2. fp-ts の sequenceT(ap) で合成検証を実行
 */
export function sanitizeAndValidateBattleLog(
  turns: readonly TurnRecord[],
  _leadEvents: readonly LogEvent[],
): ValidateResult<readonly TurnRecord[]> {
  // まず物理的サニタイズを実行
  const sanitizedTurns = sanitizeAllTurns(turns);

  // サニタイズ結果に対して fp-ts Validated による不変条件検証を実行
  const validation = sequenceT(ap)(
    validateLeadActiveSlots(sanitizedTurns),
    validateNoSelfAttack(sanitizedTurns),
    validateNoDuplicateActionPerTurn(sanitizedTurns),
  );

  if (isLeft(validation)) {
    return left(validation.left);
  }

  return right(sanitizedTurns);
}
