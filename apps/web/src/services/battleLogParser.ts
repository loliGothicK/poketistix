/**
 * バトルログ（画面下部メッセージ枠・特性バナー）の OCR テキストだけから PBN イベントを組み立てる状態機械。
 *
 * 設計方針:
 * - イベントの根拠は「画面に表示されたメッセージ」のみ。HP バー等のピクセル値からイベントは作らない。
 * - 同一メッセージの多重検出は (1) 表示中の OCR 揺らぎを吸収する類似度判定、(2) 状態遷移の検査
 *   （既にひんし・既に同じ天候・同ターン同技 など）の二段で排除する。
 * - 判定できなかったメッセージは捨てずに PBN コメント行 (`# ...`) として残し、欠損を可視化する。
 */
import {
  approxFind,
  fuzzyMatchEntity,
  normalizeOcrToken,
  similarity,
  type LocalizedEntityAlias,
} from "./ocrText";
import {
  DEFAULT_LOG_PATTERN_SETS,
  type BattleLogPatternSet,
  type FieldEffect,
} from "./battleLogPatterns";
import { moveByIdentifier } from "@/data/moves";

export type SlotIdent = "p1a" | "p1b" | "p2a" | "p2b";

const SLOTS: readonly SlotIdent[] = ["p1a", "p1b", "p2a", "p2b"];
const OWN_SLOTS: readonly ("p1a" | "p1b")[] = ["p1a", "p1b"];
const OPP_SLOTS: readonly SlotIdent[] = ["p2a", "p2b"];

/** 同一メッセージが表示され続けているとみなす最大間隔 */
const REPEAT_WINDOW_MS = 12_000;
/** OCR 揺らぎを許容して「同じ表示」とみなす類似度 */
const REPEAT_SIMILARITY = 0.78;
/** 固定フレーズの検出に必要な一致度 */
const PHRASE_THRESHOLD = 0.8;
/** ポケモン名の検出に必要な一致度 */
const NAME_THRESHOLD = 0.75;

export interface LogDictionaries {
  readonly species: readonly LocalizedEntityAlias[];
  readonly moves: readonly LocalizedEntityAlias[];
  readonly abilities: readonly LocalizedEntityAlias[];
  readonly items: readonly LocalizedEntityAlias[];
}

export interface BattleLogParserOptions {
  readonly myTeam: readonly { readonly identifier: string; readonly slug: string }[];
  readonly dictionaries: LogDictionaries;
  /** 相手の見せ合い 6 体（未検出の種族が現れたら末尾に追加される） */
  readonly p2Roster: string[];
  readonly p1MaxHp: (teamIdx: number) => number;
  readonly p1ItemSlug: (teamIdx: number) => string | null;
  readonly p1AbilitySlug?: (teamIdx: number) => string | null;
  readonly p1Speed?: (teamIdx: number) => number;
  readonly patternSets?: readonly BattleLogPatternSet[];
}

interface ActiveMon {
  readonly slug: string;
  readonly teamIdx: number;
  /** メッセージ内での出現を探すための正規化済み名前候補 */
  readonly names: readonly string[];
}

interface LogEvent {
  readonly verb: string;
  args: string[];
  readonly t: number;
  readonly confidence: number;
  readonly review: boolean;
  comment?: string;
  bracket?: string;
  protectedSlots?: string[];
}

interface SlotAction {
  readonly choice: string;
}

interface SlotStateSnapshot {
  readonly slug: string | null;
  readonly teamIdx: number | null;
  readonly hp: string | null;
  readonly fainted: boolean;
  readonly status: string | null;
  readonly volatileStatus: Record<string, number | boolean>;
  readonly boosts: Record<string, number>;
}

interface TurnStateSnapshot {
  readonly p1a: SlotStateSnapshot;
  readonly p1b: SlotStateSnapshot;
  readonly p2a: SlotStateSnapshot;
  readonly p2b: SlotStateSnapshot;
  readonly ownHpByTeamIdx: Record<number, string>;
  readonly oppHpBySlug: Record<string, string>;
  readonly faintedOwnIndices: number[];
  readonly faintedOppSlugs: string[];
  readonly observedOppSlugs: string[];
}

interface TurnRecord {
  readonly turnNumber: number;
  readonly timestampMs: number;
  readonly fieldEffects: readonly string[];
  readonly stateSnapshot: TurnStateSnapshot;
  readonly actions: [SlotAction | null, SlotAction | null];
  readonly mega: Record<"p1a" | "p1b", boolean>;
  readonly activeAtStart: Record<"p1a" | "p1b", boolean>;
  readonly events: LogEvent[];
}

const PROTECT_MOVE = /protect|detect|shield|bunker|silk-trap|bulwark|obstruct|guard/;

export function isMultiTargetMove(moveSlug: string): boolean {
  const move = moveByIdentifier.get(moveSlug);
  if (!move) return false;
  return (
    move.range === "all-pokemon" ||
    move.range === "all-opponents" ||
    move.range === "all-allies" ||
    move.range === "entire-field" ||
    move.range === "user's-side" ||
    move.range === "opponent's-side"
  );
}

const reverse = (s: string): string => Array.from(s).reverse().join("");

const nameVariants = (name: string): string[] => {
  const full = normalizeOcrToken(name);
  const base = normalizeOcrToken(name.split("-")[0] ?? name);
  const res = base.length >= 4 && base !== full ? [full, base] : [full];
  if (full.length >= 7) res.push(full.slice(1));
  if (base.length >= 7 && base !== full) res.push(base.slice(1));
  return res;
};

const slotIndex = (slot: "p1a" | "p1b"): 0 | 1 => (slot === "p1a" ? 0 : 1);

export class BattleLogParser {
  private readonly options: BattleLogParserOptions;
  private readonly slots: Record<SlotIdent, ActiveMon | null> = {
    p1a: null,
    p1b: null,
    p2a: null,
    p2b: null,
  };
  private readonly fainted: Record<SlotIdent, boolean> = {
    p1a: false,
    p1b: false,
    p2a: false,
    p2b: false,
  };
  private readonly currentHp: Record<SlotIdent, string | null> = {
    p1a: null,
    p1b: null,
    p2a: null,
    p2b: null,
  };
  private readonly statusCondition: Record<SlotIdent, string | null> = {
    p1a: null,
    p1b: null,
    p2a: null,
    p2b: null,
  };
  private readonly volatileStatus: Record<SlotIdent, Record<string, number | boolean>> = {
    p1a: {},
    p1b: {},
    p2a: {},
    p2b: {},
  };
  private readonly statStages: Record<SlotIdent, Record<string, number>> = {
    p1a: {},
    p1b: {},
    p2a: {},
    p2b: {},
  };
  private readonly pendingPerishFaint = new Set<SlotIdent>();
  /** 自軍ポケモンごとの最新HP（キー: teamIdx 0..5, 形式: "curr/max" または "XX%"） */
  private readonly lastKnownOwnHp: Record<number, string> = {};
  /** 相手ポケモンごとの最新HP（キー: slug, 形式: "XX%"） */
  private readonly lastKnownOppHp: Record<string, string> = {};
  private readonly megaStone: Partial<Record<SlotIdent, string>> = {};
  private readonly leadEvents: LogEvent[] = [];
  private readonly turns: TurnRecord[] = [];
  private weather = "None";
  private terrain = "None";
  private trickRoom = false;
  private weatherState: { kind: string; startTurn: number; maxTurns: number } | null = null;
  private terrainState: { kind: string; startTurn: number; maxTurns: number } | null = null;
  private trickRoomState: { startTurn: number; maxTurns: number } | null = null;
  private leadMs: number | null = null;
  private lastMessageKey = "";
  private lastMessageMs = Number.NEGATIVE_INFINITY;
  private lastBannerSlot: SlotIdent | null = null;
  private lastBannerAbility = "";
  private lastBannerMs = Number.NEGATIVE_INFINITY;
  private pendingWithdrawSlot: SlotIdent | null = null;
  private lastMultiTargetSlots: SlotIdent[] = [];
  private recentHealWithoutBracket: Partial<Record<SlotIdent, LogEvent>> = {};
  private pendingHealBracket: Partial<Record<SlotIdent, string>> = {};
  private healedFromTerrainThisTurn: Partial<Record<SlotIdent, boolean>> = {};
  private pendingSideItemHeal: Partial<Record<"p1" | "p2", string>> = {};
  private pendingCrit = false;
  private recentBracketedDamage: Partial<Record<SlotIdent, { hpAfter: string; t: number }>> = {};

  private readonly patternSets: readonly BattleLogPatternSet[];

  /** 実際に場に出た自分のポケモン（登録パーティ内インデックス, 出現順） */
  readonly observedOwnIndices: number[] = [];

  private p1Selection: number[] = [];
  private readonly faintedOwnTeamIndices = new Set<number>();
  private readonly faintedOppSlugs = new Set<string>();
  private readonly observedOppSlugs = new Set<string>();

  constructor(options: BattleLogParserOptions) {
    this.options = options;
    this.patternSets = options.patternSets ?? DEFAULT_LOG_PATTERN_SETS;
  }

  setP1Selection(selection: readonly number[]): void {
    this.p1Selection = [...selection];
  }

  get hasLead(): boolean {
    return this.leadMs !== null;
  }

  get leadTimestampMs(): number | null {
    return this.leadMs;
  }

  get turnCount(): number {
    return this.turns.length;
  }

  private computeActiveFieldEffects(turnNumber: number): string[] {
    const effects: string[] = [];

    if (this.weatherState) {
      const elapsed = turnNumber - this.weatherState.startTurn + 1;
      if (elapsed >= 1 && elapsed <= this.weatherState.maxTurns) {
        effects.push(`${this.weatherState.kind} ${elapsed}/${this.weatherState.maxTurns}`);
      } else {
        this.weatherState = null;
        this.weather = "None";
      }
    }

    if (this.terrainState) {
      const elapsed = turnNumber - this.terrainState.startTurn + 1;
      if (elapsed >= 1 && elapsed <= this.terrainState.maxTurns) {
        effects.push(`${this.terrainState.kind} ${elapsed}/${this.terrainState.maxTurns}`);
      } else {
        this.terrainState = null;
        this.terrain = "None";
      }
    }

    if (this.trickRoomState) {
      const elapsed = turnNumber - this.trickRoomState.startTurn + 1;
      if (elapsed >= 1 && elapsed <= this.trickRoomState.maxTurns) {
        effects.push(`Trick Room ${elapsed}/${this.trickRoomState.maxTurns}`);
      } else {
        this.trickRoomState = null;
        this.trickRoom = false;
      }
    }

    return effects;
  }

  private detectWeatherExtender(weather: string): boolean {
    const itemMap: Record<string, string> = {
      Rain: "damp-rock",
      HarshSunlight: "heat-rock",
      Sandstorm: "smooth-rock",
      Snow: "icy-rock",
    };
    const needed = itemMap[weather];
    if (!needed) return false;
    for (const slot of OWN_SLOTS) {
      const mon = this.slots[slot];
      if (mon && this.options.p1ItemSlug(mon.teamIdx) === needed) return true;
    }
    return false;
  }

  private detectTerrainExtender(): boolean {
    for (const slot of OWN_SLOTS) {
      const mon = this.slots[slot];
      if (mon && this.options.p1ItemSlug(mon.teamIdx) === "terrain-extender") return true;
    }
    return false;
  }

