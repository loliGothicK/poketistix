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
}

export interface BattleLogPatternSet {
  readonly lang: string;
  readonly fieldPhrases: readonly FieldPhraseDef[];
  readonly statWords: readonly StatWordDef[];
  readonly statChanges: readonly StatChangeDef[];
  readonly healPhrases: readonly HealPhraseDef[];
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
  ) => { actorPart: string; movePart: string } | null;
  readonly matchReadyToHelp: (
    rawText: string,
    textKey: string,
  ) => { actorKey: string; targetKey: string } | null;
  readonly matchMegaReaction: (rawText: string, textKey: string) => { leftPart: string } | null;
  readonly matchMegaEvolved: (
    rawText: string,
    textKey: string,
  ) => { headKey: string; speciesPart: string } | null;
}

/** テンプレート文字列を名前抽出用キャプチャグループ付き正規表現にコンパイルする */
function compileTemplateRegex(template: string): RegExp {
  const clean = template.trim().replace(/[!！.。]+$/, "");
  const parts = clean.split(
    /(\{mon1\}|\{mon2\}|\{mon\}|\{trainer\}|\{move\}|\{mega\}|\{item\}|\{ring\})/,
  );

  let pattern = "";
  for (const part of parts) {
    if (part === "{mon1}") pattern += "(?<mon1>.+?)";
    else if (part === "{mon2}") pattern += "(?<mon2>.+?)";
    else if (part === "{mon}") pattern += "(?<mon>.+?)";
    else if (part === "{trainer}") pattern += "(?<trainer>.+?)";
    else if (part === "{move}") pattern += "(?<move>.+?)";
    else if (part === "{mega}") pattern += "(?<mega>.+?)";
    else if (part === "{item}") pattern += "(?<item>.+?)";
    else if (part === "{ring}") pattern += "(?<ring>.+?)";
    else {
      const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pattern += escaped.replace(/\s+/g, "\\s*");
    }
  }

  return new RegExp(`^.*?${pattern}[!！.\\s。]*$`, "i");
}

