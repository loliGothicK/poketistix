import { approxFind, normalizeOcrToken } from "./ocrText";

export type FieldEffect =
  | { readonly kind: "weather"; readonly value: string }
  | { readonly kind: "terrain"; readonly value: string }
  | { readonly kind: "trick-room"; readonly on: boolean }
  | { readonly kind: "field"; readonly condition: string; readonly on: boolean };

export type StatType = "atk" | "def" | "spa" | "spd" | "spe" | "accuracy" | "evasion";

export interface FieldPhraseDef {
  readonly phrase: string;
  readonly effect: FieldEffect;
}

export interface SideConditionPhraseDef {
  readonly phrase: string;
  readonly side: "p1" | "p2";
  readonly condition: string;
  readonly on: boolean;
}

export interface MoveOutcomePhraseDef {
  readonly phrase: string;
  readonly outcome: "missed" | "failed" | "immune";
  readonly targetSpecific?: boolean;
}

export interface ItemEffectPhraseDef {
  readonly phrase: string;
  readonly mustInclude?: string;
  readonly item?: string;
  readonly consumed?: boolean;
  readonly targetPosition?: "first" | "last";
  readonly action?:
    | "reset-stats"
    | "endure"
    | "switch-self"
    | "switch-target"
    | "pop-balloon"
    | "float-balloon";
}

export interface StatWordDef {
  readonly words: readonly string[];
  readonly stat: StatType;
}

export interface StatChangeDef {
  readonly suffix: string;
  readonly delta: number;
}

export interface HealPhraseDef {
  readonly phrase: string;
  readonly effect?: string;
  readonly alsoStatus?: string;
}

export interface CantPhraseDef {
  readonly phrase: string;
  readonly mustInclude?: string;
  readonly reason: string;
}

export interface EffectivenessPhraseDef {
  readonly phrase: string;
  readonly eff: 1 | -1 | 0;
}

export interface ResidualDamagePhraseDef {
  readonly phrase: string;
  readonly mustInclude?: string;
  readonly effect: string;
}

export interface StatusPhraseDef {
  readonly phrase: string;
  readonly mustInclude?: string;
  readonly status: string;
  readonly isVolatile?: boolean;
  readonly targetPosition?: "first" | "last";
}

export interface CurePhraseDef {
  readonly phrase: string;
  readonly status: string;
  readonly isVolatile?: boolean;
}

export interface StatResetPhraseDef {
  readonly phrase: string;
  readonly scope: "single" | "all" | "invert";
  readonly isItem?: boolean;
}

/** 全9言語（ja, en, es, fr, de, it, ko, zh-Hant, zh-Hans）のメッセージテンプレート定義 */
export interface BattleMessageTemplates {
  readonly lang: string;
  readonly withdraw?: readonly string[];
  readonly sentOutTwo?: readonly string[];
  readonly sentOutOne?: readonly string[];
  readonly goTwo?: readonly string[];
  readonly goOne?: readonly string[];
  readonly moveUsed?: readonly string[];
  readonly readyToHelp?: readonly string[];
  readonly readyToHelpPhrase?: string;
  readonly megaReactionPhrase?: string;
  readonly megaEvolvedPhrase?: string;
  readonly megaEvolved?: readonly string[];
  readonly fainted?: readonly string[];
  readonly wideGuard?: readonly string[];
  readonly quickGuard?: readonly string[];
  readonly protectItself?: readonly string[];
  readonly protectGeneral?: readonly string[];
  readonly statWords: readonly StatWordDef[];
  readonly statChanges: readonly StatChangeDef[];
  readonly fieldPhrases: readonly FieldPhraseDef[];
  readonly sidePhrases?: readonly SideConditionPhraseDef[];
  readonly moveOutcomePhrases?: readonly MoveOutcomePhraseDef[];
  readonly itemEffectPhrases?: readonly ItemEffectPhraseDef[];
  readonly healPhrases: readonly HealPhraseDef[];
  readonly cantPhrases?: readonly CantPhraseDef[];
  readonly critPhrases?: readonly string[];
  readonly effectivenessPhrases?: readonly EffectivenessPhraseDef[];
  readonly residualDamagePhrases?: readonly ResidualDamagePhraseDef[];
  readonly statusPhrases?: readonly StatusPhraseDef[];
  readonly curePhrases?: readonly CurePhraseDef[];
  readonly perishCountRegex?: RegExp;
  readonly perishStartPhrases?: readonly string[];
  readonly forfeitPhrases?: readonly string[];
  readonly statCapPhrases?: readonly string[];
  readonly statResetPhrases?: readonly string[];
  readonly statResetDefs?: readonly StatResetPhraseDef[];
  readonly allySwitchPhrases?: readonly string[];
  readonly courtChangePhrases?: readonly string[];
  readonly tidyUpPhrases?: readonly string[];
  readonly bellyDrumPhrases?: readonly string[];
  readonly angerPointPhrases?: readonly string[];
  readonly opposingPrefixes?: readonly string[];
}

export interface BattleLogPatternSet {
  readonly lang: string;
  readonly fieldPhrases: readonly FieldPhraseDef[];
  readonly sidePhrases: readonly SideConditionPhraseDef[];
  readonly moveOutcomePhrases: readonly MoveOutcomePhraseDef[];
  readonly itemEffectPhrases: readonly ItemEffectPhraseDef[];
  readonly statWords: readonly StatWordDef[];
  readonly statChanges: readonly StatChangeDef[];
  readonly healPhrases: readonly HealPhraseDef[];
  readonly cantPhrases: readonly CantPhraseDef[];
  readonly critPhrases: readonly string[];
  readonly effectivenessPhrases: readonly EffectivenessPhraseDef[];
  readonly residualDamagePhrases: readonly ResidualDamagePhraseDef[];
  readonly statusPhrases: readonly StatusPhraseDef[];
  readonly curePhrases: readonly CurePhraseDef[];
  readonly statCapPhrases: readonly string[];
  readonly statResetPhrases: readonly string[];
  readonly statResetDefs: readonly StatResetPhraseDef[];
  readonly allySwitchPhrases: readonly string[];
  readonly courtChangePhrases: readonly string[];
  readonly tidyUpPhrases: readonly string[];
  readonly bellyDrumPhrases: readonly string[];
  readonly angerPointPhrases: readonly string[];
  readonly opposingPrefixes: readonly string[];
  readonly faintedPhrases: readonly string[];
  readonly protectPhrases: {
    readonly wideGuard: readonly string[];
    readonly quickGuard: readonly string[];
    readonly protectItself: readonly string[];
    readonly protectGeneral: readonly string[];
  };
  readonly matchWithdraw: (rawText: string, textKey: string) => boolean;
  readonly matchSentOut: (rawText: string, textKey: string) => { names: string[] } | null;
  readonly matchGo: (rawText: string, textKey: string) => { names: string[] } | null;
  readonly matchMoveUsed: (
    rawText: string,
    textKey: string,
  ) => { actorPart: string; movePart: string; isOpposing?: boolean } | null;
  readonly matchReadyToHelp: (
    rawText: string,
    textKey: string,
  ) => { actorKey: string; targetKey: string } | null;
  readonly matchMegaReaction: (rawText: string, textKey: string) => { leftPart: string } | null;
  readonly matchMegaEvolved: (rawText: string, textKey: string) => { headKey: string } | null;
  readonly matchPerishCount: (
    rawText: string,
  ) => { mon: string; count: number; isOpposing: boolean } | null;
  readonly matchPerishStart: (rawText: string, textKey: string) => boolean;
  readonly matchForfeit: (rawText: string, textKey: string) => boolean;
}

/** テンプレート文字列を名前抽出用キャプチャグループ付き正規表現にコンパイルする */
function compileTemplateRegex(template: string): RegExp {
  const clean = template.trim().replace(/[!！.。]+$/, "");
  const parts = clean.split(/(\{mon1\}|\{mon2\}|\{mon\}|\{trainer\}|\{move\}|\{item\}|\{ring\})/);

  let pattern = "";
  for (const part of parts) {
    if (part === "{mon1}") pattern += "(?<mon1>.+?)";
    else if (part === "{mon2}") pattern += "(?<mon2>.+?)";
    else if (part === "{mon}") pattern += "(?<mon>.+?)";
    else if (part === "{trainer}") pattern += "(?<trainer>.+?)";
    else if (part === "{move}") pattern += "(?<move>.+?)";
    else if (part === "{item}") pattern += "(?<item>.+?)";
    else if (part === "{ring}") pattern += "(?<ring>.+?)";
    else {
      const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pattern += escaped.replace(/\s+/g, "\\s*");
    }
  }

  return new RegExp(`^.*?${pattern}(?:[!！|].*|[!！.\\s。]*)$`, "is");
}