  /** コマンド選択画面に入った（= 新しいターンが始まった）ことを通知する */
  beginTurn(timestampMs: number): void {
    const alive = (slot: "p1a" | "p1b"): boolean =>
      this.slots[slot] !== null && !this.fainted[slot];
    const turnNumber = this.turns.length + 1;
    const fieldEffects = this.computeActiveFieldEffects(turnNumber);

    const snapshotSlot = (slot: SlotIdent): SlotStateSnapshot => ({
      slug: this.slots[slot]?.slug ?? null,
      teamIdx: this.slots[slot]?.teamIdx ?? null,
      hp: this.currentHp[slot],
      fainted: this.fainted[slot],
      status: this.statusCondition[slot],
      volatileStatus: { ...this.volatileStatus[slot] },
      boosts: { ...this.statStages[slot] },
    });

    const stateSnapshot: TurnStateSnapshot = {
      p1a: snapshotSlot("p1a"),
      p1b: snapshotSlot("p1b"),
      p2a: snapshotSlot("p2a"),
      p2b: snapshotSlot("p2b"),
      ownHpByTeamIdx: { ...this.lastKnownOwnHp },
      oppHpBySlug: { ...this.lastKnownOppHp },
      faintedOwnIndices: Array.from(this.faintedOwnTeamIndices),
      faintedOppSlugs: Array.from(this.faintedOppSlugs),
      observedOppSlugs: Array.from(this.observedOppSlugs),
    };

    this.turns.push({
      turnNumber,
      timestampMs,
      fieldEffects,
      stateSnapshot,
      actions: [null, null],
      mega: { p1a: false, p1b: false },
      activeAtStart: { p1a: alive("p1a"), p1b: alive("p1b") },
      events: [],
    });
    this.recentHealWithoutBracket = {};
    this.pendingHealBracket = {};
    this.healedFromTerrainThisTurn = {};
    this.pendingSideItemHeal = {};
    this.pendingCrit = false;
    this.recentBracketedDamage = {};
  }

  /** 指定スロットの現在のポケモン識別子（種族スラッグ）を返す */
  getActiveSlotSlug(slot: SlotIdent): string | null {
    return this.slots[slot]?.slug ?? null;
  }

  /** 指定スロットの現在の登録パーティインデックスを返す */
  getActiveSlotTeamIdx(slot: SlotIdent): number | null {
    return this.slots[slot]?.teamIdx ?? null;
  }

  /** 指定スロットの現在のHP表記（"169/202" または "94%"）を返す */
  getCurrentSlotHp(slot: SlotIdent): string | null {
    return this.currentHp[slot];
  }

  /** コマンド選択時などHUD静止時に最新HPを同期する（イベントは発行しない） */
  reconcileSlotHp(slot: SlotIdent, hpStr: string): void {
    const mon = this.slots[slot];
    if (!mon) return;
    const formatted = this.formatHp(slot, hpStr);
    if (!formatted) return;
    this.currentHp[slot] = formatted;
    if (slot.startsWith("p1")) {
      this.lastKnownOwnHp[mon.teamIdx] = formatted;
    } else {
      this.lastKnownOppHp[mon.slug] = formatted;
    }
  }

  /** 技選択UIで選択された技を記録する（ひるみ等で不発になっても `@cmd` に残るようにする） */
  setDeclaredMove(slot: "p1a" | "p1b", moveSlug: string): void {
    const turn = this.currentTurn();
    if (!turn) return;
    if (turn.events.some((e) => (e.verb === "move" || e.verb === "switch") && e.args[0] === slot)) {
      return;
    }
    const idx = slotIndex(slot);
    turn.actions[idx] = { choice: moveSlug };
  }

  /** 特性バナー（`<Pokémon>'s <Ability>`）の OCR 結果を投入する */
  feedBanner(raw: string, side: "p1" | "p2", timestampMs: number): boolean {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => normalizeOcrToken(l).length >= 3);
    const text = raw.replace(/\s+/g, " ").trim();
    if (normalizeOcrToken(text).length < 5) return false;

