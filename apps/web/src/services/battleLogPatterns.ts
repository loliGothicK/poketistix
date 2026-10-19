import { approxFind, normalizeOcrToken } from "./ocrText";

export type FieldEffect =
  | { readonly kind: "weather"; readonly value: string }
  | { readonly kind: "terrain"; readonly value: string }
  | { readonly kind: "trick-room"; readonly on: boolean };

export type StatType = "atk" | "def" | "spa" | "spd" | "spe" | "accuracy" | "evasion";

export interface FieldPhraseDef {
  readonly phrase: string;
  readonly effect: FieldEffect;
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
}

export interface CantPhraseDef {
  readonly phrase: string;
  readonly reason: string;
}

export interface EffectivenessPhraseDef {
  readonly phrase: string;
  readonly eff: 1 | -1 | 0;
}

export interface ResidualDamagePhraseDef {
  readonly phrase: string;
  readonly effect: string;
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
  readonly readyToHelpPhrase?: string;
  readonly megaReactionPhrase?: string;
  readonly megaEvolvedPhrase?: string;
  readonly megaEvolved?: readonly string[];
  readonly fainted?: readonly string[];
  readonly wideGuard?: readonly string[];
  readonly protectItself?: readonly string[];
  readonly protectGeneral?: readonly string[];
  readonly statWords: readonly StatWordDef[];
  readonly statChanges: readonly StatChangeDef[];
  readonly fieldPhrases: readonly FieldPhraseDef[];
  readonly healPhrases: readonly HealPhraseDef[];
  readonly cantPhrases?: readonly CantPhraseDef[];
  readonly critPhrases?: readonly string[];
  readonly effectivenessPhrases?: readonly EffectivenessPhraseDef[];
  readonly residualDamagePhrases?: readonly ResidualDamagePhraseDef[];
}