const cleanName = (s: string): string =>
  s
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
          return { actorPart: m.groups.mon.trim(), movePart: m.groups.move.trim() };
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
      // 英語・日本語・欧州各言語でのメガ反応プレースホルダ
      const m =
        /^(.*?)\s*(?:'s|\s+の|\s+が|is\s+reacting|\s+reacciona|\s+réagit|\s+reagiert)/i.exec(
          rawText,
        );
      return m?.[1] ? { leftPart: m[1] } : null;
    },
    matchMegaEvolved: (rawText, textKey) => {
      if (!megaEvolvedToken) return null;
      const found = approxFind(textKey, megaEvolvedToken);
      if (found.score < 0.75) return null;
      for (const rx of megaEvolvedRegexes) {
        const m = rx.exec(rawText);
        if (m?.groups?.mega) {
          return {
            headKey: textKey.slice(0, Math.max(0, found.end - megaEvolvedToken.length)),
            speciesPart: m.groups.mega.trim(),
          };
        }
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// 言語テンプレート定義データ (Data-driven template definitions)
// ---------------------------------------------------------------------------

export const ENGLISH_MESSAGE_TEMPLATES: BattleMessageTemplates = {
  lang: "en",
  withdraw: ["{trainer} withdrew {mon}!", "{mon}, come back!", "{mon} went back to {trainer}!"],
  sentOutTwo: [
    "{trainer} sent out {mon1} and {mon2}!",
    "The opposing {trainer} sent out {mon1} and {mon2}!",
  ],
  sentOutOne: ["{trainer} sent out {mon}!", "The opposing {trainer} sent out {mon}!"],
  goTwo: ["Go! {mon1} and {mon2}!", "Gol {mon1} and {mon2}!"],
  goOne: ["Go! {mon}!", "Gol {mon}!"],
  moveUsed: ["{mon} used {move}!"],
  readyToHelpPhrase: "readytohelp",
  megaReactionPhrase: "isreactingto",
  megaEvolvedPhrase: "megaevolved",
  megaEvolved: ["{mon} has Mega Evolved into {mega}!", "{mon} evolved into {mega}!"],
  fainted: ["fainted"],
  wideGuard: ["wideguard", "wide"],
  protectItself: ["protecteditself"],
  protectGeneral: ["protected"],
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
};

export const JAPANESE_MESSAGE_TEMPLATES: BattleMessageTemplates = {
  lang: "ja",
  withdraw: [
    "{trainer}は {mon}を ひっこめた！",
    "{trainer}は {mon}を 引っ込めた！",
    "{trainer}は {mon}を 手元に戻した！",
    "もどれ！ {mon}！",
    "戻れ！ {mon}！",
  ],
  sentOutTwo: [
    "相手は {mon1}と {mon2}を 繰り出した！",
    "相手は {mon1}と {mon2}を くりだした！",
    "お相手は {mon1}と {mon2}を 繰り出した！",
    "お相手は {mon1}と {mon2}を くりだした！",
    "{trainer}は {mon1}と {mon2}を 繰り出した！",
    "{trainer}は {mon1}と {mon2}を くりだした！",
  ],
  sentOutOne: [
    "相手は {mon}を 繰り出した！",
    "相手は {mon}を くりだした！",
    "お相手は {mon}を 繰り出した！",
    "お相手は {mon}を くりだした！",
    "{trainer}は {mon}を 繰り出した！",
    "{trainer}は {mon}を くりだした！",
  ],
  goTwo: [
    "ゆけっ！ {mon1}と {mon2}！",
    "行けっ！ {mon1}と {mon2}！",
    "いけっ！ {mon1}と {mon2}！",
    "お願い！ {mon1}と {mon2}！",
  ],
  goOne: ["ゆけっ！ {mon}！", "行けっ！ {mon}！", "いけっ！ {mon}！", "お願い！ {mon}！"],
  moveUsed: [
    "{mon}は {move}を 使った！",
    "{mon}は {move}を つかった！",
    "{mon}の {move}を 使った！",
    "{mon}の {move}を つかった！",
    "{mon}の {move}の攻撃！",
    "{mon}の {move}！",
  ],
  readyToHelpPhrase: "手助けをしようとしている",
  megaReactionPhrase: "反応している",
  megaEvolvedPhrase: "メガシンカした",
  megaEvolved: [
    "{mon}は {mega}に メガシンカした！",
    "{mon}は {mega}にメガシンカした！",
    "{mon}が {mega}に メガシンカした！",
  ],
  fainted: ["倒れた", "たおれた"],
  wideGuard: ["ワイドガードが守った", "ワイドガードが防いだ", "ワイドガード"],
  protectItself: ["攻撃から身を守った", "守りきった", "まもりきった"],
  protectGeneral: ["身を守った", "守った", "まもった"],
  statWords: [
    { words: [normalizeOcrToken("こうげき"), normalizeOcrToken("攻撃")], stat: "atk" },
    { words: [normalizeOcrToken("ぼうぎょ"), normalizeOcrToken("防御")], stat: "def" },
    { words: [normalizeOcrToken("とくこう"), normalizeOcrToken("特攻")], stat: "spa" },
    { words: [normalizeOcrToken("とくぼう"), normalizeOcrToken("特防")], stat: "spd" },
    { words: [normalizeOcrToken("すばやさ"), normalizeOcrToken("素早さ")], stat: "spe" },
    { words: [normalizeOcrToken("めいちゅう"), normalizeOcrToken("命中")], stat: "accuracy" },
    { words: [normalizeOcrToken("かいひ"), normalizeOcrToken("回避")], stat: "evasion" },
  ],
  statChanges: [
    { suffix: normalizeOcrToken("さがった"), delta: -1 },
    { suffix: normalizeOcrToken("下がった"), delta: -1 },
    { suffix: normalizeOcrToken("がくっとさがった"), delta: -2 },
    { suffix: normalizeOcrToken("がくっと下がった"), delta: -2 },
    { suffix: normalizeOcrToken("がくーんとさがった"), delta: -3 },
    { suffix: normalizeOcrToken("がくーんと下がった"), delta: -3 },
    { suffix: normalizeOcrToken("あがった"), delta: 1 },
    { suffix: normalizeOcrToken("上がった"), delta: 1 },
    { suffix: normalizeOcrToken("ぐーんとあがった"), delta: 2 },
    { suffix: normalizeOcrToken("ぐーんと上がった"), delta: 2 },
    { suffix: normalizeOcrToken("ぐぐーんとあがった"), delta: 3 },
    { suffix: normalizeOcrToken("ぐぐーんと上がった"), delta: 3 },
  ],
  fieldPhrases: [
    { phrase: normalizeOcrToken("時空が元に戻った"), effect: { kind: "trick-room", on: false } },
    {
      phrase: normalizeOcrToken("じくうがもとにもどった"),
      effect: { kind: "trick-room", on: false },
    },
    { phrase: normalizeOcrToken("歪んだ時空"), effect: { kind: "trick-room", on: true } },
    { phrase: normalizeOcrToken("時空を歪めた"), effect: { kind: "trick-room", on: true } },
    { phrase: normalizeOcrToken("じくうをゆがめた"), effect: { kind: "trick-room", on: true } },
    { phrase: normalizeOcrToken("雨が降り始めた"), effect: { kind: "weather", value: "Rain" } },
    { phrase: normalizeOcrToken("あめがふりはじめた"), effect: { kind: "weather", value: "Rain" } },
    { phrase: normalizeOcrToken("雨が上がった"), effect: { kind: "weather", value: "None" } },
    { phrase: normalizeOcrToken("あめがあがった"), effect: { kind: "weather", value: "None" } },
    {
      phrase: normalizeOcrToken("日差しが強くなった"),
      effect: { kind: "weather", value: "HarshSunlight" },
    },
    {
      phrase: normalizeOcrToken("ひざしがつよくなった"),
      effect: { kind: "weather", value: "HarshSunlight" },
    },
    { phrase: normalizeOcrToken("日差しが元に戻った"), effect: { kind: "weather", value: "None" } },
    {
      phrase: normalizeOcrToken("ひざしがもとにもどった"),
      effect: { kind: "weather", value: "None" },
    },
    {
      phrase: normalizeOcrToken("砂あらしが吹き荒れ"),
      effect: { kind: "weather", value: "Sandstorm" },
    },
    {
      phrase: normalizeOcrToken("すなあらしがふきあれ"),
      effect: { kind: "weather", value: "Sandstorm" },
    },
    {
      phrase: normalizeOcrToken("砂あらしが始まった"),
      effect: { kind: "weather", value: "Sandstorm" },
    },
    {
      phrase: normalizeOcrToken("砂あらしがおさまった"),
      effect: { kind: "weather", value: "None" },
    },
    {
      phrase: normalizeOcrToken("すなあらしがおさまった"),
      effect: { kind: "weather", value: "None" },
    },
    { phrase: normalizeOcrToken("雪が降り始めた"), effect: { kind: "weather", value: "Snow" } },
    { phrase: normalizeOcrToken("ゆきがふりはじめた"), effect: { kind: "weather", value: "Snow" } },
    { phrase: normalizeOcrToken("雪がやんだ"), effect: { kind: "weather", value: "None" } },
    { phrase: normalizeOcrToken("ゆきがやんだ"), effect: { kind: "weather", value: "None" } },
    { phrase: normalizeOcrToken("草が生い茂った"), effect: { kind: "terrain", value: "Grassy" } },
    {
      phrase: normalizeOcrToken("くさがおいしげった"),
      effect: { kind: "terrain", value: "Grassy" },
    },
    { phrase: normalizeOcrToken("グラスフィールド"), effect: { kind: "terrain", value: "Grassy" } },
    { phrase: normalizeOcrToken("草の生い茂りが消え"), effect: { kind: "terrain", value: "None" } },
    {
      phrase: normalizeOcrToken("足元に電流が走った"),
      effect: { kind: "terrain", value: "Electric" },
    },
    {
      phrase: normalizeOcrToken("でんりゅうがはしった"),
      effect: { kind: "terrain", value: "Electric" },
    },
    {
      phrase: normalizeOcrToken("エレキフィールド"),
      effect: { kind: "terrain", value: "Electric" },
    },
    { phrase: normalizeOcrToken("電流が消え去った"), effect: { kind: "terrain", value: "None" } },
    { phrase: normalizeOcrToken("霧が立ち込めた"), effect: { kind: "terrain", value: "Misty" } },
    { phrase: normalizeOcrToken("きりがたちこめた"), effect: { kind: "terrain", value: "Misty" } },
    { phrase: normalizeOcrToken("ミストフィールド"), effect: { kind: "terrain", value: "Misty" } },
    { phrase: normalizeOcrToken("霧が消え去った"), effect: { kind: "terrain", value: "None" } },
    {
      phrase: normalizeOcrToken("足元がおかしくなった"),
      effect: { kind: "terrain", value: "Psychic" },
    },
    {
      phrase: normalizeOcrToken("あしもとがおかしくなった"),
      effect: { kind: "terrain", value: "Psychic" },
    },
    {
      phrase: normalizeOcrToken("サイコフィールド"),
      effect: { kind: "terrain", value: "Psychic" },
    },
    { phrase: normalizeOcrToken("おかしな感覚が消え"), effect: { kind: "terrain", value: "None" } },
  ],
  healPhrases: [
    { phrase: normalizeOcrToken("グラスフィールドで回復した"), effect: "grassy-terrain" },
    { phrase: normalizeOcrToken("グラスフィールドでかいふくした"), effect: "grassy-terrain" },
    { phrase: normalizeOcrToken("グラスフィールドでhpを回復した"), effect: "grassy-terrain" },
    { phrase: normalizeOcrToken("グラスフィールドでhpが回復した"), effect: "grassy-terrain" },
    { phrase: normalizeOcrToken("hpを回復した") },
    { phrase: normalizeOcrToken("hpが回復した") },
    { phrase: normalizeOcrToken("少し回復した") },
    { phrase: normalizeOcrToken("すこしかいふくした") },
    { phrase: normalizeOcrToken("回復した") },
    { phrase: normalizeOcrToken("かいふくした") },
  ],
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