    const parts = /^(.*?)(?:['’]?s)\s+(\S.*)$/iu.exec(text);
    const ownerPart = parts?.[1] ?? lines[0] ?? text;
    const bannerPart = parts?.[2] ?? (lines.length >= 2 ? lines[lines.length - 1] : null) ?? "";

    // 1. 特性（ability）との照合
    let ability = bannerPart
      ? fuzzyMatchEntity(bannerPart, this.options.dictionaries.abilities)
      : null;
    if (!ability || ability.confidence < 75) {
      const matchFull = fuzzyMatchEntity(text, this.options.dictionaries.abilities);
      if (matchFull && matchFull.confidence >= 75) {
        ability = matchFull;
      }
    }

    // 2. アイテム（item: たべのこし等の発動ダイアログ）との照合
    let item = bannerPart ? fuzzyMatchEntity(bannerPart, this.options.dictionaries.items) : null;
    if (!item || item.confidence < 75) {
      const matchFull = fuzzyMatchEntity(text, this.options.dictionaries.items);
      if (matchFull && matchFull.confidence >= 75) {
        item = matchFull;
      }
    }

    const isItem =
      item && item.confidence >= 70 && (!ability || item.confidence > ability.confidence);
    const isAbility = ability && ability.confidence >= 70 && !isItem;

    if (!isAbility && !isItem) return false;

    const candidates = side === "p1" ? OWN_SLOTS : OPP_SLOTS;
    const matched = this.resolveSlots(normalizeOcrToken(ownerPart), candidates);
    const slot: SlotIdent | undefined = matched[0];
    if (!slot) return false;
    const entitySlug = isItem ? item!.slug : ability!.slug;

    if (
      slot === this.lastBannerSlot &&
      entitySlug === this.lastBannerAbility &&
      timestampMs - this.lastBannerMs <= 6_000
    ) {
      this.lastBannerMs = timestampMs;
      return false;
    }
    this.lastBannerSlot = slot;
    this.lastBannerAbility = entitySlug;
    this.lastBannerMs = timestampMs;

    if (isItem) {
      const isHealItem =
        entitySlug === "leftovers" ||
        entitySlug === "sitrus-berry" ||
        entitySlug === "black-sludge";
      if (isHealItem) {
        this.pendingHealBracket[slot] = entitySlug;
      } else {
        if (entitySlug === "focus-sash") {
          const mon = this.slots[slot];
          const sashHp =
            slot.startsWith("p1") && mon ? `1/${this.options.p1MaxHp(mon.teamIdx)}` : "1%";
          this.currentHp[slot] = sashHp;
          if (mon) {
            if (slot.startsWith("p1")) this.lastKnownOwnHp[mon.teamIdx] = sashHp;
            else this.lastKnownOppHp[mon.slug] = sashHp;
          }
        }
        this.emit("item", [slot, entitySlug], timestampMs, item!.confidence / 100, {
          review: item!.confidence < 80,
        });
      }
    } else {
      this.emit("ability", [slot, ability!.slug], timestampMs, ability!.confidence / 100, {
        review: ability!.confidence < 80,
      });
    }
    this.lastMessageKey = "";
    return true;
  }

  /** メッセージ枠の OCR 結果を投入する */
  feedMessage(raw: string, timestampMs: number): boolean {
    const text = raw.replace(/\s+/g, " ").trim();
    const key = normalizeOcrToken(text);
    if (key.length < 4) return false;

    const events = this.currentEvents();
    let abilityCount = 0;
    for (let idx = events.length - 1; idx >= 0; idx--) {
      const ev = events[idx]!;
      if (ev.verb === "ability") abilityCount++;
      else if (ev.verb !== "boost") break;
    }
    const isStatChange = this.patternSets.some((p) =>
      p.statWords.some(({ words }) => words.some((w) => approxFind(key, w).score >= 0.82)),
    );
    const isHeal = this.patternSets.some((p) =>
      p.healPhrases.some((h) => approxFind(key, h.phrase).score >= 0.75),
    );
    const isResidualDamage = this.patternSets.some((p) =>
      p.residualDamagePhrases.some((r) => approxFind(key, r.phrase).score >= 0.75),
    );
    const isPerishCount = /perish\s*count/i.test(text);
    const isMultiTargetEvent = isStatChange || isHeal || isResidualDamage || isPerishCount;
    const resolvedSlots = isMultiTargetEvent ? this.resolveSlots(key) : [];
    const isDifferentTarget =
      isMultiTargetEvent &&
      resolvedSlots.length > 0 &&
      !resolvedSlots.every((s) => this.lastMultiTargetSlots.includes(s));

    const allowDuplicate =
      (abilityCount >= 2 && isStatChange && timestampMs - this.lastMessageMs >= 800) ||
      isDifferentTarget;

    const sameDisplay =
      !allowDuplicate &&
      timestampMs - this.lastMessageMs <= REPEAT_WINDOW_MS &&
      similarity(key, this.lastMessageKey) >= REPEAT_SIMILARITY;
    if (sameDisplay) return false;

    const handled =
      this.onForfeit(text, key, timestampMs) ||
      this.onPerishCount(text, timestampMs) ||
      this.onPerishStart(text, key, timestampMs) ||
      this.onWithdrawn(text) ||
      this.onSentOut(text, timestampMs) ||
      this.onGo(text, timestampMs) ||
      this.onMegaReaction(text, key, timestampMs) ||
      this.onMegaEvolved(text, key, timestampMs) ||
      this.onReadyToHelp(key, timestampMs) ||
      this.onMoveUsed(text, timestampMs) ||
      this.onCantMove(key, timestampMs) ||
      this.onCriticalHit(key, timestampMs) ||
      this.onEffectiveness(key, timestampMs) ||
      this.onItemMessage(key, timestampMs) ||
      this.onResidualDamage(text, key, timestampMs) ||
      this.onProtected(key, timestampMs) ||
      this.onFainted(key, timestampMs) ||
      this.onFieldChange(key, timestampMs) ||
      this.onHeal(text, key, timestampMs) ||
      this.onStatChange(key, timestampMs);

    if (handled) {
      this.lastMessageMs = timestampMs;
      this.lastMessageKey = key;
      if (isMultiTargetEvent && resolvedSlots.length > 0) {
        this.lastMultiTargetSlots = resolvedSlots;
      }
    }
    return handled;
  }

  /** PBN の `@lead` / `@turn` ブロック行を返す */
  render(): string[] {
    const lines: string[] = [];
    if (this.leadEvents.length > 0) {
      lines.push(`@lead @t=${this.leadMs ?? this.leadEvents[0]?.t ?? 0}ms`);
      lines.push(...this.renderTurnEvents(this.leadEvents));
      lines.push("");
    }
    for (const turn of this.turns) {
      lines.push(`@turn ${turn.turnNumber} @t=${turn.timestampMs}ms`);
      if (turn.fieldEffects.length > 0) {
        lines.push(`  @field ${turn.fieldEffects.join(" | ")}`);
      }
      lines.push(...this.renderTurnState(turn.stateSnapshot));
      lines.push(
        `  @cmd p1a: ${this.renderChoice(turn, "p1a")} | p1b: ${this.renderChoice(turn, "p1b")}`,
      );
      lines.push(...this.renderTurnEvents(turn.events));
      lines.push("");
    }
    return lines;
  }

  private renderTurnState(snap: TurnStateSnapshot): string[] {
    const formatMon = (
      slug: string,
      hpStr: string | null,
      isFainted: boolean,
      status?: string | null,
      volatileStatus?: Record<string, number | boolean>,
      boosts?: Record<string, number>,
    ): string => {
      let base: string;
      if (isFainted || hpStr === "0%" || (hpStr !== null && hpStr.startsWith("0/"))) {
        base = `${slug} fnt`;
      } else if (!hpStr) {
        base = `${slug} 100%`;
      } else {
        base = `${slug} ${hpStr}`;
      }

      // Status items sequence: [major_status, volatile_status...]
      const statusItems: string[] = [];
      if (status) {
        statusItems.push(status);
      }
      if (volatileStatus) {
        for (const [key, val] of Object.entries(volatileStatus)) {
          if (typeof val === "number") {
            statusItems.push(`${key}: ${val}`);
          } else if (val) {
            statusItems.push(key);
          }
        }
      }
      const statusSeqStr = statusItems.length > 0 ? ` [${statusItems.join(", ")}]` : "";

      // Stat boosts scope: (atk +1, spe -1)
      let boostStr = "";
      if (boosts) {
        const boostParts: string[] = [];
        for (const [stat, stage] of Object.entries(boosts)) {
          if (stage !== 0) {
            const sign = stage > 0 ? `+${stage}` : `${stage}`;
            boostParts.push(`${stat} ${sign}`);
          }
        }
        if (boostParts.length > 0) {
          boostStr = ` (${boostParts.join(", ")})`;
        }
      }

      return `${base}${statusSeqStr}${boostStr}`;
    };

    // P1 Active
    const p1aStr = snap.p1a.slug
      ? formatMon(
          snap.p1a.slug,
          snap.p1a.hp,
          snap.p1a.fainted,
          snap.p1a.status,
          snap.p1a.volatileStatus,
          snap.p1a.boosts,
        )
      : "? 100%";
    const p1bStr = snap.p1b.slug
      ? formatMon(
          snap.p1b.slug,
          snap.p1b.hp,
          snap.p1b.fainted,
          snap.p1b.status,
          snap.p1b.volatileStatus,
          snap.p1b.boosts,
        )
      : "? 100%";

    // P1 Bench
    const p1Selected =
      this.p1Selection.length > 0
        ? this.p1Selection.slice(0, 4)
        : this.observedOwnIndices.length > 0
          ? this.observedOwnIndices.slice(0, 4)
          : this.options.myTeam.slice(0, 4).map((_, i) => i);

    const p1ActiveIndices = new Set<number>();
    if (snap.p1a.teamIdx !== null) p1ActiveIndices.add(snap.p1a.teamIdx);
    if (snap.p1b.teamIdx !== null) p1ActiveIndices.add(snap.p1b.teamIdx);

    const p1BenchParts: string[] = [];
    for (const idx of p1Selected) {
      if (p1ActiveIndices.has(idx)) continue;
      const member = this.options.myTeam[idx];
      if (!member) continue;
      const isFnt = snap.faintedOwnIndices.includes(idx);
      const maxHp = this.options.p1MaxHp(idx);
      const hp = snap.ownHpByTeamIdx[idx] ?? `${maxHp}/${maxHp}`;
      p1BenchParts.push(formatMon(member.identifier, hp, isFnt));
    }

    // P2 Active
    const p2aStr = snap.p2a.slug
      ? formatMon(
          snap.p2a.slug,
          snap.p2a.hp,
          snap.p2a.fainted,
          snap.p2a.status,
          snap.p2a.volatileStatus,
          snap.p2a.boosts,
        )
      : "? 100%";
    const p2bStr = snap.p2b.slug
      ? formatMon(
          snap.p2b.slug,
          snap.p2b.hp,
          snap.p2b.fainted,
          snap.p2b.status,
          snap.p2b.volatileStatus,
          snap.p2b.boosts,
        )
      : "? 100%";

    // P2 Bench
    const p2ActiveSlugs = new Set<string>();
    if (snap.p2a.slug) p2ActiveSlugs.add(snap.p2a.slug);
    if (snap.p2b.slug) p2ActiveSlugs.add(snap.p2b.slug);

    const p2BenchParts: string[] = [];
    for (const slug of snap.observedOppSlugs) {
      if (p2ActiveSlugs.has(slug)) continue;
      const isFnt = snap.faintedOppSlugs.includes(slug);
      const hp = snap.oppHpBySlug[slug] ?? "100%";
      p2BenchParts.push(formatMon(slug, hp, isFnt));
    }
    const totalP2Accounted = p2ActiveSlugs.size + p2BenchParts.length;
    const missing = Math.max(0, 4 - totalP2Accounted);
    for (let k = 0; k < missing; k++) {
      p2BenchParts.push("? 100%");
    }

    const lines = [
      "  @state",
      "  p1:",
      "    | active:",
      `        p1a: ${p1aStr}`,
      `        p1b: ${p1bStr}`,
    ];
    if (p1BenchParts.length > 0) {
      lines.push(`    | bench: ${p1BenchParts.join(", ")}`);
    }
    lines.push("  p2:");
    lines.push("    | active:");
    lines.push(`        p2a: ${p2aStr}`);
    lines.push(`        p2b: ${p2bStr}`);
    if (p2BenchParts.length > 0) {
      lines.push(`    | bench: ${p2BenchParts.join(", ")}`);
    }
    return lines;
  }

  private renderTurnEvents(events: readonly LogEvent[]): string[] {
    const lines: string[] = [];
    let i = 0;
    while (i < events.length) {
      const ev = events[i]!;
      if (ev.verb === "switch") {
        const switchEvents: LogEvent[] = [];
        while (i < events.length && events[i]!.verb === "switch") {
          switchEvents.push(events[i]!);
          i++;
        }

        const abilityEvents: LogEvent[] = [];
        const boostEvents: LogEvent[] = [];
        const fieldEventsBySlot = new Map<string, LogEvent[]>();
        let lastAbilitySlot: string | null = null;

        while (i < events.length) {
          const next = events[i]!;
          if (next.verb === "ability") {
            abilityEvents.push(next);
            lastAbilitySlot = next.args[0] ?? null;
            i++;
          } else if (next.verb === "boost") {
            boostEvents.push(next);
            i++;
          } else if (next.verb === "terrain" || next.verb === "weather") {
            const targetSlot =
              lastAbilitySlot ?? switchEvents[switchEvents.length - 1]?.args[0] ?? "";
            if (!fieldEventsBySlot.has(targetSlot)) {
              fieldEventsBySlot.set(targetSlot, []);
            }
            fieldEventsBySlot.get(targetSlot)!.push(next);
            i++;
          } else {
            break;
          }
        }

        const { linesBySlot, unhandledBoosts } = renderAbilityBlocks(
          abilityEvents,
          boostEvents,
          "    ",
        );

        for (const switchEv of switchEvents) {
          const slot = switchEv.args[0]!;
          const slotAbLines = linesBySlot.get(slot) ?? [];
          const slotFieldEvs = fieldEventsBySlot.get(slot) ?? [];
          const hasChildren = slotAbLines.length > 0 || slotFieldEvs.length > 0;

          if (hasChildren) {
            lines.push(`  ${formatEvent(switchEv)} {`);
            for (const line of slotAbLines) {
              lines.push(line);
            }
            for (const fEv of slotFieldEvs) {
              lines.push(`    ${formatEvent(fEv)}`);
            }
            lines.push(`  }`);
          } else {
            lines.push(`  ${formatEvent(switchEv)}`);
          }
        }
        for (const unhandled of unhandledBoosts) {
          lines.push(`  ${formatEvent(unhandled)}`);
        }
      } else if (ev.verb === "ability") {
        const abilityEvents: LogEvent[] = [ev];
        i++;
        while (i < events.length && events[i]!.verb === "ability") {
          abilityEvents.push(events[i]!);
          i++;
        }

        const boostEvents: LogEvent[] = [];
        while (i < events.length && events[i]!.verb === "boost") {
          boostEvents.push(events[i]!);
          i++;
        }

        const { linesBySlot, unhandledBoosts } = renderAbilityBlocks(
          abilityEvents,
          boostEvents,
          "  ",
        );
        for (const blockLines of linesBySlot.values()) {
          lines.push(...blockLines);
        }
        for (const unhandled of unhandledBoosts) {
          lines.push(`  ${formatEvent(unhandled)}`);
        }
      } else if (ev.verb === "move") {
        const actor = ev.args[0];
        const moveId = ev.args[1];
        const isDefensive = moveId ? PROTECT_MOVE.test(moveId) : false;
        i++;

        const targetMap = new Map<
          string,
          {
            hp?: string;
            boosts: string[];
            crit?: boolean;
            protected?: boolean;
            reactions: LogEvent[];
          }
        >();
        const targetOrder: string[] = [];
        const actorBoosts: LogEvent[] = [];

        // 技に紐づく protectedSlots を targetMap に登録
        if (ev.protectedSlots) {
          for (const pSlot of ev.protectedSlots) {
            if (!targetMap.has(pSlot)) {
              targetMap.set(pSlot, { boosts: [], reactions: [], protected: true });
              targetOrder.push(pSlot);
            } else {
              targetMap.get(pSlot)!.protected = true;
            }
          }
        }

        while (i < events.length && !isDefensive) {
          const next = events[i]!;

          // 1. 対象へのダメージ（すなあらし・いのちのたま等の定数/反動ダメージは技ブロックに含めない）
          if (next.verb === "damage") {
            const isResidual =
              next.bracket === "sandstorm" ||
              next.bracket === "life-orb" ||
              next.bracket === "burn" ||
              next.bracket === "poison" ||
              next.bracket === "recoil";
            if (isResidual) {
              break;
            }
            const target = next.args[0]!;
            if (!targetMap.has(target)) {
              targetMap.set(target, { boosts: [], reactions: [] });
              targetOrder.push(target);
            }
            const entry = targetMap.get(target)!;
            if (entry.hp) {
              const originalBefore = entry.hp.split("->")[0]?.trim();
              const finalAfter = next.args[1]?.split("->")[1]?.trim();
              if (originalBefore && finalAfter) {
                entry.hp = `${originalBefore} -> ${finalAfter}`;
              } else {
                entry.hp = next.args[1];
              }
            } else {
              entry.hp = next.args[1];
            }
            if (next.bracket?.includes("crit")) entry.crit = true;
            i++;
            continue;
          }

          // 2. 攻撃者自身の能力変化（インファイトのBD低下、エレクトロビームの特攻上昇等）
          if (next.verb === "boost" && next.args[0] === actor) {
            actorBoosts.push(next);
            i++;
            continue;
          }

          // 3. 対象への能力変化（バークアウトの特攻低下等） vs 被弾リアクション（じきゅうりょく等）
          const isTargetBoost = next.verb === "boost" && next.args[0] !== actor;
          const reactionTarget = next.args[0];

          if (isTargetBoost) {
            const target = next.args[0]!;
            if (!targetMap.has(target)) {
              targetMap.set(target, { boosts: [], reactions: [] });
              targetOrder.push(target);
            }
            const entry = targetMap.get(target)!;
            const delta = next.args[2];
            if (entry.reactions.length > 0 || !delta?.startsWith("-")) {
              entry.reactions.push(next);
            } else {
              entry.boosts.push(`${next.args[1]} ${delta}`);
            }
            i++;
            continue;
          }

          // 4. 被弾リアクション（被弾対象の特性発動、持ち物、回復）
          // ※ 攻撃者自身のアイテム（いのちのたま等）やターン終了時回復は技リアクションに吸い込まない
          if (
            reactionTarget &&
            reactionTarget !== actor &&
            targetMap.has(reactionTarget) &&
            (next.verb === "ability" || next.verb === "item" || next.verb === "heal")
          ) {
            const isEndOfTurnHeal =
              next.verb === "heal" &&
              (next.bracket === "grassy-terrain" ||
                next.bracket === "leftovers" ||
                next.bracket === "black-sludge");
            const isAttackerItem = next.verb === "item" && next.args[1] === "life-orb";
            if (!isEndOfTurnHeal && !isAttackerItem) {
              targetMap.get(reactionTarget)!.reactions.push(next);
              i++;
              continue;
            }
          }

          break;
        }

        const fieldSubEvents: LogEvent[] = [];
        while (
          i < events.length &&
          (events[i]!.verb === "field" ||
            events[i]!.verb === "terrain" ||
            events[i]!.verb === "weather")
        ) {
          fieldSubEvents.push(events[i]!);
          i++;
        }

        const isWideGuard = ev.comment === "wide-guard";
        const isSpread = moveId ? isMultiTargetMove(moveId) : false;
        const isSingleTargetProtected =
          !isWideGuard &&
          !isSpread &&
          Boolean(ev.protectedSlots && ev.protectedSlots.length === 1) &&
          targetOrder.length === 1 &&
          !targetMap.get(targetOrder[0]!)?.hp &&
          actorBoosts.length === 0 &&
          fieldSubEvents.length === 0;

        if (isSingleTargetProtected) {
          const baseStr = formatEvent({ ...ev, comment: undefined });
          lines.push(`  ${baseStr} { protected }`);
        } else if (
          targetOrder.length === 0 &&
          actorBoosts.length === 0 &&
          fieldSubEvents.length === 0 &&
          !isWideGuard
        ) {
          lines.push(`  ${formatEvent(ev)}`);
        } else {
          const baseStr = formatEvent({ ...ev, comment: undefined });
          lines.push(`  ${baseStr} {`);
          if (isWideGuard) {
            lines.push(`    wide-guard`);
          }
          for (const b of actorBoosts) {
            lines.push(`    ${formatEvent(b)}`);
          }
          if (targetOrder.length > 0) {
            const sortedTargets = [...targetOrder].sort();
            for (const target of sortedTargets) {
              const entry = targetMap.get(target)!;
              const hasSash = entry.reactions.some(
                (r) => r.verb === "item" && r.args[1] === "focus-sash",
              );
              if (hasSash) {
                const beforeHp = entry.hp?.split("->")[0]?.trim() || "100%";
                entry.hp = `${beforeHp} -> 1%`;
              }
              const parts: string[] = [];
              if (entry.protected) parts.push("protected");
              if (entry.hp) parts.push(entry.hp);
              if (entry.boosts.length > 0) parts.push(entry.boosts.join(", "));
              const critTag = entry.crit ? " [crit]" : "";

              if (entry.reactions.length > 0) {
                const targetHeader =
                  parts.length > 0
                    ? `${target}: ${parts.join(", ")}${critTag}`
                    : `${target}${critTag}`;
                lines.push(`    ${targetHeader} {`);
                for (const r of entry.reactions) {
                  lines.push(`      ${formatEvent(r)}`);
                }
                lines.push(`    }`);
              } else if (parts.length > 0) {
                lines.push(`    ${target}: ${parts.join(", ")}${critTag}`);
              }
            }
          }
          for (const f of fieldSubEvents) {
            lines.push(`    ${formatEvent(f)}`);
          }
          lines.push(`  }`);
        }
      } else if (ev.verb === "perish") {
        const slot = ev.args[0]!;
        const transition = ev.args[1] ?? "";
        if (transition.endsWith("-> 0")) {
          if (
            i + 1 < events.length &&
            events[i + 1]!.verb === "faint" &&
            events[i + 1]!.args[0] === slot
          ) {
            const baseStr = formatEvent(ev);
            lines.push(`  ${baseStr} {`);
            lines.push(`    ${formatEvent(events[i + 1]!)}`);
            lines.push(`  }`);
            i += 2;
            continue;
          }
        }
        lines.push(`  ${formatEvent(ev)}`);
        i++;
      } else if (
        ev.verb === "item" &&
        ev.args[1] === "life-orb" &&
        i + 1 < events.length &&
        events[i + 1]!.verb === "damage" &&
        events[i + 1]!.args[0] === ev.args[0]
      ) {
        const dmgEv = events[i + 1]!;
        const slot = ev.args[0]!;
        const baseStr = formatEvent(ev);
        lines.push(`  ${baseStr} {`);
        lines.push(`    ${slot}: ${dmgEv.args[1]}`);
        lines.push(`  }`);
        i += 2;
      } else {
        lines.push(`  ${formatEvent(ev)}`);
        i++;
      }
    }
    return lines;
  }

  private renderChoice(turn: TurnRecord, slot: "p1a" | "p1b"): string {
    const action = turn.actions[slotIndex(slot)];
    if (!action) return turn.activeAtStart[slot] ? "?" : "pass";
    return turn.mega[slot] ? `${action.choice} +mega` : action.choice;
  }

  // ---------------------------------------------------------------------------
  // イベント出力
  // ---------------------------------------------------------------------------

  private currentEvents(): LogEvent[] {
    return this.turns[this.turns.length - 1]?.events ?? this.leadEvents;
  }

  private currentTurn(): TurnRecord | null {
    return this.turns[this.turns.length - 1] ?? null;
  }

  private emit(
    verb: string,
    args: string[],
    t: number,
    confidence: number,
    opts: { review: boolean; unique?: boolean; comment?: string; bracket?: string },
  ): LogEvent | null {
    const bucket = this.currentEvents();
    if (opts.unique) {
      const joined = args.join(" ");
      if (bucket.some((ev) => ev.verb === verb && ev.args.join(" ") === joined)) return null;
    }
    const ev: LogEvent = { verb, args, t, confidence, review: opts.review };
    if (opts.comment) ev.comment = opts.comment;
    if (opts.bracket) ev.bracket = opts.bracket;
    bucket.push(ev);
    return ev;
  }

  currentTurnHasMove(): boolean {
    const turn = this.currentTurn();
    if (!turn) return false;
    return turn.events.some((e) => e.verb === "move");
  }

  private parseHpValue(hpStr: string): number {
    const frac = /^(\d+)\/(\d+)$/.exec(hpStr);
    if (frac) {
      const curr = parseInt(frac[1]!, 10);
      const max = parseInt(frac[2]!, 10);
      return max > 0 ? curr / max : 0;
    }
    const pct = /^(\d+)%$/.exec(hpStr);
    if (pct) {
      return parseInt(pct[1]!, 10) / 100;
    }
    return 0;
  }

  getLastKnownHpPercent(slot: SlotIdent): number {
    const mon = this.slots[slot];
    if (!mon) return 100;
    if (slot.startsWith("p1")) {
      const known = this.lastKnownOwnHp[mon.teamIdx];
      if (!known) return 100;
      return Math.round(this.parseHpValue(known) * 100);
    } else {
      const known = this.lastKnownOppHp[mon.slug];
      if (!known) return 100;
      return Math.round(this.parseHpValue(known) * 100);
    }
  }

  private formatHp(slot: SlotIdent, hpStr: string | null | undefined): string | null {
    if (!hpStr) return null;
    if (!slot.startsWith("p1")) return hpStr;
    const mon = this.slots[slot];
    if (!mon) return hpStr;
    const maxHp = this.options.p1MaxHp(mon.teamIdx);
    const m = /^(\d+)%$/.exec(hpStr);
    if (m) {
      const pct = parseInt(m[1]!, 10);
      const curr = Math.round((maxHp * pct) / 100);
      return `${curr}/${maxHp}`;
    }
    return hpStr;
  }

  feedDamage(
    target: SlotIdent,
    hpBefore: string,
    hpAfter: string,
    delta: string,
    t: number,
    opts?: { crit?: boolean },
  ): void {
    if (this.pendingPerishFaint.has(target)) return;
    if (hpBefore === "0%" || hpBefore.startsWith("0/")) return;
    if (!this.hasLead || !this.slots[target]) return;

    // ターン開始後、最初の技が出る前に発生するダメージについて：
    // 交代があった直後でもダメージを受け得るのは交代したポケモン自身（ステロ等）のみ。
    // それ以外のスロットへのダメージは交代演出・画面暗転によるノイズなので遮断する。
    const turn = this.currentTurn();
    if (turn && !turn.events.some((e) => e.verb === "move")) {
      const switchedSlots = turn.events.filter((e) => e.verb === "switch").map((e) => e.args[0]);
      if (!switchedSlots.includes(target)) {
        return;
      }
    }

    const prevHp = this.currentHp[target];
    const resolvedBefore = this.formatHp(target, prevHp || hpBefore)!;
    const resolvedAfter = this.formatHp(target, hpAfter)!;
    if (resolvedBefore === resolvedAfter) return;

    // 不変条件: ダメージ処理で HP が増加または維持されることはあり得ない
    const valBefore = this.parseHpValue(resolvedBefore);
    const valAfter = this.parseHpValue(resolvedAfter);
    if (valAfter >= valBefore) return;

    const recentBracketed = this.recentBracketedDamage[target];
    if (
      recentBracketed &&
      t - recentBracketed.t <= 3000 &&
      Math.abs(valAfter - this.parseHpValue(recentBracketed.hpAfter)) <= 0.025
    ) {
      return;
    }

    this.currentHp[target] = resolvedAfter;
    const isZeroHp = resolvedAfter === "0%" || resolvedAfter.startsWith("0/");
    const mon = this.slots[target];
    if (mon) {
      if (target.startsWith("p1")) {
        this.lastKnownOwnHp[mon.teamIdx] = resolvedAfter;
        if (isZeroHp) {
          this.faintedOwnTeamIndices.add(mon.teamIdx);
        }
      } else {
        this.lastKnownOppHp[mon.slug] = resolvedAfter;
        if (isZeroHp) {
          this.faintedOppSlugs.add(mon.slug);
        }
      }
    }
    const isCrit = opts?.crit || this.pendingCrit;
    this.pendingCrit = false;
    const bracket = isCrit ? "crit" : undefined;
    const args = [target, `${resolvedBefore} -> ${resolvedAfter}`];
    this.emit("damage", args, t, 1, { review: false, bracket });
  }

  feedHeal(
    target: SlotIdent,
    hpBefore: string,
    hpAfter: string,
    delta: string,
    t: number,
    opts?: { effect?: string },
  ): void {
    if (hpBefore === "0%" || hpBefore.startsWith("0/")) return;
    if (!this.hasLead || !this.slots[target]) return;

    // ターン開始後、最初の技が起きる前に発生する回復は画面遷移・演出ノイズ
    const turn = this.currentTurn();
    if (turn && !turn.events.some((e) => e.verb === "move")) {
      return;
    }

    const prevHp = this.currentHp[target];
    const resolvedBefore = this.formatHp(target, prevHp || hpBefore)!;
    const mon = this.slots[target];
    const isOwn = target.startsWith("p1") && mon !== null;
    const maxHp = isOwn ? this.options.p1MaxHp(mon!.teamIdx) : 100;

    // 1. 直前の heal がまだ bracket 未確定で、同一の回復アニメーション進行中の場合は数値を更新
    const unbracketed = this.recentHealWithoutBracket[target];
    if (unbracketed && unbracketed.args[1]?.startsWith(`${resolvedBefore} ->`)) {
      const updatedAfter = this.formatHp(target, hpAfter)!;
      unbracketed.args[1] = `${resolvedBefore} -> ${updatedAfter}`;
      this.currentHp[target] = updatedAfter;
      if (mon) {
        if (isOwn) this.lastKnownOwnHp[mon.teamIdx] = updatedAfter;
        else this.lastKnownOppHp[mon.slug] = updatedAfter;
      }
      return;
    }

    const side = target.startsWith("p1") ? "p1" : "p2";

    // 2. 先行するバナー（例: Leftovers）または opts による bracket
    let pendingBracket = opts?.effect ?? this.pendingHealBracket[target];
    if (pendingBracket) {
      this.pendingHealBracket[target] = undefined;
    } else if (this.pendingSideItemHeal[side]) {
      pendingBracket = this.pendingSideItemHeal[side];
      this.pendingSideItemHeal[side] = undefined;
    }

    // 1/16 定率回復（grassy-terrain, leftovers, black-sludge）のキャリブレーション
    let calculatedAfter = hpAfter;
    if (
      pendingBracket === "grassy-terrain" ||
      pendingBracket === "leftovers" ||
      pendingBracket === "black-sludge"
    ) {
      if (isOwn) {
        // 自軍は 1/16（端数切り捨て、最低1）を正確に実数値加算
        const healAmt = Math.max(1, Math.floor(maxHp / 16));
        const currMatch = /^(\d+)\/(\d+)$/.exec(resolvedBefore);
        if (currMatch) {
          const curr = parseInt(currMatch[1]!, 10);
          calculatedAfter = `${Math.min(maxHp, curr + healAmt)}/${maxHp}`;
        }
      }
      // 相手（%表記）は実機HUDのサンプリング値（hpAfter）をそのまま信頼（最大HPや端数によって6%または7%）
    } else if (pendingBracket === "sitrus-berry") {
      if (isOwn) {
        // オボンのみ: 最大HPの 1/4（25%）
        const healAmt = Math.floor(maxHp / 4);
        const currMatch = /^(\d+)\/(\d+)$/.exec(resolvedBefore);
        if (currMatch) {
          const curr = parseInt(currMatch[1]!, 10);
          calculatedAfter = `${Math.min(maxHp, curr + healAmt)}/${maxHp}`;
        }
      }
    }

    const resolvedAfter = this.formatHp(target, calculatedAfter)!;
    if (resolvedBefore === resolvedAfter) return;

    // 不変条件: 回復処理で HP が減少または維持されることはあり得ない
    const valBefore = this.parseHpValue(resolvedBefore);
    const valAfter = this.parseHpValue(resolvedAfter);
    if (valAfter <= valBefore) return;

    this.currentHp[target] = resolvedAfter;
    if (mon) {
      if (isOwn) {
        this.lastKnownOwnHp[mon.teamIdx] = resolvedAfter;
      } else {
        this.lastKnownOppHp[mon.slug] = resolvedAfter;
      }
    }
    const ev = this.emit("heal", [target, `${resolvedBefore} -> ${resolvedAfter}`], t, 1, {
      review: false,
      bracket: pendingBracket,
    });

    if (ev && !pendingBracket) {
      this.recentHealWithoutBracket[target] = ev;
    } else {
      this.recentHealWithoutBracket[target] = undefined;
    }
  }

  private setAction(slot: SlotIdent, choice: string): void {
    const turn = this.currentTurn();
    if (!turn || (slot !== "p1a" && slot !== "p1b")) return;
    const idx = slotIndex(slot);
    const existing = turn.actions[idx];
    if (choice.startsWith("switch ")) {
      if (!turn.events.some((e) => e.verb === "move")) {
        turn.actions[idx] = { choice };
      } else if (!existing) {
        turn.actions[idx] = { choice };
      }
    } else if (!existing || !existing.choice.startsWith("switch ")) {
      turn.actions[idx] = { choice };
    }
  }

  // ---------------------------------------------------------------------------
  // 名前解決
  // ---------------------------------------------------------------------------

  /** 正規化済みテキスト中に名前が現れる場内ポケモンのスロット（出現位置順） */
  private resolveSlots(textKey: string, candidates: readonly SlotIdent[] = SLOTS): SlotIdent[] {
    const found: { slot: SlotIdent; end: number }[] = [];
    for (const slot of candidates) {
      const mon = this.slots[slot];
      if (!mon) continue;
      let best: { score: number; end: number } | null = null;
      for (const name of mon.names) {
        const m = approxFind(textKey, name);
        const needed = name.length <= 4 ? 1 : NAME_THRESHOLD;
        if (m.score >= needed && (!best || m.score > best.score)) best = m;
      }
      if (best) found.push({ slot, end: best.end });
    }
    return found.sort((a, b) => a.end - b.end).map((f) => f.slot);
  }

  private speciesAliases(slug: string): string[] {
    const list: string[] = [slug];
    for (const entry of this.options.dictionaries.species) {
      if (entry.slug === slug) {
        list.push(entry.alias);
      }
    }
    const variants = new Set<string>();
    for (const name of list) {
      for (const v of nameVariants(name)) {
        variants.add(v);
      }
    }
    return Array.from(variants);
  }

  private resolveOpponentSlug(text: string): { slug: string; confidence: number } | null {
    const clean = text.replace(/\s+the\s+.*$/i, "").trim();
    const { species } = this.options.dictionaries;
    const roster = new Set(this.options.p2Roster);
    const inRoster = species.filter((entry) => roster.has(entry.slug));
    const fromRoster = inRoster.length > 0 ? fuzzyMatchEntity(clean, inRoster) : null;
    if (fromRoster && fromRoster.confidence >= 70) return fromRoster;
    const any = fuzzyMatchEntity(clean, species);
    return any && any.confidence >= 70 ? any : null;
  }

  private resolveOwnIndex(text: string): number {
    const clean = text.replace(/\s+the\s+.*$/i, "").trim();
    const key = normalizeOcrToken(clean);
    let bestIdx = -1;
    let bestScore = 0;
    this.options.myTeam.forEach((member, idx) => {
      for (const name of this.speciesAliases(member.slug)) {
        const m = approxFind(key, name);
        if (m.score >= NAME_THRESHOLD && m.score > bestScore) {
          bestScore = m.score;
          bestIdx = idx;
        }
      }
    });
    return bestIdx;
  }

  private resolveItem(textKey: string): string | null {
    let best: { slug: string; score: number; length: number } | null = null;
    for (const entry of this.options.dictionaries.items) {
      for (const candidate of [entry.alias, entry.slug]) {
        const name = normalizeOcrToken(candidate);
        if (name.length < 5) continue;
        const { score } = approxFind(textKey, name);
        if (score < 0.85) continue;
        if (!best || score > best.score || (score === best.score && name.length > best.length)) {
          best = { slug: entry.slug, score, length: name.length };
        }
      }
    }
    return best?.slug ?? null;
  }

  // ---------------------------------------------------------------------------
  // 繰り出し・交代
  // ---------------------------------------------------------------------------

  private markLead(t: number): void {
    if (this.leadMs === null) this.leadMs = t;
  }

  /** 手持ちへの戻り（「<トレーナー> withdrew <X>!」 / 「もどれ！ <X>」 等） */
  private onWithdrawn(text: string): boolean {
    const key = normalizeOcrToken(text);
    const matched = this.patternSets.some((p) => p.matchWithdraw(text, key));
    if (!matched) return false;

    const slots = this.resolveSlots(key);
    const slot = slots[0];
    if (slot) {
      this.pendingWithdrawSlot = slot;
      this.slots[slot] = null;
      this.volatileStatus[slot] = {};
      this.statStages[slot] = {};
      this.pendingPerishFaint.delete(slot);
    }
    return true;
  }

  /** 相手の「<トレーナー>は <A> と <B> を繰り出した」 */
  private onSentOut(text: string, t: number): boolean {
    const key = normalizeOcrToken(text);
    let names: string[] | null = null;
    for (const p of this.patternSets) {
      const res = p.matchSentOut(text, key);
      if (res) {
        names = res.names;
        break;
      }
    }
    if (!names || names.length === 0) return false;

    const resolved = names.map((n) => this.resolveOpponentSlug(n));
    if (resolved.every((r) => r === null)) return false;

    // 2 体同時の場合、メッセージの先頭が向かって右 (p2b)、次が左 (p2a)
    let targets: SlotIdent[];
    if (names.length >= 2) {
      targets = ["p2b", "p2a"];
    } else {
      const preferred =
        this.pendingWithdrawSlot && this.pendingWithdrawSlot.startsWith("p2")
          ? this.pendingWithdrawSlot
          : (OPP_SLOTS.find((s) => this.fainted[s] || this.slots[s] === null) ?? "p2a");
      targets = [preferred];
      this.pendingWithdrawSlot = null;
    }

    resolved.forEach((entry, i) => {
      const slot = targets[i];
      if (entry && slot) this.placeOpponent(slot, entry.slug, t, entry.confidence / 100);
    });
    this.markLead(t);
    return true;
  }

  private placeOpponent(slot: SlotIdent, rawSlug: string, t: number, confidence: number): void {
    const slug = rawSlug.replace(/-mega(-[xyz])?$/, "");
    const current = this.slots[slot];
    if (current?.slug === slug && !this.fainted[slot]) return;
    const other = OPP_SLOTS.find((s) => s !== slot);
    if (other && this.slots[other]?.slug === slug && !this.fainted[other]) return;

    let idx = this.options.p2Roster.indexOf(slug);
    if (idx < 0) {
      if (this.options.p2Roster.length >= 6) {
        // すでに6体存在する場合、まだ場に出ていない未選出枠を探して置換
        const activeSlugs = new Set<string>();
        for (const s of Object.values(this.slots)) {
          if (s?.slug) activeSlugs.add(s.slug.replace(/-mega(-[xyz])?$/, ""));
        }
        for (const e of [...this.leadEvents, ...this.turns.flatMap((t) => t.events)]) {
          if (e.verb === "switch" && e.args[0]?.startsWith("p2") && e.args[1]) {
            activeSlugs.add(e.args[1].replace(/-mega(-[xyz])?$/, ""));
          }
        }
        const replaceIdx = this.options.p2Roster.findIndex((s) => !activeSlugs.has(s));
        if (replaceIdx >= 0) {
          this.options.p2Roster[replaceIdx] = slug;
          idx = replaceIdx;
        } else {
          idx = 0;
        }
      } else {
        this.options.p2Roster.push(slug);
        idx = this.options.p2Roster.length - 1;
      }
    }
    this.slots[slot] = { slug, teamIdx: idx, names: this.speciesAliases(slug) };
    this.volatileStatus[slot] = {};
    this.statStages[slot] = {};
    this.pendingPerishFaint.delete(slot);
    this.observedOppSlugs.add(slug);
    this.fainted[slot] = false;
    const hpStr = this.lastKnownOppHp[slug] ?? "100%";
    this.currentHp[slot] = hpStr;
    this.lastKnownOppHp[slug] = hpStr;
    this.emit("switch", [slot, slug, hpStr], t, confidence, {
      review: confidence < 0.85,
    });
  }

  /** 自分の「ゆけっ! <A> と <B>!」 / 「ゆけっ! <A>!」 */
  private onGo(text: string, t: number): boolean {
    const key = normalizeOcrToken(text);
    let names: string[] | null = null;
    for (const p of this.patternSets) {
      const res = p.matchGo(text, key);
      if (res) {
        names = res.names;
        break;
      }
    }
    if (!names || names.length === 0) return false;

    const indices = names.map((n) => this.resolveOwnIndex(n));
    if (indices.every((i) => i < 0)) return false;

    if (names.length >= 2) {
      indices.forEach((idx, i) => {
        const slot = OWN_SLOTS[i];
        if (idx >= 0 && slot) this.placeOwn(slot, idx, t, false);
      });
    } else {
      const idx = indices[0] ?? -1;
      const preferred =
        this.pendingWithdrawSlot && this.pendingWithdrawSlot.startsWith("p1")
          ? this.pendingWithdrawSlot
          : (OWN_SLOTS.find((s) => this.fainted[s] || this.slots[s] === null) ?? "p1a");
      this.pendingWithdrawSlot = null;
      this.placeOwn(preferred, idx, t, false);
    }
    this.markLead(t);
    return true;
  }

  private placeOwn(slot: SlotIdent, teamIdx: number, t: number, guessedSlot: boolean): void {
    const member = this.options.myTeam[teamIdx];
    if (!member) return;
    const current = this.slots[slot];
    if (current?.teamIdx === teamIdx && !this.fainted[slot]) return;

    const wasFainted = this.fainted[slot];
    const seenBefore = this.observedOwnIndices.includes(teamIdx);
    if (!seenBefore) this.observedOwnIndices.push(teamIdx);

    this.slots[slot] = { slug: member.slug, teamIdx, names: this.speciesAliases(member.slug) };
    this.volatileStatus[slot] = {};
    this.statStages[slot] = {};
    this.pendingPerishFaint.delete(slot);
    this.fainted[slot] = false;
    this.faintedOwnTeamIndices.delete(teamIdx);

    const maxHp = this.options.p1MaxHp(teamIdx);
    const initialHp = `${maxHp}/${maxHp}`;
    let hpStr = this.lastKnownOwnHp[teamIdx] ?? initialHp;

    const pctMatch = /^(\d+)%$/.exec(hpStr);
    if (pctMatch) {
      const pct = parseInt(pctMatch[1]!, 10);
      const curr = Math.round((maxHp * pct) / 100);
      hpStr = `${curr}/${maxHp}`;
    }

    this.currentHp[slot] = hpStr;
    this.lastKnownOwnHp[teamIdx] = hpStr;
    this.emit("switch", [slot, member.slug, hpStr], t, 1, {
      review: guessedSlot,
    });
    if (!wasFainted && this.currentTurn()) this.setAction(slot, `switch ${member.slug}`);
  }

  // ---------------------------------------------------------------------------
  // メガシンカ
  // ---------------------------------------------------------------------------

  /** メガシンカ反応メッセージ・前兆演出 */
  private onMegaReaction(text: string, key: string, _t: number): boolean {
    let left: string | null = null;
    for (const p of this.patternSets) {
      const res = p.matchMegaReaction(text, key);
      if (res) {
        left = normalizeOcrToken(res.leftPart);
        break;
      }
    }
    if (!left) return false;
    const item = this.resolveItem(left);
    const slot = this.resolveSlots(left)[0];
    if (item && slot) {
      this.megaStone[slot] = item;
    }
    return true;
  }

  /** 「<X> は メガシンカした!」 */
  private onMegaEvolved(text: string, key: string, t: number): boolean {
    let match: { headKey: string } | null = null;
    for (const p of this.patternSets) {
      const res = p.matchMegaEvolved(text, key);
      if (res) {
        match = res;
        break;
      }
    }
    if (!match) return false;

    const slot = this.resolveSlots(match.headKey)[0];
    const mon = slot ? this.slots[slot] : null;
    if (!slot || !mon) return false;

    const baseSlug = mon.slug.replace(/-mega.*$/, "");
    let megaSlug = `${baseSlug}-mega`;

    const stone =
      this.megaStone[slot] ??
      (slot === "p1a" || slot === "p1b" ? this.options.p1ItemSlug(mon.teamIdx) : null);
    if (stone?.endsWith("-y")) {
      megaSlug = `${baseSlug}-mega-y`;
    } else if (stone?.endsWith("-x")) {
      megaSlug = `${baseSlug}-mega-x`;
    } else if (stone?.endsWith("-z")) {
      megaSlug = `${baseSlug}-mega-z`;
    }

    const ev = this.emit("mega", [slot, megaSlug], t, 0.98, { review: false, unique: true });
    if (this.slots[slot]) {
      this.slots[slot] = {
        ...this.slots[slot]!,
        slug: megaSlug,
        names: this.speciesAliases(megaSlug),
      };
    }
    const turn = this.currentTurn();
    if (ev && turn && (slot === "p1a" || slot === "p1b")) turn.mega[slot] = true;
    return true;
  }

  // ---------------------------------------------------------------------------
  // 技・防御・ひんし
  // ---------------------------------------------------------------------------

  /** 「<X> は <技> を使った!」 */
  private onMoveUsed(text: string, t: number): boolean {
    const key = normalizeOcrToken(text);
    let match: { actorPart: string; movePart: string; isOpposing?: boolean } | null = null;
    for (const p of this.patternSets) {
      const res = p.matchMoveUsed(text, key);
      if (res) {
        match = res;
        break;
      }
    }
    if (!match) return false;

    const cleanMovePart = match.movePart.replace(/[!！|].*$/, "").trim() || match.movePart;
    const move = fuzzyMatchEntity(cleanMovePart, this.options.dictionaries.moves);
    if (!move) return false;

    const head = normalizeOcrToken(match.actorPart);
    const isOpposing = match.isOpposing ?? approxFind(head, "opposing").score >= 0.8;
    const candidates = isOpposing ? OPP_SLOTS : OWN_SLOTS;
    const matched = this.resolveSlots(head, candidates);
    const fallback = candidates.find((s) => this.slots[s] !== null);
    const slot = matched[0] ?? fallback;
    if (!slot) return false;

    this.pendingCrit = false;
    const ev = this.emit("move", [slot, move.slug], t, move.confidence / 100, {
      review: matched.length === 0 || move.confidence < 80,
      unique: true,
    });
    if (ev) this.setAction(slot, move.slug);
    return true;
  }

  /** 「<X> flinched and couldn't move!」等の行動不能メッセージ */
  private onCantMove(key: string, t: number): boolean {
    let matchedPhrase = "";
    let matchedReason = "";
    let bestScore = 0;
    let matchEnd = 0;

    for (const p of this.patternSets) {
      for (const def of p.cantPhrases) {
        const found = approxFind(key, def.phrase);
        if (found.score >= PHRASE_THRESHOLD && found.score > bestScore) {
          bestScore = found.score;
          matchedPhrase = def.phrase;
          matchedReason = def.reason;
          matchEnd = found.end;
        }
      }
    }
    if (!matchedReason) return false;

    const headKey = key.slice(0, Math.max(0, matchEnd - matchedPhrase.length));
    const slot = this.resolveSlots(headKey)[0] ?? this.resolveSlots(key)[0];
    if (!slot) return false;

    this.emit("cant", [slot, matchedReason], t, bestScore, {
      review: false,
      unique: true,
    });
    return true;
  }

  /** 「A critical hit!」 */
  private onCriticalHit(key: string, _t: number): boolean {
    let matched = false;
    for (const p of this.patternSets) {
      if (p.critPhrases.some((phrase) => approxFind(key, phrase).score >= PHRASE_THRESHOLD)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;

    const events = this.currentEvents();
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]!;
      if (ev.verb === "move") break;
      if (ev.verb === "damage") {
        const isResidual =
          ev.bracket === "sandstorm" ||
          ev.bracket === "life-orb" ||
          ev.bracket === "burn" ||
          ev.bracket === "poison" ||
          ev.bracket === "recoil";
        if (!isResidual) {
          ev.bracket = ev.bracket
            ? ev.bracket.includes("crit")
              ? ev.bracket
              : `${ev.bracket}, crit`
            : "crit";
          this.pendingCrit = false;
          return true;
        }
      }
    }
    this.pendingCrit = true;
    return true;
  }

  /** 「It's super effective on <X>!」 / 「It's not very effective on <X>!」 */
  private onEffectiveness(key: string, t: number): boolean {
    let matched = false;
    for (const p of this.patternSets) {
      for (const def of p.effectivenessPhrases) {
        const found = approxFind(key, def.phrase);
        if (found.score >= PHRASE_THRESHOLD) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) return false;
    // OCR が 2 行（例: "It's super effective!\nA critical hit!"）を同時取得していた場合は急所も反映
    this.onCriticalHit(key, t);
    return true;
  }

  /** 「<X> returned its stats to normal using its White Herb!」等のアイテム発動メッセージ */
  private onItemMessage(key: string, t: number): boolean {
    const found = approxFind(key, "returneditsstatstonormal");
    if (found.score < PHRASE_THRESHOLD) return false;

    const headKey = key.slice(0, Math.max(0, found.end - "returneditsstatstonormal".length));
    const slot = this.resolveSlots(headKey)[0] ?? this.resolveSlots(key)[0];
    if (!slot || !this.slots[slot]) return false;

    const itemSlug = this.resolveItem(key) ?? "white-herb";
    this.emit("item", [slot, itemSlug], t, found.score, {
      review: false,
      unique: true,
    });
    return true;
  }

  /** 「<X> is buffeted by the sandstorm!」 / 「<X> lost some of its HP!」等の定数・反動ダメージ */
  private onResidualDamage(_text: string, key: string, t: number): boolean {
    let matchedPhrase = "";
    let matchedEffect = "";
    let bestScore = 0;
    let matchEnd = 0;

    for (const p of this.patternSets) {
      for (const def of p.residualDamagePhrases) {
        const found = approxFind(key, def.phrase);
        if (found.score >= PHRASE_THRESHOLD && found.score > bestScore) {
          bestScore = found.score;
          matchedPhrase = def.phrase;
          matchedEffect = def.effect;
          matchEnd = found.end;
        }
      }
    }
    if (!matchedEffect) return false;

    const headKey = key.slice(0, Math.max(0, matchEnd - matchedPhrase.length));
    const slot = this.resolveSlots(headKey)[0] ?? this.resolveSlots(key)[0];
    if (!slot || !this.slots[slot]) return false;

    const mon = this.slots[slot]!;
    const isOwn = slot.startsWith("p1");
    const maxHp = isOwn ? this.options.p1MaxHp(mon.teamIdx) : 100;

    const calcResidualAfter = (bHp: string): string => {
      if (isOwn) {
        const m = /^(\d+)\/(\d+)$/.exec(bHp);
        if (m) {
          const curr = parseInt(m[1]!, 10);
          const dmg =
            matchedEffect === "life-orb"
              ? Math.max(1, Math.floor(maxHp / 10))
              : Math.max(1, Math.floor(maxHp / 16));
          return `${Math.max(0, curr - dmg)}/${maxHp}`;
        }
      } else {
        const m = /^(\d+)%$/.exec(bHp);
        if (m) {
          const currPct = parseInt(m[1]!, 10);
          const dmgPct = matchedEffect === "life-orb" ? 10 : 6;
          return `${Math.max(0, currPct - dmgPct)}%`;
        }
      }
      return bHp;
    };

    // 同一ターン内に既に同じ定数ダメージ（sandstorm, burn, poison）または直近4秒以内の life-orb が記録済みなら重複出力しない
    const events = this.currentEvents();
    const alreadyRecorded = events.some(
      (ev) =>
        ev.verb === "damage" &&
        ev.args[0] === slot &&
        ev.bracket === matchedEffect &&
        (matchedEffect !== "life-orb" || Math.abs(t - ev.t) <= 4000),
    );
    if (alreadyRecorded) {
      return true;
    }

    // 直前に確定した未ブラケットの damage イベントがあればそれに bracket を付与し、定数ダメージ量で補正
    const maxResidualDrop = matchedEffect === "life-orb" ? 0.14 : 0.1;
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]!;
      if (ev.verb === "move") break;
      if (
        ev.verb === "damage" &&
        ev.args[0] === slot &&
        !ev.bracket &&
        Math.abs(t - ev.t) <= 1000
      ) {
        const beforeToken = ev.args[1]?.split("->")[0]?.trim();
        const rawAfterToken = ev.args[1]?.split("->")[1]?.trim();
        const drop =
          beforeToken && rawAfterToken
            ? this.parseHpValue(beforeToken) - this.parseHpValue(rawAfterToken)
            : 1;
        if (drop > maxResidualDrop) {
          break;
        }
        ev.bracket = matchedEffect;
        const afterToken = beforeToken ? calcResidualAfter(beforeToken) : rawAfterToken;
        if (beforeToken && afterToken) {
          ev.args[1] = `${beforeToken} -> ${afterToken}`;
          this.currentHp[slot] = afterToken;
          if (isOwn) {
            this.lastKnownOwnHp[mon.teamIdx] = afterToken;
          } else {
            this.lastKnownOppHp[mon.slug] = afterToken;
          }
          this.recentBracketedDamage[slot] = { hpAfter: afterToken, t };
        }
        return true;
      }
    }

    // まだ HUD 側の HP 減少が確定していない場合は、ドメイン知識（1/16 または 1/10）から減少後の HP を算出して即時記録
    const beforeHp = this.currentHp[slot] ?? (isOwn ? `${maxHp}/${maxHp}` : "100%");
    const afterHp = calcResidualAfter(beforeHp);

    if (afterHp !== beforeHp) {
      this.currentHp[slot] = afterHp;
      if (isOwn) {
        this.lastKnownOwnHp[mon.teamIdx] = afterHp;
      } else {
        this.lastKnownOppHp[mon.slug] = afterHp;
      }
      this.recentBracketedDamage[slot] = { hpAfter: afterHp, t };
      this.emit("damage", [slot, `${beforeHp} -> ${afterHp}`], t, bestScore, {
        review: false,
        bracket: matchedEffect,
      });
    }
    return true;
  }