const cleanName = (s: string): string =>
  s
    .replace(/[!！|].*$/, "")
    .replace(/\s+the\s+.*$/i, "")
    .replace(/[!！.。\s]+$/, "")
    .trim();

/** テンプレート定義から BattleLogPatternSet を全自動コンパイルする（データ駆動） */
export function compileMessagePatternSet(templates: BattleMessageTemplates): BattleLogPatternSet {
  const withdrawRegexes = (templates.withdraw ?? []).map((t) => compileTemplateRegex(t));
  const sentOutTwoRegexes = (templates.sentOutTwo ?? []).map((t) => compileTemplateRegex(t));
  const sentOutOneRegexes = (templates.sentOutOne ?? []).map((t) => compileTemplateRegex(t));
  const goTwoRegexes = (templates.goTwo ?? []).map((t) => compileTemplateRegex(t));
  const goOneRegexes = (templates.goOne ?? []).map((t) => compileTemplateRegex(t));
  const moveUsedRegexes = (templates.moveUsed ?? []).map((t) => compileTemplateRegex(t));
  const readyToHelpRegexes = (templates.readyToHelp ?? []).map((t) => compileTemplateRegex(t));
  const megaEvolvedRegexes = (templates.megaEvolved ?? []).map((t) => compileTemplateRegex(t));

  const readyToHelpToken = templates.readyToHelpPhrase
    ? normalizeOcrToken(templates.readyToHelpPhrase)
    : null;
  const megaReactionToken = templates.megaReactionPhrase
    ? normalizeOcrToken(templates.megaReactionPhrase)
    : null;
  const megaEvolvedToken = templates.megaEvolvedPhrase
    ? normalizeOcrToken(templates.megaEvolvedPhrase)
    : null;

  const perishCountRegex =
    templates.perishCountRegex ??
    /^(?:The\s+opposing\s+)?(.+?)['’]s\s+perish\s+count\s+fell\s+to\s+(\d+)[!.]?$/i;
  const perishStartPhrases = (
    templates.perishStartPhrases ?? ["allpokemonthatheardthesongwillfaintinthreeturns"]
  ).map((s) => normalizeOcrToken(s));
  const forfeitPhrases = (templates.forfeitPhrases ?? ["thebattlehasendedduetoaforfeit"]).map((s) =>
    normalizeOcrToken(s),
  );

  const statCapPhrases = (templates.statCapPhrases ?? ["wontgoanyhigher", "wontgoanylower"]).map(
    (s) => normalizeOcrToken(s),
  );
  const statResetPhrases = (templates.statResetPhrases ?? ["returneditsstatstonormal"]).map((s) =>
    normalizeOcrToken(s),
  );
  const opposingPrefixes = (templates.opposingPrefixes ?? ["theopposing"]).map((s) =>
    normalizeOcrToken(s),
  );

  return {
    lang: templates.lang,
    fieldPhrases: templates.fieldPhrases.map((f) => ({
      ...f,
      phrase: normalizeOcrToken(f.phrase),
    })),
    sidePhrases: (templates.sidePhrases ?? []).map((s) => ({
      ...s,
      phrase: normalizeOcrToken(s.phrase),
    })),
    moveOutcomePhrases: (templates.moveOutcomePhrases ?? []).map((m) => ({
      ...m,
      phrase: normalizeOcrToken(m.phrase),
    })),
    itemEffectPhrases: (templates.itemEffectPhrases ?? []).map((i) => ({
      ...i,
      phrase: normalizeOcrToken(i.phrase),
      mustInclude: i.mustInclude ? normalizeOcrToken(i.mustInclude) : undefined,
    })),
    statWords: templates.statWords.map((s) => ({
      ...s,
      words: s.words.map((w) => normalizeOcrToken(w)),
    })),
    statChanges: templates.statChanges.map((s) => ({
      ...s,
      suffix: normalizeOcrToken(s.suffix),
    })),
    healPhrases: templates.healPhrases.map((h) => ({
      ...h,
      phrase: normalizeOcrToken(h.phrase),
    })),
    cantPhrases: (templates.cantPhrases ?? []).map((c) => ({
      ...c,
      phrase: normalizeOcrToken(c.phrase),
      mustInclude: c.mustInclude ? normalizeOcrToken(c.mustInclude) : undefined,
    })),
    critPhrases: (templates.critPhrases ?? []).map((c) => normalizeOcrToken(c)),
    effectivenessPhrases: (templates.effectivenessPhrases ?? []).map((e) => ({
      ...e,
      phrase: normalizeOcrToken(e.phrase),
    })),
    residualDamagePhrases: (templates.residualDamagePhrases ?? []).map((r) => ({
      ...r,
      phrase: normalizeOcrToken(r.phrase),
      mustInclude: r.mustInclude ? normalizeOcrToken(r.mustInclude) : undefined,
    })),
    statusPhrases: (templates.statusPhrases ?? []).map((s) => ({
      ...s,
      phrase: normalizeOcrToken(s.phrase),
      mustInclude: s.mustInclude ? normalizeOcrToken(s.mustInclude) : undefined,
    })),
    curePhrases: (templates.curePhrases ?? []).map((s) => ({
      ...s,
      phrase: normalizeOcrToken(s.phrase),
    })),
    statCapPhrases,
    statResetPhrases,
    statResetDefs: (templates.statResetDefs ?? []).map((d) => ({
      ...d,
      phrase: normalizeOcrToken(d.phrase),
    })),
    allySwitchPhrases: (templates.allySwitchPhrases ?? []).map((s) => normalizeOcrToken(s)),
    courtChangePhrases: (templates.courtChangePhrases ?? []).map((s) => normalizeOcrToken(s)),
    tidyUpPhrases: (templates.tidyUpPhrases ?? []).map((s) => normalizeOcrToken(s)),
    bellyDrumPhrases: (templates.bellyDrumPhrases ?? []).map((s) => normalizeOcrToken(s)),
    angerPointPhrases: (templates.angerPointPhrases ?? []).map((s) => normalizeOcrToken(s)),
    opposingPrefixes,
    faintedPhrases: (templates.fainted ?? []).map((s) => normalizeOcrToken(s)),
    protectPhrases: {
      wideGuard: (templates.wideGuard ?? []).map((s) => normalizeOcrToken(s)),
      quickGuard: (templates.quickGuard ?? []).map((s) => normalizeOcrToken(s)),
      protectItself: (templates.protectItself ?? []).map((s) => normalizeOcrToken(s)),
      protectGeneral: (templates.protectGeneral ?? []).map((s) => normalizeOcrToken(s)),
    },
    matchWithdraw: (rawText) => {
      for (const rx of withdrawRegexes) {
        if (rx.test(rawText)) return true;
      }
      return false;
    },
    matchSentOut: (rawText) => {
      for (const rx of sentOutTwoRegexes) {
        const m = rx.exec(rawText);
        if (m?.groups?.mon1 && m?.groups?.mon2) {
          return { names: [cleanName(m.groups.mon1), cleanName(m.groups.mon2)] };
        }
      }
      for (const rx of sentOutOneRegexes) {
        const m = rx.exec(rawText);
        if (m?.groups?.mon) {
          return { names: [cleanName(m.groups.mon)] };
        }
      }
      return null;
    },
    matchGo: (rawText) => {
      for (const rx of goTwoRegexes) {
        const m = rx.exec(rawText);
        if (m?.groups?.mon1 && m?.groups?.mon2) {
          return { names: [cleanName(m.groups.mon1), cleanName(m.groups.mon2)] };
        }
      }
      for (const rx of goOneRegexes) {
        const m = rx.exec(rawText);
        if (m?.groups?.mon) {
          return { names: [cleanName(m.groups.mon)] };
        }
      }
      return null;
    },
    matchMoveUsed: (rawText) => {
      for (const rx of moveUsedRegexes) {
        const m = rx.exec(rawText);
        if (m?.groups?.mon && m?.groups?.move) {
          const isOpposing = /opposing|相手/i.test(rx.source);
          return {
            actorPart: m.groups.mon.trim(),
            movePart: m.groups.move.trim(),
            isOpposing,
          };
        }
      }
      return null;
    },
    matchReadyToHelp: (rawText, textKey) => {
      for (const rx of readyToHelpRegexes) {
        const m = rx.exec(rawText);
        if (m?.groups?.mon1 && m?.groups?.mon2) {
          return {
            actorKey: normalizeOcrToken(m.groups.mon1),
            targetKey: normalizeOcrToken(m.groups.mon2),
          };
        }
      }
      if (!readyToHelpToken) return null;
      const found = approxFind(textKey, readyToHelpToken);
      if (found.score < 0.75) return null;
      return {
        actorKey: textKey.slice(0, Math.max(0, found.end - readyToHelpToken.length)),
        targetKey: textKey.slice(found.end),
      };
    },
    matchMegaReaction: (rawText, textKey) => {
      if (!megaReactionToken || approxFind(textKey, megaReactionToken).score < 0.75) return null;
      const m = /^(.*?)\s*(?:'s|is\s+reacting|の|が)/i.exec(rawText);
      return m?.[1] ? { leftPart: m[1] } : null;
    },
    matchMegaEvolved: (rawText, textKey) => {
      if (!megaEvolvedToken) return null;
      const found = approxFind(textKey, megaEvolvedToken);
      if (found.score < 0.75) return null;
      for (const rx of megaEvolvedRegexes) {
        const m = rx.exec(rawText);
        if (m?.groups?.mon) {
          return {
            headKey: normalizeOcrToken(m.groups.mon),
          };
        }
      }
      return {
        headKey: textKey.slice(0, Math.max(0, found.end - megaEvolvedToken.length)),
      };
    },
    matchPerishCount: (rawText: string) => {
      const trimmed = rawText.trim();
      const m = perishCountRegex.exec(trimmed);
      if (!m || !m[1] || !m[2]) return null;
      const isOpposing = /^(?:The\s+opposing\s+|相手の\s*)/i.test(trimmed);
      const count = parseInt(m[2], 10);
      return { mon: m[1].trim(), count, isOpposing };
    },
    matchPerishStart: (_rawText: string, textKey: string) => {
      return perishStartPhrases.some((phrase) => approxFind(textKey, phrase).score >= 0.75);
    },
    matchForfeit: (_rawText: string, textKey: string) => {
      return forfeitPhrases.some((phrase) => approxFind(textKey, phrase).score >= 0.75);
    },
  };
}

// ---------------------------------------------------------------------------
// 言語テンプレート定義データ (pokepc/champions-datadump 準拠)
// ---------------------------------------------------------------------------

export const ENGLISH_MESSAGE_TEMPLATES: BattleMessageTemplates = {
  lang: "en",
  withdraw: [
    "{trainer} withdrew {mon}!",
    "{mon}, come back!",
    "The opposing {mon} went back to {trainer}!",
    "{mon} went back to {trainer}!",
  ],
  sentOutTwo: ["{trainer} sent out {mon1} and {mon2}!"],
  sentOutOne: ["The opposing {mon} was dragged out!", "{trainer} sent out {mon}!"],
  goTwo: ["Go! {mon1} and {mon2}!"],
  goOne: ["Go! {mon}!", "{mon} was dragged out!"],
  moveUsed: ["The opposing {mon} used {move}!", "{mon} used {move}!"],
  readyToHelp: ["The opposing {mon1} is ready to help {mon2}!", "{mon1} is ready to help {mon2}!"],
  readyToHelpPhrase: "isreadytohelp",
  megaReactionPhrase: "isreactingto",
  megaEvolvedPhrase: "hasmegaevolvedinto",
  megaEvolved: [
    "The opposing {mon} has Mega Evolved into Mega {item}!",
    "{mon} has Mega Evolved into Mega {item}!",
  ],
  fainted: ["fainted"],
  wideGuard: ["wideguardprotected"],
  quickGuard: ["quickguardprotected"],
  protectItself: ["protecteditself", "enduredthehit", "braceditself"],
  protectGeneral: ["protecteditself", "enduredthehit", "braceditself"],
  statWords: [
    { words: ["attack"], stat: "atk" },
    { words: ["defense"], stat: "def" },
    { words: ["spatk"], stat: "spa" },
    { words: ["spdef"], stat: "spd" },
    { words: ["speed"], stat: "spe" },
    { words: ["accuracy"], stat: "accuracy" },
    { words: ["evasiveness"], stat: "evasion" },
  ],
  statChanges: [
    { suffix: "fell", delta: -1 },
    { suffix: "harshlyfell", delta: -2 },
    { suffix: "severelyfell", delta: -3 },
    { suffix: "rose", delta: 1 },
    { suffix: "rosesharply", delta: 2 },
    { suffix: "rosedrastically", delta: 3 },
    { suffix: "maxeditsattack", delta: 6 },
    { suffix: "maximizeditsattack", delta: 6 },
  ],
  fieldPhrases: [
    { phrase: "twisteddimensionsreturnedtonormal", effect: { kind: "trick-room", on: false } },
    { phrase: "twistedthedimensions", effect: { kind: "trick-room", on: true } },
    {
      phrase: "wonderroomworeoff",
      effect: { kind: "field", condition: "wonder-room", on: false },
    },
    {
      phrase: "defenseandspdefstatsareswapped",
      effect: { kind: "field", condition: "wonder-room", on: true },
    },
    {
      phrase: "magicroomworeoff",
      effect: { kind: "field", condition: "magic-room", on: false },
    },
    {
      phrase: "helditemslosetheireffects",
      effect: { kind: "field", condition: "magic-room", on: true },
    },
    {
      phrase: "gravityreturnedtonormal",
      effect: { kind: "field", condition: "gravity", on: false },
    },
    {
      phrase: "gravityintensified",
      effect: { kind: "field", condition: "gravity", on: true },
    },
    {
      phrase: "noonewillbeabletoleavethebattlefield",
      effect: { kind: "field", condition: "fairy-lock", on: true },
    },
    { phrase: "startedtorain", effect: { kind: "weather", value: "Rain" } },
    { phrase: "rainstopped", effect: { kind: "weather", value: "None" } },
    { phrase: "sunlightturnedharsh", effect: { kind: "weather", value: "HarshSunlight" } },
    { phrase: "harshsunlightfaded", effect: { kind: "weather", value: "None" } },
    { phrase: "sandstormkickedup", effect: { kind: "weather", value: "Sandstorm" } },
    { phrase: "sandstormsubsided", effect: { kind: "weather", value: "None" } },
    { phrase: "startedtosnow", effect: { kind: "weather", value: "Snow" } },
    { phrase: "snowstopped", effect: { kind: "weather", value: "None" } },
    { phrase: "effectsoftheweatherdisappeared", effect: { kind: "weather", value: "None" } },
    { phrase: "grassgrewtocover", effect: { kind: "terrain", value: "Grassy" } },
    { phrase: "grassdisappeared", effect: { kind: "terrain", value: "None" } },
    { phrase: "electriccurrentranacross", effect: { kind: "terrain", value: "Electric" } },
    { phrase: "electricitydisappeared", effect: { kind: "terrain", value: "None" } },
    { phrase: "mistswirledaround", effect: { kind: "terrain", value: "Misty" } },
    { phrase: "mistdisappeared", effect: { kind: "terrain", value: "None" } },
    { phrase: "battlefieldgotweird", effect: { kind: "terrain", value: "Psychic" } },
    { phrase: "weirdnessdisappeared", effect: { kind: "terrain", value: "None" } },
  ],
  sidePhrases: [
    // Reflect
    { phrase: "reflectmadeyoursidestronger", side: "p1", condition: "reflect", on: true },
    { phrase: "reflectmadetheopposingsidestronger", side: "p2", condition: "reflect", on: true },
    { phrase: "yoursidesreflectworeoff", side: "p1", condition: "reflect", on: false },
    { phrase: "opposingsidesreflectworeoff", side: "p2", condition: "reflect", on: false },
    // Light Screen
    { phrase: "lightscreenmadeyoursidestronger", side: "p1", condition: "light-screen", on: true },
    {
      phrase: "lightscreenmadetheopposingsidestronger",
      side: "p2",
      condition: "light-screen",
      on: true,
    },
    { phrase: "yoursideslightscreenworeoff", side: "p1", condition: "light-screen", on: false },
    {
      phrase: "opposingsideslightscreenworeoff",
      side: "p2",
      condition: "light-screen",
      on: false,
    },
    // Aurora Veil
    { phrase: "auroraveilmadeyoursidestronger", side: "p1", condition: "aurora-veil", on: true },
    {
      phrase: "auroraveilmadetheopposingsidestronger",
      side: "p2",
      condition: "aurora-veil",
      on: true,
    },
    { phrase: "yoursidesauroraveilworeoff", side: "p1", condition: "aurora-veil", on: false },
    { phrase: "opposingsidesauroraveilworeoff", side: "p2", condition: "aurora-veil", on: false },
    // Safeguard
    {
      phrase: "yoursidebecamecloakedinamysticalveil",
      side: "p1",
      condition: "safeguard",
      on: true,
    },
    {
      phrase: "opposingsidebecamecloakedinamysticalveil",
      side: "p2",
      condition: "safeguard",
      on: true,
    },
    {
      phrase: "yoursideisnolongerprotectedbythemysticalveil",
      side: "p1",
      condition: "safeguard",
      on: false,
    },
    {
      phrase: "opposingsideisnolongerprotectedbythemysticalveil",
      side: "p2",
      condition: "safeguard",
      on: false,
    },
    // Tailwind
    { phrase: "tailwindstartedblowingonyourside", side: "p1", condition: "tailwind", on: true },
    {
      phrase: "tailwindstartedblowingontheopposingside",
      side: "p2",
      condition: "tailwind",
      on: true,
    },
    { phrase: "yoursidestailwindpeteredout", side: "p1", condition: "tailwind", on: false },
    { phrase: "opposingsidestailwindpeteredout", side: "p2", condition: "tailwind", on: false },
    // Spikes
    {
      phrase: "spikeswerescatteredonthegroundallaroundyourside",
      side: "p1",
      condition: "spikes",
      on: true,
    },
    {
      phrase: "spikeswerescatteredonthegroundallaroundtheopposingside",
      side: "p2",
      condition: "spikes",
      on: true,
    },
    {
      phrase: "spikesdisappearedfromthegroundaroundyourside",
      side: "p1",
      condition: "spikes",
      on: false,
    },
    {
      phrase: "spikesdisappearedfromthegroundaroundtheopposingside",
      side: "p2",
      condition: "spikes",
      on: false,
    },
    // Toxic Spikes
    {
      phrase: "toxicspikeswerescatteredonthegroundallaroundyourside",
      side: "p1",
      condition: "toxic-spikes",
      on: true,
    },
    {
      phrase: "toxicspikeswerescatteredonthegroundallaroundtheopposingside",
      side: "p2",
      condition: "toxic-spikes",
      on: true,
    },
    {
      phrase: "toxicspikesdisappearedfromthegroundaroundyourside",
      side: "p1",
      condition: "toxic-spikes",
      on: false,
    },
    {
      phrase: "toxicspikesdisappearedfromthegroundaroundtheopposingside",
      side: "p2",
      condition: "toxic-spikes",
      on: false,
    },
    // Stealth Rock
    {
      phrase: "pointedstonesfloatintheaironyourside",
      side: "p1",
      condition: "stealth-rock",
      on: true,
    },
    {
      phrase: "pointedstonesfloatintheairontheopposingside",
      side: "p2",
      condition: "stealth-rock",
      on: true,
    },
    {
      phrase: "pointedstonesdisappearedfromyourside",
      side: "p1",
      condition: "stealth-rock",
      on: false,
    },
    {
      phrase: "pointedstonesdisappearedfromtheopposingside",
      side: "p2",
      condition: "stealth-rock",
      on: false,
    },
    // Sticky Web
    {
      phrase: "stickywebhasbeenlaidoutonthegroundonyourside",
      side: "p1",
      condition: "sticky-web",
      on: true,
    },
    {
      phrase: "stickywebhasbeenlaidoutonthegroundontheopposingside",
      side: "p2",
      condition: "sticky-web",
      on: true,
    },
    {
      phrase: "stickywebhasdisappearedfromthegroundonyourside",
      side: "p1",
      condition: "sticky-web",
      on: false,
    },
    {
      phrase: "stickywebhasdisappearedfromthegroundontheopposingside",
      side: "p2",
      condition: "sticky-web",
      on: false,
    },
    // Wide Guard & Quick Guard side notifications
    { phrase: "wideguardnowprotectsyourside", side: "p1", condition: "wide-guard", on: true },
    {
      phrase: "wideguardnowprotectstheopposingside",
      side: "p2",
      condition: "wide-guard",
      on: true,
    },
    { phrase: "quickguardnowprotectsyourside", side: "p1", condition: "quick-guard", on: true },
    {
      phrase: "quickguardnowprotectstheopposingside",
      side: "p2",
      condition: "quick-guard",
      on: true,
    },
  ],
  moveOutcomePhrases: [
    { phrase: "avoidedtheattack", outcome: "missed", targetSpecific: true },
    { phrase: "butitfailedtoaffect", outcome: "failed", targetSpecific: true },
    { phrase: "butitfailed", outcome: "failed", targetSpecific: false },
    { phrase: "butnothinghappened", outcome: "failed", targetSpecific: false },
    {
      phrase: "doesnotHaveenoughhplefttomakeasubstitute",
      outcome: "failed",
      targetSpecific: false,
    },
    { phrase: "alreadyhasasubstitute", outcome: "failed", targetSpecific: true },
    { phrase: "itdoesntaffect", outcome: "immune", targetSpecific: true },
  ],
  itemEffectPhrases: [
    {
      phrase: "returneditsstatstonormal",
      item: "white-herb",
      consumed: true,
      action: "reset-stats",
    },
    {
      phrase: "hungonusingits",
      item: "focus-sash",
      consumed: true,
      action: "endure",
    },
    {
      phrase: "isswitchedoutwiththeejectbutton",
      item: "eject-button",
      consumed: true,
      action: "switch-self",
    },
    {
      phrase: "heldupitsredcardagainst",
      item: "red-card",
      consumed: true,
      action: "switch-target",
    },
    {
      phrase: "floatsintheairwithitsairballoon",
      item: "air-balloon",
      consumed: false,
      action: "float-balloon",
    },
    {
      phrase: "airballoonpopped",
      item: "air-balloon",
      consumed: true,
      action: "pop-balloon",
    },
    {
      phrase: "lessenedthedamageittook",
      consumed: true,
    },
    {
      phrase: "restoredpptoitsmove",
      item: "leppa-berry",
      consumed: true,
    },
    {
      phrase: "knockedoff",
      consumed: true,
      targetPosition: "last",
    },
    {
      phrase: "corroded",
      consumed: true,
      targetPosition: "last",
    },
    {
      phrase: "stoleandateitstargets",
      consumed: true,
    },
    {
      phrase: "stole",
      consumed: true,
      targetPosition: "last",
    },
    {
      phrase: "flungits",
      consumed: true,
    },
    {
      phrase: "obtained",
      consumed: false,
    },
    {
      phrase: "harvested",
      consumed: false,
    },
    {
      phrase: "found",
      consumed: false,
    },
  ],
  healPhrases: [
    { phrase: "sleptandrestoreditshp", effect: "rest", alsoStatus: "slp" },
    { phrase: "aveilofwaterrestored", effect: "aqua-ring" },
    { phrase: "absorbednutrientswithitsroots", effect: "ingrain" },
    { phrase: "wishcametrue", effect: "wish" },
    { phrase: "thehealingwishcametruefor", effect: "healing-wish" },
    { phrase: "drankdownallthematcha", effect: "hospitality" },
    { phrase: "haditshprestored", effect: "grassy-terrain" },
  ],
  cantPhrases: [
    { phrase: "flinchedandcouldntmove", reason: "flinch" },
    { phrase: "lostitsfocusandcouldntmove", reason: "focus-punch" },
    { phrase: "couldntmovebecauseitsparalyzed", reason: "par" },
    { phrase: "isfastasleep", reason: "slp" },
    { phrase: "isfrozensolid", reason: "frz" },
    { phrase: "isimmobilizedbylove", reason: "infatuation" },
    { phrase: "hurtitselfinitsconfusion", reason: "confusion" },
    { phrase: "afterthetaunt", reason: "taunt" },
    { phrase: "duetothetorment", reason: "torment" },
    { phrase: "cantuseitssealed", reason: "imprison" },
    { phrase: "isdisabled", reason: "disable" },
    { phrase: "mustrecharge", reason: "recharge" },
    { phrase: "ispreventedfromhealingsoitcantuse", reason: "heal-block" },
    { phrase: "becauseofgravity", reason: "gravity" },
    { phrase: "theeffectsofthroatchopprevent", reason: "throat-chop" },
    { phrase: "soitcantpossiblybelch", reason: "belch" },
    { phrase: "isprotectedbythepsychicterrain", reason: "psychic-terrain" },
    { phrase: "cannotuse", reason: "cannot-use" },
  ],
  critPhrases: ["acriticalhiton", "acriticalhit"],
  effectivenessPhrases: [
    { phrase: "itssupereffectiveon", eff: 1 },
    { phrase: "itssupereffective", eff: 1 },
    { phrase: "itsextremelyeffectiveon", eff: 1 },
    { phrase: "itsextremelyeffective", eff: 1 },
    { phrase: "itsnotveryeffectiveon", eff: -1 },
    { phrase: "itsnotveryeffective", eff: -1 },
    { phrase: "itsmostlyineffectiveon", eff: -1 },
    { phrase: "itsmostlyineffective", eff: -1 },
    { phrase: "itdoesntaffect", eff: 0 },
  ],
  residualDamagePhrases: [
    { phrase: "isbuffetedbythesandstorm", effect: "sandstorm" },
    { phrase: "lostsomeofitshp", effect: "life-orb" },
    { phrase: "washurtbyitsburn", effect: "burn" },
    { phrase: "washurtbyitspoisoning", effect: "poison" },
    { phrase: "wasdamagedbytherecoil", effect: "recoil" },
    { phrase: "keptgoingandcrashed", effect: "crash" },
    { phrase: "healthissappedbyleechseed", effect: "leech-seed" },
    { phrase: "isafflictedbythecurse", effect: "curse" },
    { phrase: "washurtbythespikes", effect: "spikes" },
    { phrase: "pointedstonesduginto", effect: "stealth-rock" },
    { phrase: "ishurtby", effect: "bind" },
  ],
  statusPhrases: [
    { phrase: "grewdrowsy", status: "yawn", isVolatile: true },
    { phrase: "fellasleep", status: "slp" },
    { phrase: "isparalyzedsoitmaybeunabletomove", status: "par" },
    { phrase: "wasburnedbythe", status: "brn" },
    { phrase: "wasburned", status: "brn" },
    { phrase: "wasbadlypoisonedbythe", status: "tox" },
    { phrase: "wasbadlypoisoned", status: "tox" },
    { phrase: "waspoisoned", status: "psn" },
    { phrase: "wasfrozensolid", status: "frz" },
    // Volatile statuses
    { phrase: "becameconfusedduetofatigue", status: "confusion", isVolatile: true },
    { phrase: "becameconfused", status: "confusion", isVolatile: true },
    { phrase: "fellinlove", status: "infatuation", isVolatile: true },
    { phrase: "mustdoanencore", status: "encore", isVolatile: true },
    { phrase: "fellforthetaunt", status: "taunt", isVolatile: true },
    { phrase: "wassubjectedtotorment", status: "torment", isVolatile: true },
    { phrase: "wasdisabled", status: "disable", isVolatile: true },
    { phrase: "sealedanymovesitstargetshareswithit", status: "imprison", isVolatile: true },
    { phrase: "waspreventedfromhealing", status: "heal-block", isVolatile: true },
    { phrase: "putinasubstitute", status: "substitute", isVolatile: true },
    { phrase: "sheditstailtocreateadecoy", status: "substitute", isVolatile: true },
    { phrase: "wasseeded", status: "leech-seed", isVolatile: true },
    {
      phrase: "cutitsownhpandputacurseon",
      status: "curse",
      isVolatile: true,
      targetPosition: "last",
    },
    { phrase: "isbeingsaltcured", status: "salt-cure", isVolatile: true },
    { phrase: "gotcoveredinstickycandysyrup", status: "syrup-bomb", isVolatile: true },
    { phrase: "surroundeditselfwithaveilofwater", status: "aqua-ring", isVolatile: true },
    { phrase: "planteditsroots", status: "ingrain", isVolatile: true },
    { phrase: "levitatedwithelectromagnetism", status: "magnet-rise", isVolatile: true },
    { phrase: "isgettingpumped", status: "focus-energy", isVolatile: true },
    { phrase: "ishopingtotakeitsattackerdownwithit", status: "destiny-bond", isVolatile: true },
    { phrase: "beganchargingpower", status: "charge", isVolatile: true },
    { phrase: "absorbedelectricity", status: "charge", isVolatile: true },
    { phrase: "causedanuproar", status: "uproar", isVolatile: true },
    { phrase: "abilitywassuppressed", status: "gastro-acid", isVolatile: true },
    { phrase: "becamethecenterofattention", status: "follow-me", isVolatile: true },
    { phrase: "fellstraightdown", status: "smack-down", isVolatile: true },
    { phrase: "fellfromtheskyduetothegravity", status: "smack-down", isVolatile: true },
    { phrase: "becametrappedinthevortex", status: "bound", isVolatile: true },
    { phrase: "becametrappedinthefieryvortex", status: "bound", isVolatile: true },
    { phrase: "becametrappedbythequicksand", status: "bound", isVolatile: true },
    { phrase: "gottrappedbyasnaptrap", status: "bound", isVolatile: true },
    { phrase: "hasbeenafflictedwithaninfestation", status: "bound", isVolatile: true },
    { phrase: "wassqueezedby", status: "bound", isVolatile: true },
    { phrase: "waswrappedby", status: "bound", isVolatile: true },
    { phrase: "cannolongerescapebecauseofoctolock", status: "octolock", isVolatile: true },
    { phrase: "cannolongerescapebecauseitusednoretreat", status: "no-retreat", isVolatile: true },
    { phrase: "cannolongerescape", status: "cant-escape", isVolatile: true },
  ],
  curePhrases: [
    { phrase: "wokeup", status: "slp" },
    { phrase: "wokeitup", status: "slp" },
    { phrase: "wascuredofparalysis", status: "par" },
    { phrase: "cureditsparalysis", status: "par" },
    { phrase: "burnwascured", status: "brn" },
    { phrase: "cureditsburn", status: "brn" },
    { phrase: "wascuredofitspoisoning", status: "psn" },
    { phrase: "cureditspoisoning", status: "psn" },
    { phrase: "thawedout", status: "frz" },
    { phrase: "meltedtheice", status: "frz" },
    { phrase: "defrostedit", status: "frz" },
    { phrase: "statusreturnedtonormal", status: "all" },
    // Volatile status cures
    { phrase: "foughtoffitsdrowsiness", status: "yawn", isVolatile: true },
    { phrase: "causeditTosnapfullyawake", status: "yawn", isVolatile: true },
    { phrase: "snappedoutofitsconfusion", status: "confusion", isVolatile: true },
    { phrase: "snappeditoutofitsconfusion", status: "confusion", isVolatile: true },
    { phrase: "gotoveritsinfatuation", status: "infatuation", isVolatile: true },
    { phrase: "cureditsinfatuationusing", status: "infatuation", isVolatile: true },
    { phrase: "endeditsencore", status: "encore", isVolatile: true },
    { phrase: "shookoffthetaunt", status: "taunt", isVolatile: true },
    { phrase: "isnolongertormented", status: "torment", isVolatile: true },
    { phrase: "moveisnolongerdisabled", status: "disable", isVolatile: true },
    { phrase: "isnolongerpreventedfromhealing", status: "heal-block", isVolatile: true },
    { phrase: "substitutefaded", status: "substitute", isVolatile: true },
    { phrase: "electromagnetismworeoff", status: "magnet-rise", isVolatile: true },
    { phrase: "calmeddown", status: "uproar", isVolatile: true },
    { phrase: "wasfreedfrom", status: "bound", isVolatile: true },
  ],
  perishCountRegex: /^(?:The\s+opposing\s+)?(.+?)['’]s\s+perish\s+count\s+fell\s+to\s+(\d+)[!.]?$/i,
  perishStartPhrases: ["allpokemonthatheardthesongwillfaintinthreeturns"],
  forfeitPhrases: ["thebattlehasendedduetoaforfeit"],
  statCapPhrases: [
    "wontgoanyhigher",
    "wontgoanylower",
    "statswerenotlowered",
    "attackwasnotlowered",
    "defensewasnotlowered",
    "accuracywasnotlowered",
  ],
  statResetPhrases: ["returneditsstatstonormal"],
  statResetDefs: [
    { phrase: "returneditsstatstonormal", scope: "single", isItem: true },
    { phrase: "statchangeswereremoved", scope: "single" },
    { phrase: "allstatchangeswereeliminated", scope: "all" },
    { phrase: "wereinverted", scope: "invert" },
  ],
  allySwitchPhrases: ["switchedplaces"],
  courtChangePhrases: ["swappedthebattleeffectsaffectingeachside"],
  tidyUpPhrases: ["tidyingupcomplete"],
  bellyDrumPhrases: ["cutitsownhpandmaximizeditsattack"],
  angerPointPhrases: ["maxeditsattack"],
  opposingPrefixes: ["theopposing"],
};

export const JAPANESE_MESSAGE_TEMPLATES: BattleMessageTemplates = {
  lang: "ja",
  withdraw: [
    "{mon} 戻れ！",
    "{trainer}は {mon}を 引っこめた！",
    "相手の {mon}は {trainer}の元へ 戻っていく！",
    "{mon}は {trainer}の元へ 戻っていく！",
  ],
  sentOutTwo: ["{trainer}は {mon1}と {mon2}を 繰り出した！"],
  sentOutOne: ["相手の {mon}は 戦闘に 引きずりだされた！", "{trainer}は {mon}を 繰り出した！"],
  goTwo: ["ゆけっ！ {mon1}！ {mon2}！"],
  goOne: ["ゆけっ！ {mon}！", "{mon}は 戦闘に 引きずりだされた！"],
  moveUsed: ["相手の {mon}の {move}！", "{mon}の {move}！"],
  readyToHelp: [
    "相手の {mon1}は {mon2}を 手助けする 体勢に入った！",
    "{mon1}は {mon2}を 手助けする 体勢に入った！",
  ],
  readyToHelpPhrase: "手助けする体勢に入った",
  megaReactionPhrase: "反応した",
  megaEvolvedPhrase: "メガシンカした",
  megaEvolved: [
    "相手の {mon}は メガ{item}に メガシンカした！",
    "{mon}は メガ{item}に メガシンカした！",
  ],
  fainted: ["たおれた"],
  wideGuard: ["ワイドガードで守られた"],
  quickGuard: ["ファストガードで守られた"],
  protectItself: [
    "攻撃から身を守った",
    "攻撃をこらえた",
    "守りの体勢に入った",
    "こらえる体勢に入った",
  ],
  protectGeneral: [
    "攻撃から身を守った",
    "攻撃をこらえた",
    "守りの体勢に入った",
    "こらえる体勢に入った",
  ],
  statWords: [
    { words: ["攻撃"], stat: "atk" },
    { words: ["防御"], stat: "def" },
    { words: ["特攻"], stat: "spa" },
    { words: ["特防"], stat: "spd" },
    { words: ["素早さ"], stat: "spe" },
    { words: ["命中率"], stat: "accuracy" },
    { words: ["回避率"], stat: "evasion" },
  ],
  statChanges: [
    { suffix: "上がった", delta: 1 },
    { suffix: "ぐーんと上がった", delta: 2 },
    { suffix: "ぐぐーんと上がった", delta: 3 },
    { suffix: "最大まで上がった", delta: 6 },
    { suffix: "下がった", delta: -1 },
    { suffix: "がくっと下がった", delta: -2 },
    { suffix: "がくーんと下がった", delta: -3 },
  ],
  fieldPhrases: [
    { phrase: "ゆがんだ時空が元に戻った", effect: { kind: "trick-room", on: false } },
    { phrase: "時空をゆがめた", effect: { kind: "trick-room", on: true } },
    {
      phrase: "ワンダールームが解除され",
      effect: { kind: "field", condition: "wonder-room", on: false },
    },
    {
      phrase: "防御と特防が入れ替わる空間を作りだした",
      effect: { kind: "field", condition: "wonder-room", on: true },
    },
    {
      phrase: "マジックルームが解除され",
      effect: { kind: "field", condition: "magic-room", on: false },
    },
    {
      phrase: "持たせた道具の効果がなくなる空間を作りだした",
      effect: { kind: "field", condition: "magic-room", on: true },
    },
    {
      phrase: "じゅうりょくが元に戻った",
      effect: { kind: "field", condition: "gravity", on: false },
    },
    {
      phrase: "じゅうりょくが強くなった",
      effect: { kind: "field", condition: "gravity", on: true },
    },
    {
      phrase: "次のターンは逃げられない",
      effect: { kind: "field", condition: "fairy-lock", on: true },
    },
    { phrase: "雨が降り始めた", effect: { kind: "weather", value: "Rain" } },
    { phrase: "雨が上がった", effect: { kind: "weather", value: "None" } },
    { phrase: "日差しが強くなった", effect: { kind: "weather", value: "HarshSunlight" } },
    { phrase: "日差しが元に戻った", effect: { kind: "weather", value: "None" } },
    { phrase: "砂あらしが吹き始めた", effect: { kind: "weather", value: "Sandstorm" } },
    { phrase: "砂あらしがおさまった", effect: { kind: "weather", value: "None" } },
    { phrase: "雪が降り始めた", effect: { kind: "weather", value: "Snow" } },
    { phrase: "雪が止んだ", effect: { kind: "weather", value: "None" } },
    { phrase: "天候の影響がなくなった", effect: { kind: "weather", value: "None" } },
    { phrase: "足下に草がおいしげった", effect: { kind: "terrain", value: "Grassy" } },
    { phrase: "足下の草が消え去った", effect: { kind: "terrain", value: "None" } },
    { phrase: "足下に電気がかけめぐる", effect: { kind: "terrain", value: "Electric" } },
    { phrase: "足下の電気が消え去った", effect: { kind: "terrain", value: "None" } },
    { phrase: "足下に霧が立ち込めた", effect: { kind: "terrain", value: "Misty" } },
    { phrase: "足下の霧が消え去った", effect: { kind: "terrain", value: "None" } },
    { phrase: "足下が不思議な感じになった", effect: { kind: "terrain", value: "Psychic" } },
    { phrase: "足下の不思議感が消え去った", effect: { kind: "terrain", value: "None" } },
  ],
  sidePhrases: [
    // Reflect (リフレクター)
    { phrase: "味方はリフレクターで物理に強くなった", side: "p1", condition: "reflect", on: true },
    { phrase: "相手はリフレクターで物理に強くなった", side: "p2", condition: "reflect", on: true },
    { phrase: "味方のリフレクターがなくなった", side: "p1", condition: "reflect", on: false },
    { phrase: "相手のリフレクターがなくなった", side: "p2", condition: "reflect", on: false },
    // Light Screen (ひかりのかべ)
    {
      phrase: "味方はひかりのかべで特殊に強くなった",
      side: "p1",
      condition: "light-screen",
      on: true,
    },
    {
      phrase: "相手はひかりのかべで特殊に強くなった",
      side: "p2",
      condition: "light-screen",
      on: true,
    },
    { phrase: "味方のひかりのかべがなくなった", side: "p1", condition: "light-screen", on: false },
    { phrase: "相手のひかりのかべがなくなった", side: "p2", condition: "light-screen", on: false },
    // Aurora Veil (オーロラベール)
    {
      phrase: "味方はオーロラベールで物理と特殊に強くなった",
      side: "p1",
      condition: "aurora-veil",
      on: true,
    },
    {
      phrase: "相手はオーロラベールで物理と特殊に強くなった",
      side: "p2",
      condition: "aurora-veil",
      on: true,
    },
    { phrase: "味方のオーロラベールがなくなった", side: "p1", condition: "aurora-veil", on: false },
    { phrase: "相手のオーロラベールがなくなった", side: "p2", condition: "aurora-veil", on: false },
    // Safeguard (しんぴのまもり)
    { phrase: "味方は神秘のベールに包まれた", side: "p1", condition: "safeguard", on: true },
    { phrase: "相手は神秘のベールに包まれた", side: "p2", condition: "safeguard", on: true },
    {
      phrase: "味方を包んでいた神秘のベールがなくなった",
      side: "p1",
      condition: "safeguard",
      on: false,
    },
    {
      phrase: "相手を包んでいた神秘のベールがなくなった",
      side: "p2",
      condition: "safeguard",
      on: false,
    },
    // Tailwind (おいかぜ)
    { phrase: "味方に追い風が吹き始めた", side: "p1", condition: "tailwind", on: true },
    { phrase: "相手に追い風が吹き始めた", side: "p2", condition: "tailwind", on: true },
    { phrase: "味方の追い風が止んだ", side: "p1", condition: "tailwind", on: false },
    { phrase: "相手の追い風が止んだ", side: "p2", condition: "tailwind", on: false },
    // Spikes (まきびし)
    { phrase: "味方の足下にまきびしが散らばった", side: "p1", condition: "spikes", on: true },
    { phrase: "相手の足下にまきびしが散らばった", side: "p2", condition: "spikes", on: true },
    { phrase: "味方の足下のまきびしが消え去った", side: "p1", condition: "spikes", on: false },
    { phrase: "相手の足下のまきびしが消え去った", side: "p2", condition: "spikes", on: false },
    // Toxic Spikes (どくびし)
    {
      phrase: "味方の足下にどくびしが散らばった",
      side: "p1",
      condition: "toxic-spikes",
      on: true,
    },
    {
      phrase: "相手の足下にどくびしが散らばった",
      side: "p2",
      condition: "toxic-spikes",
      on: true,
    },
    {
      phrase: "味方の足下のどくびしが消え去った",
      side: "p1",
      condition: "toxic-spikes",
      on: false,
    },
    {
      phrase: "相手の足下のどくびしが消え去った",
      side: "p2",
      condition: "toxic-spikes",
      on: false,
    },
    // Stealth Rock (ステルスロック)
    {
      phrase: "味方の周りにとがった岩がただよい始めた",
      side: "p1",
      condition: "stealth-rock",
      on: true,
    },
    {
      phrase: "相手の周りにとがった岩がただよい始めた",
      side: "p2",
      condition: "stealth-rock",
      on: true,
    },
    {
      phrase: "味方の周りのステルスロックが消え去った",
      side: "p1",
      condition: "stealth-rock",
      on: false,
    },
    {
      phrase: "相手の周りのステルスロックが消え去った",
      side: "p2",
      condition: "stealth-rock",
      on: false,
    },
    // Sticky Web (ねばねばネット)
    {
      phrase: "味方の足下にねばねばネットが広がった",
      side: "p1",
      condition: "sticky-web",
      on: true,
    },
    {
      phrase: "相手の足下にねばねばネットが広がった",
      side: "p2",
      condition: "sticky-web",
      on: true,
    },
    {
      phrase: "味方の足下のねばねばネットが消え去った",
      side: "p1",
      condition: "sticky-web",
      on: false,
    },
    {
      phrase: "相手の足下のねばねばネットが消え去った",
      side: "p2",
      condition: "sticky-web",
      on: false,
    },
    // Wide Guard & Quick Guard
    {
      phrase: "味方の周りをワイドガードが守っている",
      side: "p1",
      condition: "wide-guard",
      on: true,
    },
    {
      phrase: "相手の周りをワイドガードが守っている",
      side: "p2",
      condition: "wide-guard",
      on: true,
    },
    {
      phrase: "味方の周りをファストガードが守っている",
      side: "p1",
      condition: "quick-guard",
      on: true,
    },
    {
      phrase: "相手の周りをファストガードが守っている",
      side: "p2",
      condition: "quick-guard",
      on: true,
    },
  ],
  moveOutcomePhrases: [
    { phrase: "には当たらなかった", outcome: "missed", targetSpecific: true },
    { phrase: "にはうまく決まらなかった", outcome: "failed", targetSpecific: true },
    { phrase: "にはうまくきまらなかった", outcome: "failed", targetSpecific: true },
    { phrase: "しかしうまく決まらなかった", outcome: "failed", targetSpecific: false },
    { phrase: "しかし何も起こらなかった", outcome: "failed", targetSpecific: false },
    { phrase: "身代わりをだすには体力が足りなかった", outcome: "failed", targetSpecific: false },
    { phrase: "身代わりはすでにでていた", outcome: "failed", targetSpecific: true },
    { phrase: "には効果がないようだ", outcome: "immune", targetSpecific: true },
  ],
  itemEffectPhrases: [
    {
      phrase: "ステータスを元に戻した",
      item: "white-herb",
      consumed: true,
      action: "reset-stats",
    },
    {
      phrase: "でもちこたえた",
      item: "focus-sash",
      consumed: true,
      action: "endure",
    },
    {
      phrase: "だっしゅつボタンで戻っていく",
      item: "eject-button",
      consumed: true,
      action: "switch-self",
    },
    {
      phrase: "レッドカードを",
      mustInclude: "にたたきつけた",
      item: "red-card",
      consumed: true,
      action: "switch-target",
    },
    {
      phrase: "ふうせんで浮いている",
      item: "air-balloon",
      consumed: false,
      action: "float-balloon",
    },
    {
      phrase: "ふうせんが割れた",
      item: "air-balloon",
      consumed: true,
      action: "pop-balloon",
    },
    {
      phrase: "へのダメージを",
      mustInclude: "が弱めた",
      consumed: true,
    },
    {
      phrase: "のPPを回復した",
      item: "leppa-berry",
      consumed: true,
    },
    {
      phrase: "をはたき落とした",
      consumed: true,
      targetPosition: "last",
    },
    {
      phrase: "を溶かした",
      consumed: true,
      targetPosition: "last",
    },
    {
      phrase: "を奪って食べた",
      consumed: true,
    },
    {
      phrase: "を奪い取った",
      consumed: true,
      targetPosition: "last",
    },
    {
      phrase: "を投げつけた",
      consumed: true,
    },
    {
      phrase: "を手に入れた",
      consumed: false,
    },
    {
      phrase: "を収穫した",
      consumed: false,
    },
    {
      phrase: "を拾ってきた",
      consumed: false,
    },
  ],
  healPhrases: [
    { phrase: "眠って元気になった", effect: "rest", alsoStatus: "slp" },
    { phrase: "水のリングで体力を回復", effect: "aqua-ring" },
    { phrase: "根から養分を吸い取った", effect: "ingrain" },
    { phrase: "ねがいごとがかなった", effect: "wish" },
    { phrase: "いやしのねがいが", effect: "healing-wish" },
    { phrase: "がたてたお茶を", effect: "hospitality" },
    { phrase: "体力が回復した", effect: "grassy-terrain" },
  ],
  cantPhrases: [
    { phrase: "ひるんで技がだせない", reason: "flinch" },
    { phrase: "集中が途切れて技がだせない", reason: "focus-punch" },
    { phrase: "体がしびれて動けない", reason: "par" },
    { phrase: "ぐうぐう眠っている", reason: "slp" },
    { phrase: "凍ってしまって動けない", reason: "frz" },
    { phrase: "メロメロで技がだせなかった", reason: "infatuation" },
    { phrase: "わけもわからず自分を攻撃した", reason: "confusion" },
    { phrase: "挑発されて", mustInclude: "をだせない", reason: "taunt" },
    { phrase: "いちゃもんをつけられたので続けて同じ技がだせない", reason: "torment" },
    { phrase: "ふういんで", mustInclude: "をだせない", reason: "imprison" },
    { phrase: "かなしばりで", mustInclude: "をだせない", reason: "disable" },
    { phrase: "攻撃の反動で動けない", reason: "recharge" },
    { phrase: "かいふくふうじで", mustInclude: "をだせない", reason: "heal-block" },
    { phrase: "じゅうりょくが強くて", mustInclude: "がだせない", reason: "gravity" },
    { phrase: "じごくづきの効果で技が出せない", reason: "throat-chop" },
    { phrase: "きのみを食べていないので技がだせない", reason: "belch" },
    { phrase: "サイコフィールドに守られている", reason: "psychic-terrain" },
    { phrase: "を使えない", reason: "cannot-use" },
  ],
  critPhrases: ["急所に当たった"],
  effectivenessPhrases: [
    { phrase: "効果はちょうバツグンだ", eff: 1 },
    { phrase: "効果はバツグンだ", eff: 1 },
    { phrase: "効果はいまひとつだ", eff: -1 },
    { phrase: "効果はかなりいまひとつだ", eff: -1 },
    { phrase: "には効果がないようだ", eff: 0 },
  ],
  residualDamagePhrases: [
    { phrase: "砂あらしが", mustInclude: "を襲う", effect: "sandstorm" },
    { phrase: "やけどのダメージを受けた", effect: "burn" },
    { phrase: "毒のダメージを受けた", effect: "poison" },
    { phrase: "命が少し削られた", effect: "life-orb" },
    { phrase: "反動によるダメージを受けた", effect: "recoil" },
    { phrase: "勢いあまって", mustInclude: "地面にぶつかった", effect: "crash" },
    { phrase: "やどりぎが", mustInclude: "体力を奪う", effect: "leech-seed" },
    { phrase: "のろわれている", effect: "curse" },
    { phrase: "まきびしのダメージを受けた", effect: "spikes" },
    { phrase: "にとがった岩が食いこんだ", effect: "stealth-rock" },
    { phrase: "のダメージを受けている", effect: "bind" },
  ],
  statusPhrases: [
    { phrase: "眠気を誘った", status: "yawn", isVolatile: true },
    { phrase: "眠ってしまった", status: "slp" },
    { phrase: "まひして技がでにくくなった", status: "par" },
    { phrase: "やけどを負った", status: "brn" },
    { phrase: "猛毒をあびた", status: "tox" },
    { phrase: "毒をあびた", status: "psn" },
    { phrase: "に毒をあびせた", status: "psn" },
    { phrase: "凍りついた", status: "frz" },
    // Volatile statuses
    { phrase: "つかれ果てて混乱した", status: "confusion", isVolatile: true },
    { phrase: "混乱した", status: "confusion", isVolatile: true },
    { phrase: "メロメロになった", status: "infatuation", isVolatile: true },
    { phrase: "アンコールを受けた", status: "encore", isVolatile: true },
    { phrase: "挑発に乗ってしまった", status: "taunt", isVolatile: true },
    { phrase: "いちゃもんをつけられた", status: "torment", isVolatile: true },
    { phrase: "を封じこめた", status: "disable", isVolatile: true },
    { phrase: "相手の技を封印した", status: "imprison", isVolatile: true },
    { phrase: "回復動作を封じられた", status: "heal-block", isVolatile: true },
    { phrase: "身代わりが現れた", status: "substitute", isVolatile: true },
    { phrase: "しっぽを切ってみがわりにした", status: "substitute", isVolatile: true },
    { phrase: "に種を植えつけた", status: "leech-seed", isVolatile: true },
    {
      phrase: "自分の体力を削って",
      mustInclude: "にのろいをかけた",
      status: "curse",
      isVolatile: true,
      targetPosition: "last",
    },
    { phrase: "しおづけになった", status: "salt-cure", isVolatile: true },
    { phrase: "あめまみれになった", status: "syrup-bomb", isVolatile: true },
    { phrase: "水のリングをまとった", status: "aqua-ring", isVolatile: true },
    { phrase: "は根をはった", status: "ingrain", isVolatile: true },
    { phrase: "電磁力で浮かびあがった", status: "magnet-rise", isVolatile: true },
    { phrase: "張り切っている", status: "focus-energy", isVolatile: true },
    { phrase: "相手を道連れにしようとしている", status: "destiny-bond", isVolatile: true },
    { phrase: "充電を始めた", status: "charge", isVolatile: true },
    { phrase: "電気を吸収した", status: "charge", isVolatile: true },
    { phrase: "騒ぎだした", status: "uproar", isVolatile: true },
    { phrase: "特性が効かなくなった", status: "gastro-acid", isVolatile: true },
    { phrase: "注目の的になった", status: "follow-me", isVolatile: true },
    { phrase: "撃ち落とされて地面に落ちた", status: "smack-down", isVolatile: true },
    {
      phrase: "じゅうりょくの影響で空中にいられなくなった",
      status: "smack-down",
      isVolatile: true,
    },
    { phrase: "渦の中に閉じこめられた", status: "bound", isVolatile: true },
    { phrase: "炎の渦に閉じこめられた", status: "bound", isVolatile: true },
    { phrase: "砂じごくに捕らわれた", status: "bound", isVolatile: true },
    { phrase: "トラバサミに捕らわれた", status: "bound", isVolatile: true },
    { phrase: "にまとわりつかれた", status: "bound", isVolatile: true },
    { phrase: "に締めつけられた", status: "bound", isVolatile: true },
    { phrase: "に巻きつかれた", status: "bound", isVolatile: true },
    { phrase: "たこがためで逃げられなくなった", status: "octolock", isVolatile: true },
    {
      phrase: "はいすいのじんで逃げることができなくなった",
      status: "no-retreat",
      isVolatile: true,
    },
    { phrase: "はもう逃げられない", status: "cant-escape", isVolatile: true },
  ],
  curePhrases: [
    { phrase: "目を覚ました", status: "slp" },
    { phrase: "しびれがとれた", status: "par" },
    { phrase: "まひが治った", status: "par" },
    { phrase: "やけどが治った", status: "brn" },
    { phrase: "毒はきれいさっぱりなくなった", status: "psn" },
    { phrase: "毒が治った", status: "psn" },
    { phrase: "こおりが溶けた", status: "frz" },
    { phrase: "こおり状態が治った", status: "frz" },
    { phrase: "状態が元に戻った", status: "all" },
    // Volatile status cures
    { phrase: "ねむけが覚めた", status: "yawn", isVolatile: true },
    { phrase: "混乱が解けた", status: "confusion", isVolatile: true },
    { phrase: "混乱が治った", status: "confusion", isVolatile: true },
    { phrase: "メロメロ状態が治った", status: "infatuation", isVolatile: true },
    { phrase: "アンコール状態が解けた", status: "encore", isVolatile: true },
    { phrase: "挑発の効果が解けた", status: "taunt", isVolatile: true },
    { phrase: "いちゃもんの効果が切れた", status: "torment", isVolatile: true },
    { phrase: "かなしばりが解けた", status: "disable", isVolatile: true },
    { phrase: "かいふくふうじの効果が切れた", status: "heal-block", isVolatile: true },
    { phrase: "身代わりは消えてしまった", status: "substitute", isVolatile: true },
    { phrase: "電磁力がなくなった", status: "magnet-rise", isVolatile: true },
    { phrase: "おとなしくなった", status: "uproar", isVolatile: true },
    { phrase: "から解放された", status: "bound", isVolatile: true },
  ],
  perishCountRegex: /^(?:相手の\s*)?(.+?)の\s*滅びのカウントが\s*(\d+)に\s*なった[!！.]?$/u,
  perishStartPhrases: ["ほろびのうたを聴いたポケモンは3ターン後に滅びてしまう"],
  forfeitPhrases: ["降参が選ばれました"],
  statCapPhrases: [
    "もう上がらない",
    "もう下がらない",
    "能力は下がらない",
    "攻撃は下がらない",
    "防御は下がらない",
    "命中率は下がらない",
  ],
  statResetPhrases: ["ステータスを元に戻した", "能力変化が元に戻った"],
  statResetDefs: [
    { phrase: "ステータスを元に戻した", scope: "single", isItem: true },
    { phrase: "能力変化が元に戻った", scope: "single" },
    { phrase: "全てのステータスが元に戻った", scope: "all" },
    { phrase: "能力変化がひっくりかえった", scope: "invert" },
  ],
  allySwitchPhrases: ["場所を入れ替えた"],
  courtChangePhrases: ["おたがいの場の効果を入れ替えた"],
  tidyUpPhrases: ["かたづけおわり"],
  bellyDrumPhrases: ["体力を削ってパワー全開"],
  angerPointPhrases: ["攻撃が最大まで上がった"],
  opposingPrefixes: ["相手の"],
};

export const ENGLISH_LOG_PATTERNS: BattleLogPatternSet =
  compileMessagePatternSet(ENGLISH_MESSAGE_TEMPLATES);

export const JAPANESE_LOG_PATTERNS: BattleLogPatternSet = compileMessagePatternSet(
  JAPANESE_MESSAGE_TEMPLATES,
);

export const DEFAULT_LOG_PATTERN_SETS: readonly BattleLogPatternSet[] = [
  ENGLISH_LOG_PATTERNS,
  JAPANESE_LOG_PATTERNS,
];