export interface BattleLogPatternSet {
  readonly lang: string;
  readonly fieldPhrases: readonly FieldPhraseDef[];
  readonly statWords: readonly StatWordDef[];
  readonly statChanges: readonly StatChangeDef[];
  readonly healPhrases: readonly HealPhraseDef[];
  readonly cantPhrases: readonly CantPhraseDef[];
  readonly critPhrases: readonly string[];
  readonly effectivenessPhrases: readonly EffectivenessPhraseDef[];
  readonly residualDamagePhrases: readonly ResidualDamagePhraseDef[];
  readonly faintedPhrases: readonly string[];
  readonly protectPhrases: {
    readonly wideGuard: readonly string[];
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

  return {
    lang: templates.lang,
    fieldPhrases: templates.fieldPhrases,
    statWords: templates.statWords,
    statChanges: templates.statChanges,
    healPhrases: templates.healPhrases,
    cantPhrases: templates.cantPhrases ?? [],
    critPhrases: templates.critPhrases ?? [],
    effectivenessPhrases: templates.effectivenessPhrases ?? [],
    residualDamagePhrases: templates.residualDamagePhrases ?? [],
    faintedPhrases: (templates.fainted ?? []).map((s) => normalizeOcrToken(s)),
    protectPhrases: {
      wideGuard: (templates.wideGuard ?? []).map((s) => normalizeOcrToken(s)),
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
          const isOpposing = /opposing/i.test(rx.source);
          return {
            actorPart: m.groups.mon.trim(),
            movePart: m.groups.move.trim(),
            isOpposing,
          };
        }
      }
      return null;
    },
    matchReadyToHelp: (_rawText, textKey) => {
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
      const m = /^(.*?)\s*(?:'s|is\s+reacting)/i.exec(rawText);
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
      const rx = /^(?:The\s+opposing\s+)?(.+?)['’]s\s+perish\s+count\s+fell\s+to\s+(\d+)[!.]?$/i;
      const m = rx.exec(rawText.trim());
      if (!m || !m[1] || !m[2]) return null;
      const isOpposing = /^The\s+opposing\s+/i.test(rawText.trim());
      const count = parseInt(m[2], 10);
      return { mon: m[1].trim(), count, isOpposing };
    },
    matchPerishStart: (_rawText: string, textKey: string) => {
      return (
        approxFind(textKey, "allpokemonthathearthesong").score >= 0.75 ||
        approxFind(textKey, "willfaintinthreeturns").score >= 0.75 ||
        approxFind(textKey, "willfaintin3turns").score >= 0.75
      );
    },
    matchForfeit: (_rawText: string, textKey: string) => {
      return (
        approxFind(textKey, "thebattlehasendedduetoaforfeit").score >= 0.75 ||
        approxFind(textKey, "endedduetoaforfeit").score >= 0.75 ||
        approxFind(textKey, "duetoaforfeit").score >= 0.8
      );
    },
  };
}

// ---------------------------------------------------------------------------
// 言語テンプレート定義データ (Data-driven template definitions)
// ---------------------------------------------------------------------------

export const ENGLISH_MESSAGE_TEMPLATES: BattleMessageTemplates = {
  lang: "en",
  withdraw: [
    "{trainer} withdrew {mon}!",
    "{mon}, come back!",
    "{mon}; come back!",
    "{mon} come back!",
    "{mon} went back to {trainer}!",
  ],
  sentOutTwo: [
    "{trainer} sent out {mon1} and {mon2}!",
    "The opposing {trainer} sent out {mon1} and {mon2}!",
  ],
  sentOutOne: ["{trainer} sent out {mon}!", "The opposing {trainer} sent out {mon}!"],
  goTwo: [
    "Go! {mon1} and {mon2}!",
    "Gol! {mon1} and {mon2}!",
    "Gol {mon1} and {mon2}!",
    "Ga! {mon1} and {mon2}!",
    "Gal {mon1} and {mon2}!",
  ],
  goOne: ["Go! {mon}!", "Gol! {mon}!", "Gol {mon}!", "Ga! {mon}!", "Gal {mon}!"],
  moveUsed: ["The opposing {mon} used {move}!", "{mon} used {move}!"],
  readyToHelpPhrase: "readytohelp",
  megaReactionPhrase: "isreactingto",
  megaEvolvedPhrase: "megaevolved",
  megaEvolved: [
    "{mon} has Mega Evolved!",
    "The opposing {mon} has Mega Evolved!",
    "{mon} evolved!",
  ],
  fainted: ["fainted"],
  wideGuard: ["wideguard", "wide"],
  protectItself: ["protecteditself"],
  protectGeneral: ["protecteditself", "protectedfrom"],
  statWords: [
    { words: ["attack"], stat: "atk" },
    { words: ["defense"], stat: "def" },
    { words: ["spatk", "specialattack"], stat: "spa" },
    { words: ["spdef", "specialdefense"], stat: "spd" },
    { words: ["speed"], stat: "spe" },
    { words: ["accuracy"], stat: "accuracy" },
    { words: ["evasiveness"], stat: "evasion" },
  ],
  statChanges: [
    { suffix: "fell", delta: -1 },
    { suffix: "harshlyfell", delta: -2 },
    { suffix: "severelyfell", delta: -3 },
    { suffix: "rose", delta: 1 },
    { suffix: "sharplyrose", delta: 2 },
    { suffix: "rosedrastically", delta: 3 },
  ],
  fieldPhrases: [
    { phrase: "twisteddimensionsreturnedtonormal", effect: { kind: "trick-room", on: false } },
    { phrase: "twisteddimensions", effect: { kind: "trick-room", on: true } },
    { phrase: "startedtorain", effect: { kind: "weather", value: "Rain" } },
    { phrase: "rainstopped", effect: { kind: "weather", value: "None" } },
    { phrase: "sunlightturnedharsh", effect: { kind: "weather", value: "HarshSunlight" } },
    { phrase: "sunlightfaded", effect: { kind: "weather", value: "None" } },
    { phrase: "sandstormkickedup", effect: { kind: "weather", value: "Sandstorm" } },
    { phrase: "sandstormsubsided", effect: { kind: "weather", value: "None" } },
    { phrase: "startedtosnow", effect: { kind: "weather", value: "Snow" } },
    { phrase: "snowstopped", effect: { kind: "weather", value: "None" } },
    { phrase: "grassgrewtocover", effect: { kind: "terrain", value: "Grassy" } },
    { phrase: "grassdisappeared", effect: { kind: "terrain", value: "None" } },
    { phrase: "electriccurrentranacross", effect: { kind: "terrain", value: "Electric" } },
    { phrase: "electricitydisappeared", effect: { kind: "terrain", value: "None" } },
    { phrase: "mistswirledaround", effect: { kind: "terrain", value: "Misty" } },
    { phrase: "mistdisappeared", effect: { kind: "terrain", value: "None" } },
    { phrase: "battlefieldgotweird", effect: { kind: "terrain", value: "Psychic" } },
    { phrase: "weirdnessdisappeared", effect: { kind: "terrain", value: "None" } },
  ],
  healPhrases: [
    { phrase: "haditshprestored", effect: "grassy-terrain" },
    { phrase: "restoredalittlehp" },
    { phrase: "restoreditshp" },
    { phrase: "ishealedbythegrassyterrain", effect: "grassy-terrain" },
    { phrase: "healedbythegrassyterrain", effect: "grassy-terrain" },
    { phrase: "grassyterrainhealed", effect: "grassy-terrain" },
  ],
  cantPhrases: [
    { phrase: "flinchedandcouldntmove", reason: "flinch" },
    { phrase: "flinched", reason: "flinch" },
    { phrase: "isparalyzedsoitwasunabletomove", reason: "par" },
    { phrase: "paralyzedandcantmove", reason: "par" },
    { phrase: "isfastasleep", reason: "slp" },
    { phrase: "isfrozensolid", reason: "frz" },
  ],
  critPhrases: ["acriticalhit", "criticalhit"],
  effectivenessPhrases: [
    { phrase: "itssupereffectiveon", eff: 1 },
    { phrase: "itssupereffective", eff: 1 },
    { phrase: "itsnotveryeffectiveon", eff: -1 },
    { phrase: "itsnotveryeffective", eff: -1 },
    { phrase: "itdoesntaffect", eff: 0 },
  ],
  residualDamagePhrases: [
    { phrase: "isbuffetedbythesandstorm", effect: "sandstorm" },
    { phrase: "buffetedbythesandstorm", effect: "sandstorm" },
    { phrase: "lostsomeofitshp", effect: "life-orb" },
    { phrase: "ishurtbyitsburn", effect: "burn" },
    { phrase: "ishurtbypoison", effect: "poison" },
    { phrase: "isdamagedbytherecoil", effect: "recoil" },
  ],
};

export const ENGLISH_LOG_PATTERNS: BattleLogPatternSet =
  compileMessagePatternSet(ENGLISH_MESSAGE_TEMPLATES);

export const DEFAULT_LOG_PATTERN_SETS: readonly BattleLogPatternSet[] = [ENGLISH_LOG_PATTERNS];