  /** 「<X> は <Y> を手助けしようとしている!」: 直前のてだすけ宣言に対象を補う */
  private onReadyToHelp(key: string, t: number): boolean {
    let match: { actorKey: string; targetKey: string } | null = null;
    for (const p of this.patternSets) {
      const res = p.matchReadyToHelp("", key);
      if (res) {
        match = res;
        break;
      }
    }
    if (!match) return false;

    const actor = this.resolveSlots(match.actorKey)[0];
    const target = this.resolveSlots(match.targetKey)[0];
    if (!actor || !target) return false;

    const existing = this.currentEvents().find(
      (ev) =>
        ev.verb === "move" && ev.args[0] === actor && /helping-hand|help/.test(ev.args[1] ?? ""),
    );
    if (existing) {
      if (existing.args.length === 2) existing.args.push("->", target);
    } else {
      const move = fuzzyMatchEntity("Helping Hand", this.options.dictionaries.moves);
      this.emit("move", [actor, move?.slug ?? "helping-hand", "->", target], t, 0.9, {
        review: true,
      });
    }
    return true;
  }

  /** 「まもりきった」「ワイドガードがまもった」相当の防御メッセージ */
  private onProtected(key: string, t: number): boolean {
    let isWideGuard = false;
    let isProtectedItself = false;
    let isProtected = false;

    for (const p of this.patternSets) {
      if (p.protectPhrases.wideGuard.some((phrase) => approxFind(key, phrase).score >= 0.8)) {
        isWideGuard = true;
      }
      if (
        p.protectPhrases.protectItself.some(
          (phrase) => approxFind(key, phrase).score >= PHRASE_THRESHOLD - 0.05,
        )
      ) {
        isProtectedItself = true;
      }
      if (p.protectPhrases.protectGeneral.some((phrase) => approxFind(key, phrase).score >= 0.8)) {
        isProtected = true;
      }
    }

    if (isProtectedItself) isProtected = true;
    if (!isProtected && !isWideGuard) return false;

    const slot = this.resolveSlots(key)[0];

    const events = this.currentEvents();
    // 守られた直近の攻撃技を探す（味方の地震等も含め、自分以外の技が防がれる）
    const incomingMove = [...events].reverse().find((ev) => {
      if (ev.verb !== "move") return false;
      const moveActor = ev.args[0];
      const moveId = ev.args[1] ?? "";

      // まもる系技は除外
      if (PROTECT_MOVE.test(moveId)) return false;

      // 守ったスロット自身の技は除外
      if (slot && moveActor === slot) return false;

      // ターゲットが既に指定されていて、かつそれが今回の slot と異なる単体技なら防がれた対象ではない
      const arrowIdx = ev.args.indexOf("->");
      if (arrowIdx >= 0 && arrowIdx + 1 < ev.args.length) {
        const targetSlot = ev.args[arrowIdx + 1]!;
        if (slot && targetSlot !== slot) {
          return false;
        }
      }

      return true;
    });

    if (incomingMove) {
      if (isWideGuard) {
        incomingMove.comment = "wide-guard";
        return true;
      }
      const moveId = incomingMove.args[1] ?? "";
      const isSpread = isMultiTargetMove(moveId);

      if (slot) {
        if (!incomingMove.protectedSlots) {
          incomingMove.protectedSlots = [];
        }
        if (!incomingMove.protectedSlots.includes(slot)) {
          incomingMove.protectedSlots.push(slot);
        }
      }

      // 単体技の場合のみ、ターゲットがまだ付いていなければ -> slot を付与
      if (!isSpread && slot && !incomingMove.args.includes("->")) {
        incomingMove.args.push("->", slot);
      }
      return true;
    }

    if (slot) {
      const protectMove = [...events]
        .reverse()
        .find(
          (ev) => ev.verb === "move" && ev.args[0] === slot && PROTECT_MOVE.test(ev.args[1] ?? ""),
        );
      if (protectMove) {
        return true;
      }
      const moveName = isWideGuard ? "wide-guard" : "protect";
      this.emit("move", [slot, moveName], t, 0.85, { review: true });
      this.setAction(slot, moveName);
      return true;
    }

    return true;
  }

  private onFainted(key: string, t: number): boolean {
    let foundPhrase: { phrase: string; end: number; score: number } | null = null;
    for (const p of this.patternSets) {
      for (const phrase of p.faintedPhrases) {
        const found = approxFind(key, phrase);
        if (found.score >= 0.85 && (!foundPhrase || found.score > foundPhrase.score)) {
          foundPhrase = { phrase, end: found.end, score: found.score };
        }
      }
    }
    if (!foundPhrase) return false;

    const slots = this.resolveSlots(
      key.slice(0, Math.max(0, foundPhrase.end - foundPhrase.phrase.length)),
    );
    if (slots.length === 0) return false;
    for (const slot of slots) {
      if (this.fainted[slot]) continue;
      this.fainted[slot] = true;
      const mon = this.slots[slot];
      if (mon) {
        if (slot.startsWith("p1")) {
          this.faintedOwnTeamIndices.add(mon.teamIdx);
        } else {
          this.faintedOppSlugs.add(mon.slug);
        }
      }
      this.volatileStatus[slot] = {};
      this.statStages[slot] = {};

      const zeroHp = this.formatHp(slot, "0%") ?? "0%";
      const prevHp = this.currentHp[slot];
      this.currentHp[slot] = zeroHp;
      if (mon) {
        if (slot.startsWith("p1")) {
          this.lastKnownOwnHp[mon.teamIdx] = zeroHp;
        } else {
          this.lastKnownOppHp[mon.slug] = zeroHp;
        }
      }

      if (this.pendingPerishFaint.has(slot)) {
        this.pendingPerishFaint.delete(slot);
        this.emit("faint", [slot], t, 0.98, { review: false });
        continue;
      }

      const isZero = (s: string | null) => s === "0%" || (s !== null && s.startsWith("0/"));
      if (prevHp && !isZero(prevHp)) {
        this.feedDamage(slot, prevHp, "0%", prevHp, t);
      }
      this.emit("faint", [slot], t, 0.98, { review: false });
    }
    return true;
  }

  /** 「<X>'s perish count fell to <N>!」 */
  private onPerishCount(rawText: string, t: number): boolean {
    let res: { mon: string; count: number; isOpposing: boolean } | null = null;
    for (const p of this.patternSets) {
      res = p.matchPerishCount(rawText);
      if (res) break;
    }
    if (!res) return false;

    const head = normalizeOcrToken(res.mon);
    const candidates = res.isOpposing ? OPP_SLOTS : OWN_SLOTS;
    const matched = this.resolveSlots(head, candidates);
    const fallback = candidates.find((s) => this.slots[s] !== null);
    const slot = matched[0] ?? fallback;
    if (!slot) return false;

    const prevCount =
      typeof this.volatileStatus[slot]?.perish === "number"
        ? (this.volatileStatus[slot]!.perish as number)
        : res.count + 1;

    this.volatileStatus[slot] = { ...this.volatileStatus[slot], perish: res.count };

    if (res.count === 0) {
      this.pendingPerishFaint.add(slot);
      delete this.volatileStatus[slot].perish;
    }

    this.emit("perish", [slot, `${prevCount} -> ${res.count}`], t, 0.98, { review: false });
    return true;
  }

  /** 「All Pokémon that hear the song will faint in three turns!」 */
  private onPerishStart(text: string, key: string, _t: number): boolean {
    let matched = false;
    for (const p of this.patternSets) {
      if (p.matchPerishStart(text, key)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;

    for (const slot of SLOTS) {
      if (this.slots[slot] !== null && !this.fainted[slot]) {
        this.volatileStatus[slot] = { ...this.volatileStatus[slot], perish: 3 };
      }
    }
    return true;
  }

  /** 「The battle has ended due to a forfeit」 */
  private onForfeit(text: string, key: string, t: number): boolean {
    let matched = false;
    for (const p of this.patternSets) {
      if (p.matchForfeit(text, key)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;

    const events = this.currentEvents();
    const alreadyEmitted = events.some((ev) => ev.verb === "#" && ev.args.includes("forfeit"));
    if (!alreadyEmitted) {
      this.currentEvents().push({
        verb: "#",
        args: ["The", "battle", "has", "ended", "due", "to", "a", "forfeit"],
        t,
        confidence: 1,
        review: false,
      });
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // 場の変化・能力変化
  // ---------------------------------------------------------------------------

  private onFieldChange(key: string, t: number): boolean {
    let hit: { phrase: string; effect: FieldEffect } | null = null;
    let bestScore = 0;

    for (const p of this.patternSets) {
      for (const def of p.fieldPhrases) {
        const found = approxFind(key, def.phrase);
        if (found.score >= PHRASE_THRESHOLD && found.score > bestScore) {
          bestScore = found.score;
          hit = def;
        }
      }
    }
    if (!hit) return false;

    const { effect } = hit;
    const currentTurnNum =
      this.turns.length > 0 ? this.turns[this.turns.length - 1]!.turnNumber : 1;

    if (effect.kind === "weather") {
      if (effect.value === "None") {
        if (this.weather !== "None") {
          this.weather = "None";
          this.weatherState = null;
          this.emit("weather", ["None"], t, 0.98, { review: false });
        }
      } else if (effect.value !== this.weather) {
        this.weather = effect.value;
        const maxTurns = this.detectWeatherExtender(effect.value) ? 8 : 5;
        this.weatherState = { kind: effect.value, startTurn: currentTurnNum, maxTurns };
        this.emit("weather", [effect.value], t, 0.98, { review: false });
      }
    } else if (effect.kind === "terrain") {
      if (effect.value === "None") {
        if (this.terrain !== "None") {
          this.terrain = "None";
          this.terrainState = null;
          this.emit("terrain", ["None"], t, 0.98, { review: false });
        }
      } else if (effect.value !== this.terrain) {
        this.terrain = effect.value;
        const maxTurns = this.detectTerrainExtender() ? 8 : 5;
        this.terrainState = { kind: effect.value, startTurn: currentTurnNum, maxTurns };
        this.emit("terrain", [effect.value], t, 0.98, { review: false });
      }
    } else if (effect.kind === "trick-room") {
      if (!effect.on) {
        if (this.trickRoom) {
          this.trickRoom = false;
          this.trickRoomState = null;
          this.emit("field", ["trick-room", "off"], t, 0.98, { review: false });
        }
      } else if (!this.trickRoom) {
        this.trickRoom = true;
        this.trickRoomState = { startTurn: currentTurnNum, maxTurns: 5 };
        this.emit("field", ["trick-room", "on"], t, 0.98, { review: false });
      }
    }
    return true;
  }

  /** 回復メッセージ */
  private onHeal(_text: string, key: string, t: number): boolean {
    let matchedPhrase = "";
    let matchedEffect: string | undefined = undefined;
    let bestScore = 0;
    let matchEnd = 0;

    for (const p of this.patternSets) {
      for (const def of p.healPhrases) {
        const found = approxFind(key, def.phrase);
        if (found.score > bestScore) {
          bestScore = found.score;
          matchedPhrase = def.phrase;
          matchedEffect = def.effect;
          matchEnd = found.end;
        }
      }
    }

    if (bestScore < PHRASE_THRESHOLD - 0.05) return false;

    // スロットの特定
    const slots = this.resolveSlots(key.slice(0, Math.max(0, matchEnd - matchedPhrase.length)));
    const slot = slots[0] ?? this.resolveSlots(key)[0];
    if (!slot || !this.slots[slot]) return false;

    // 原因（effect）の判定: 定型文テンプレート (healPhrases.effect) または メッセージ内のアイテム名から特定
    const effect = matchedEffect ?? this.resolveItem(key) ?? undefined;
    const effectBracket = effect || undefined;
    const mon = this.slots[slot]!;
    const isOwn = slot.startsWith("p1");
    const maxHp = isOwn ? this.options.p1MaxHp(mon.teamIdx) : 100;

    // 1. 直前に先行して発生した HP 回復（bracket 未確定）があれば、それに bracket を付与
    const recent = this.recentHealWithoutBracket[slot];
    if (recent && !recent.bracket) {
      recent.bracket = effectBracket;
      if (
        effectBracket === "grassy-terrain" ||
        effectBracket === "leftovers" ||
        effectBracket === "black-sludge"
      ) {
        if (isOwn) {
          const mFrac = /^(\d+)\/(\d+)\s*->\s*(\d+)\/(\d+)$/.exec(recent.args[1] ?? "");
          if (mFrac) {
            const bCurr = parseInt(mFrac[1]!, 10);
            const healAmt = Math.max(1, Math.floor(maxHp / 16));
            const calibrated = `${Math.min(maxHp, bCurr + healAmt)}/${maxHp}`;
            recent.args[1] = `${bCurr}/${maxHp} -> ${calibrated}`;
            this.currentHp[slot] = calibrated;
            this.lastKnownOwnHp[mon.teamIdx] = calibrated;
          }
        }
      }
      if (effectBracket === "grassy-terrain") {
        this.healedFromTerrainThisTurn[slot] = true;
      }
      this.recentHealWithoutBracket[slot] = undefined;
      return true;
    }

    // すでに直近（3秒以内）に同一 bracket の heal イベントが出力済み（Leftovers バナー先行時など）なら重複出力しない
    if (effectBracket) {
      const alreadyEmitted = this.currentEvents().some(
        (ev) =>
          ev.verb === "heal" &&
          ev.args[0] === slot &&
          ev.bracket === effectBracket &&
          Math.abs(t - ev.t) <= 3000,
      );
      if (alreadyEmitted) {
        return true;
      }
    }

    // 2. HUD の回復完了よりもメッセージが先に到達した場合、自軍のみ正確な実数値（1/16 または 1/4）で即時 emit。
    // ※ 相手（%表記）は最大HPや端数によって6%または7%と変動するため勝手に決め打ちせず、HUDのHPバー実測値（SoT）を待つ。
    if (
      isOwn &&
      (effectBracket === "grassy-terrain" ||
        effectBracket === "leftovers" ||
        effectBracket === "black-sludge" ||
        effectBracket === "sitrus-berry")
    ) {
      const beforeHp = this.currentHp[slot] ?? `${maxHp}/${maxHp}`;
      const m = /^(\d+)\/(\d+)$/.exec(beforeHp);
      if (m) {
        const curr = parseInt(m[1]!, 10);
        const healAmt =
          effectBracket === "sitrus-berry"
            ? Math.max(1, Math.floor(maxHp / 4))
            : Math.max(1, Math.floor(maxHp / 16));
        const afterHp = `${Math.min(maxHp, curr + healAmt)}/${maxHp}`;
        if (afterHp !== beforeHp) {
          this.feedHeal(slot, beforeHp, afterHp, `${healAmt}`, t, { effect: effectBracket });
          return true;
        }
      }
    }

    if (effectBracket) {
      this.pendingHealBracket[slot] = effectBracket;
    }
    return true;
  }

  /** 「<X> の <能力> が 上がった / 下がった!」 */
  private onStatChange(key: string, t: number): boolean {
    if (approxFind(key, "wontgoany").score >= 0.8) return true;

    let bestSuffix: { suffix: string; delta: number; end: number; score: number } | null = null;
    for (const p of this.patternSets) {
      for (const { suffix, delta } of p.statChanges) {
        const { score, end } = approxFind(reverse(key), reverse(suffix), true);
        if (score >= 0.75 && (!bestSuffix || score > bestSuffix.score)) {
          bestSuffix = { suffix, delta, end, score };
        }
      }
    }
    if (!bestSuffix) return false;

    const statsFound: string[] = [];
    for (const p of this.patternSets) {
      for (const { words, stat } of p.statWords) {
        for (const w of words) {
          if (approxFind(key, w).score >= 0.82) {
            if (!statsFound.includes(stat)) statsFound.push(stat);
            break;
          }
        }
      }
    }
    if (statsFound.length === 0) return false;

    const head = key.slice(0, Math.max(0, key.length - bestSuffix.end));
    const slots = this.resolveSlots(head);
    if (slots.length === 0) return false;

    const deltaStr = bestSuffix.delta > 0 ? `+${bestSuffix.delta}` : `${bestSuffix.delta}`;
    for (const slot of slots) {
      for (const stat of statsFound) {
        this.statStages[slot] = {
          ...this.statStages[slot],
          [stat]: Math.max(-6, Math.min(6, (this.statStages[slot][stat] ?? 0) + bestSuffix.delta)),
        };
        this.emit("boost", [slot, stat, deltaStr], t, bestSuffix.score, { review: false });
      }
    }
    return true;
  }
}

function renderAbilityBlocks(
  abilityEvents: readonly LogEvent[],
  boostEvents: readonly LogEvent[],
  baseIndent: string,
): { linesBySlot: Map<string, string[]>; unhandledBoosts: LogEvent[] } {
  const unhandledBoosts: LogEvent[] = [];
  const linesBySlot = new Map<string, string[]>();

  if (abilityEvents.length === 0) {
    return { linesBySlot, unhandledBoosts: [...boostEvents] };
  }

  const abilityTargetMaps = abilityEvents.map(() => ({
    targetMap: new Map<string, string[]>(),
    targetOrder: [] as string[],
  }));

  let currentAbilityIdx = 0;
  for (const boost of boostEvents) {
    const target = boost.args[0]!;
    const effect = `${boost.args[1]} ${boost.args[2]}`;

    while (
      currentAbilityIdx < abilityEvents.length - 1 &&
      abilityTargetMaps[currentAbilityIdx]!.targetMap.get(target)?.includes(effect)
    ) {
      currentAbilityIdx++;
    }

    const current = abilityTargetMaps[currentAbilityIdx];
    if (!current) {
      unhandledBoosts.push(boost);
      continue;
    }
    if (!current.targetMap.has(target)) {
      current.targetMap.set(target, []);
      current.targetOrder.push(target);
    }
    if (!current.targetMap.get(target)!.includes(effect)) {
      current.targetMap.get(target)!.push(effect);
    }
  }

  for (let a = 0; a < abilityEvents.length; a++) {
    const abEv = abilityEvents[a]!;
    const slot = abEv.args[0]!;
    const { targetMap, targetOrder } = abilityTargetMaps[a]!;
    const blockLines: string[] = [];

    if (targetOrder.length > 0) {
      blockLines.push(`${baseIndent}${formatEvent(abEv)} {`);
      const sortedTargets = [...targetOrder].sort();
      for (const target of sortedTargets) {
        blockLines.push(`${baseIndent}  ${target}: ${targetMap.get(target)!.join(", ")}`);
      }
      blockLines.push(`${baseIndent}}`);
    } else {
      blockLines.push(`${baseIndent}${formatEvent(abEv)}`);
    }

    if (!linesBySlot.has(slot)) {
      linesBySlot.set(slot, []);
    }
    linesBySlot.get(slot)!.push(...blockLines);
  }

  return { linesBySlot, unhandledBoosts };
}

const formatEvent = (ev: LogEvent): string => {
  if (ev.verb === "#") return `# ${ev.args.join(" ")}`;
  const bracketStr = ev.bracket ? ` [${ev.bracket}]` : "";
  const reviewTag = ev.review ? " @review" : "";
  const comment = ev.comment ? ` {${ev.comment}}` : "";
  return `${ev.verb} ${ev.args.join(" ")}${bracketStr}${reviewTag}${comment}`.trimEnd();
};
