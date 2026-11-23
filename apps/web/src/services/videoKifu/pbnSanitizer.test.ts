import { describe, expect, it } from "vitest";
import { isLeft, isRight } from "fp-ts/lib/Either";
import { BattleLogParser, type LogEvent, type TurnRecord } from "@/services/battleLogParser";
import { ENGLISH_LOG_PATTERNS, JAPANESE_LOG_PATTERNS } from "@/services/battleLogPatterns";
import { normalizeOcrToken } from "@/services/ocrText";
import { detectResultScreenOutcome } from "./frameSampling";
import { sanitizeAndValidateBattleLog, validateNoSelfAttack } from "./pbnSanitizer";

function makeSlot(slug: string, teamIdx: number | null) {
  return {
    slug,
    teamIdx,
    hp: "100%",
    fainted: false,
    status: null,
    volatileStatus: {},
    boosts: {},
  };
}

function makeTurn(turnNumber: number, events: LogEvent[]): TurnRecord {
  return {
    turnNumber,
    timestampMs: turnNumber * 10000,
    fieldEffects: [],
    stateSnapshot: {
      p1a: makeSlot("gengar", 0),
      p1b: makeSlot("incineroar", 1),
      p2a: makeSlot("hatterene", null),
      p2b: makeSlot("indeedee-f", null),
      ownHpByTeamIdx: {},
      oppHpBySlug: {},
      ownMegaSlugByTeamIdx: {},
      faintedOwnIndices: [],
      faintedOppSlugs: [],
      observedOppSlugs: ["hatterene", "indeedee-f"],
    },
    actions: [null, null],
    mega: { p1a: false, p1b: false },
    activeAtStart: { p1a: true, p1b: true },
    events,
  };
}

function makeEvent(verb: string, args: string[], t: number, extra?: Partial<LogEvent>): LogEvent {
  return {
    verb,
    args,
    t,
    confidence: 1,
    review: false,
    ...extra,
  };
}

describe("validateNoSelfAttack", () => {
  it("flags genuine direct self-attack damage immediately following a single-target move", () => {
    const turn = makeTurn(1, [
      makeEvent("move", ["p2b", "psychic"], 1000),
      makeEvent("damage", ["p2b", "100% -> 50%"], 2000),
    ]);

    const result = validateNoSelfAttack([turn]);
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.left[0]?.message).toContain("[SelfAttackDetected]");
    }
  });

  it("does not flag end-of-turn damage after a single-target move blocked by Protect", () => {
    const turn = makeTurn(5, [
      makeEvent("move", ["p2b", "psychic"], 400000, { protectedSlots: ["p1a"] }),
      makeEvent("heal", ["p2a", "60% -> 66%"], 406000, { bracket: "grassy-terrain" }),
      makeEvent("perish", ["p2a", "1 -> 0"], 411000),
      makeEvent("faint", ["p2a"], 415000),
      makeEvent("damage", ["p2b", "100% -> 0%"], 421000),
    ]);

    const result = sanitizeAndValidateBattleLog([turn], []);
    expect(isRight(result)).toBe(true);
  });

  it("does not flag damage after non-attacking status moves resolved via move metadata", () => {
    const turn = makeTurn(2, [
      makeEvent("move", ["p2b", "follow-me"], 20000),
      makeEvent("damage", ["p2b", "100% -> 40%"], 22000),
    ]);

    const result = validateNoSelfAttack([turn]);
    expect(isRight(result)).toBe(true);
  });

  it("does not flag damage after contact/item backlash reactions such as Rocky Helmet or Life Orb", () => {
    const turn = makeTurn(3, [
      makeEvent("move", ["p1b", "close-combat"], 30000),
      makeEvent("item", ["p2a", "rocky-helmet"], 31000),
      makeEvent("damage", ["p1b", "100/100 -> 84/100"], 32000),
    ]);

    const result = validateNoSelfAttack([turn]);
    expect(isRight(result)).toBe(true);
  });
});

describe("battleLogPatterns matchPerishCount", () => {
  it("parses English perish count when OCR reads 0 as O", () => {
    const res = ENGLISH_LOG_PATTERNS.matchPerishCount(
      "The opposing Indeedee’s perish count fell to O!",
    );
    expect(res).toEqual({ mon: "Indeedee", count: 0, isOpposing: true });
  });

  it("parses English perish count when OCR reads 1 as I or l", () => {
    expect(
      ENGLISH_LOG_PATTERNS.matchPerishCount("The opposing Hatterene's perish count fell to l!"),
    ).toEqual({ mon: "Hatterene", count: 1, isOpposing: true });
    expect(ENGLISH_LOG_PATTERNS.matchPerishCount("Gengar's perish count fell to I!")).toEqual({
      mon: "Gengar",
      count: 1,
      isOpposing: false,
    });
  });

  it("parses Japanese perish count with full-width digits or O", () => {
    expect(
      JAPANESE_LOG_PATTERNS.matchPerishCount("相手の イエッサンの 滅びのカウントが Oに なった！"),
    ).toEqual({ mon: "イエッサン", count: 0, isOpposing: true });
    expect(
      JAPANESE_LOG_PATTERNS.matchPerishCount("ゲンガーの 滅びのカウントが ０に なった！"),
    ).toEqual({ mon: "ゲンガー", count: 0, isOpposing: false });
  });
});

describe("BattleLogParser weather/terrain countdown on faint replacement", () => {
  it("starts weather/terrain at 5/5 on next turn when set by faint replacement, vs 4/5 when set mid-turn", () => {
    const parser = new BattleLogParser({
      myTeam: [
        { identifier: "gengar", slug: "gengar" },
        { identifier: "incineroar", slug: "incineroar" },
        { identifier: "rillaboom", slug: "rillaboom" },
        { identifier: "hippowdon", slug: "hippowdon" },
      ],
      dictionaries: {
        species: [
          { slug: "gengar", alias: "Gengar" },
          { slug: "incineroar", alias: "Incineroar" },
          { slug: "rillaboom", alias: "Rillaboom" },
          { slug: "hippowdon", alias: "Hippowdon" },
          { slug: "whimsicott", alias: "Whimsicott" },
          { slug: "torkoal", alias: "Torkoal" },
        ],
        moves: [],
        abilities: [
          { slug: "grassy-surge", alias: "Grassy Surge" },
          { slug: "sand-stream", alias: "Sand Stream" },
        ],
        items: [],
      },
      p2Roster: ["whimsicott", "torkoal"],
      p1MaxHp: () => 200,
      p1ItemSlug: () => null,
      p1AbilitySlug: (idx) => (idx === 2 ? "grassy-surge" : idx === 3 ? "sand-stream" : null),
      patternSets: [ENGLISH_LOG_PATTERNS],
    });

    parser.feedMessage("Opponent sent out Whimsicott and Torkoal!", 10_000);
    parser.feedMessage("Go! Gengar and Incineroar!", 12_000);

    // Turn 1: mid-turn switch-in of Rillaboom sets Grassy Terrain -> Turn 2 should be Grassy 4/5
    // Then Gengar faints and Hippowdon comes in on faint replacement -> Turn 2 should be Sandstorm 5/5
    parser.beginTurn(20_000);
    parser.feedMessage("Incineroar, come back!", 22_000);
    parser.feedMessage("Go! Rillaboom!", 24_000);
    parser.feedBanner("Rillaboom's Grassy Surge", "p1", 25_000);
    parser.feedMessage("Grass grew to cover the battlefield!", 26_000);

    parser.feedMessage("Gengar fainted!", 35_000);
    parser.feedMessage("Go! Hippowdon!", 40_000);
    parser.feedBanner("Hippowdon's Sand Stream", "p1", 41_000);
    parser.feedMessage("A sandstorm kicked up!", 42_000);

    parser.beginTurn(50_000);
    const turn2 = parser.getTurns()[1]!;
    expect(turn2.fieldEffects).toEqual(["Sandstorm 5/5", "Grassy 4/5"]);
  });

  it("formats perish count as single number (<count>) and wraps faint on 0", () => {
    const parser = new BattleLogParser({
      myTeam: [
        { identifier: "gengar", slug: "gengar" },
        { identifier: "incineroar", slug: "incineroar" },
      ],
      dictionaries: {
        species: [
          { slug: "gengar", alias: "Gengar" },
          { slug: "incineroar", alias: "Incineroar" },
          { slug: "whimsicott", alias: "Whimsicott" },
          { slug: "torkoal", alias: "Torkoal" },
        ],
        moves: [],
        abilities: [],
        items: [],
      },
      p2Roster: ["whimsicott", "torkoal"],
      p1MaxHp: () => 200,
      p1ItemSlug: () => null,
      patternSets: [ENGLISH_LOG_PATTERNS],
    });

    parser.feedMessage("Opponent sent out Whimsicott and Torkoal!", 10_000);
    parser.feedMessage("Go! Gengar and Incineroar!", 12_000);

    parser.beginTurn(20_000);
    parser.feedMessage("Gengar's perish count fell to 3!", 25_000);
    parser.feedMessage("The opposing Torkoal's perish count fell to 3!", 27_000);

    parser.beginTurn(40_000);
    parser.feedMessage("Gengar's perish count fell to 2!", 45_000);
    parser.feedMessage("The opposing Torkoal's perish count fell to 2!", 47_000);

    const t1Perish = parser.getTurns()[0]!.events.filter((e) => e.verb === "perish");
    expect(t1Perish.map((e) => e.args)).toEqual([
      ["p1a", "3"],
      ["p2a", "3"],
    ]);

    const t2Perish = parser.getTurns()[1]!.events.filter((e) => e.verb === "perish");
    expect(t2Perish.map((e) => e.args)).toEqual([
      ["p1a", "2"],
      ["p2a", "2"],
    ]);

    const renderedDefault = parser.render();
    expect(renderedDefault[renderedDefault.length - 1]).toBe("  # the battle has ended");

    // Count 0 wraps faint inside perish block
    parser.feedMessage("Gengar's perish count fell to 0!", 47_500);
    parser.feedMessage("Gengar fainted!", 47_800);
    expect(parser.render().join("\n")).toContain("  perish p1a 0 {\n    faint p1a\n  }");

    // All pokemon fainted ("You defeated!" / "You lost!")
    parser.feedMessage("You defeated!", 48_000);
    expect(parser.render().at(-1)).toBe("  # the battle has ended due to all pokemon fainting");

    // Total match time ran out
    parser.feedMessage("Time has run out!\nThe battle is over!", 48_500);
    expect(parser.render().at(-1)).toBe("  # the battle has ended due to time running out");

    // Forfeit battle ends with forfeit comment only (no duplicate generic battle-end comment)
    parser.feedMessage("The battle has ended due to a forfeit.", 49_000);
    const renderedForfeit = parser.render();
    expect(renderedForfeit.filter((l) => l.includes("# the battle has ended"))).toEqual([
      "  # the battle has ended due to a forfeit",
    ]);
  });

  it("distinguishes opposing player timeout vs own timeout vs total timeout in battle end comments", () => {
    const makeParser = () => {
      const parser = new BattleLogParser({
        myTeam: [
          { identifier: "gengar", slug: "gengar" },
          { identifier: "incineroar", slug: "incineroar" },
        ],
        dictionaries: {
          species: [
            { slug: "gengar", alias: "Gengar" },
            { slug: "incineroar", alias: "Incineroar" },
            { slug: "whimsicott", alias: "Whimsicott" },
            { slug: "torkoal", alias: "Torkoal" },
          ],
          moves: [],
          abilities: [],
          items: [],
        },
        p2Roster: ["whimsicott", "torkoal"],
        p1MaxHp: () => 200,
        p1ItemSlug: () => null,
        patternSets: [ENGLISH_LOG_PATTERNS],
      });
      parser.feedMessage("Opponent sent out Whimsicott and Torkoal!", 10_000);
      parser.feedMessage("Go! Gengar and Incineroar!", 12_000);
      parser.beginTurn(20_000);
      return parser;
    };

    const pOpp = makeParser();
    pOpp.feedMessage("The opposing player’s time has run out!", 30_000);
    expect(pOpp.render().at(-1)).toBe(
      "  # the battle has ended due to the opposing player's time running out",
    );

    const pOwn = makeParser();
    pOwn.feedMessage("Your time has run out!", 30_000);
    expect(pOwn.render().at(-1)).toBe("  # the battle has ended due to your time running out");

    const pTotal = makeParser();
    pTotal.feedMessage("Time has run out!\nThe battle is over!", 30_000);
    expect(pTotal.render().at(-1)).toBe("  # the battle has ended due to time running out");

    const pLoss = makeParser();
    pLoss.feedMessage("You lost!", 30_000);
    expect(pLoss.render().at(-1)).toBe("  # the battle has ended due to all pokemon fainting");
  });

  it("annotates destiny-bond faint with [destiny-bond] and suppresses intermediate HP-drop noise (JA & EN)", () => {
    const parserJa = new BattleLogParser({
      myTeam: [
        { identifier: "gengar", slug: "gengar" },
        { identifier: "incineroar", slug: "incineroar" },
      ],
      dictionaries: {
        species: [
          { slug: "gengar", alias: "ゲンガー" },
          { slug: "incineroar", alias: "ガオガエン" },
          { slug: "trevenant", alias: "オーロット" },
          { slug: "torkoal", alias: "コータス" },
        ],
        moves: [
          { slug: "shadow-ball", alias: "シャドーボール" },
          { slug: "destiny-bond", alias: "みちづれ" },
        ],
        abilities: [],
        items: [],
      },
      p2Roster: ["trevenant", "torkoal"],
      p1MaxHp: (idx) => (idx === 0 ? 165 : 202),
      p1ItemSlug: () => null,
      patternSets: [JAPANESE_LOG_PATTERNS],
    });
    parserJa.feedMessage("相手は コータスと オーロットを くりだした！", 10_000);
    parserJa.feedMessage("ゆけっ！ ゲンガー！ ガオガエン！", 12_000);
    parserJa.beginTurn(20_000);
    // Setup message must NOT trigger destiny-bond faint; it sets +destiny-bond volatile status
    parserJa.feedMessage("相手の オーロットの みちづれ！", 24_000);
    parserJa.feedMessage("相手の オーロットは 相手を 道連れに しようとしている！", 25_000);
    parserJa.feedMessage("ゲンガーの シャドーボール！", 30_000);
    parserJa.feedDamage("p2a", "100%", "0%", "100%", 31_000);
    parserJa.feedMessage("相手の オーロットは たおれた！", 31_500);
    // Trigger message followed by HP bar drop animation and faint
    parserJa.feedMessage("相手の オーロットは 相手を 道連れに した！", 33_000);
    parserJa.feedDamage("p1a", "165/165", "16/165", "149", 33_300);
    parserJa.feedDamage("p1a", "16/165", "0/165", "16", 33_600);
    parserJa.feedMessage("ゲンガーは たおれた！", 34_000);

    expect(
      JAPANESE_LOG_PATTERNS.matchDestinyBondTrigger(
        "相手の オーロットは 相手を 道連れに しようとしている！",
        normalizeOcrToken("相手の オーロットは 相手を 道連れに しようとしている！"),
      ),
    ).toBe(false);
    expect(
      JAPANESE_LOG_PATTERNS.matchDestinyBondTrigger(
        "相手の オーロットは 相手を 道連れに した！",
        normalizeOcrToken("相手の オーロットは 相手を 道連れに した！"),
      ),
    ).toBe(true);
    expect(
      ENGLISH_LOG_PATTERNS.matchDestinyBondTrigger(
        "The opposing Trevenant is hoping to take its attacker down with it!",
        normalizeOcrToken("The opposing Trevenant is hoping to take its attacker down with it!"),
      ),
    ).toBe(false);
    expect(
      ENGLISH_LOG_PATTERNS.matchDestinyBondTrigger(
        "The opposing Trevenant took its attacker down with it!",
        normalizeOcrToken("The opposing Trevenant took its attacker down with it!"),
      ),
    ).toBe(true);

    const renderedJa = parserJa.render().join("\n");
    expect(renderedJa).toContain("faint p1a [destiny-bond]");
    expect(renderedJa).not.toContain("damage p1a 165/165 -> 16/165");
    expect(renderedJa).not.toContain("damage p1a 16/165 -> 0/165");

    // English variant
    const parserEn = new BattleLogParser({
      myTeam: [
        { identifier: "gengar", slug: "gengar" },
        { identifier: "incineroar", slug: "incineroar" },
      ],
      dictionaries: {
        species: [
          { slug: "gengar", alias: "Gengar" },
          { slug: "incineroar", alias: "Incineroar" },
          { slug: "trevenant", alias: "Trevenant" },
          { slug: "torkoal", alias: "Torkoal" },
        ],
        moves: [
          { slug: "shadow-ball", alias: "Shadow Ball" },
          { slug: "destiny-bond", alias: "Destiny Bond" },
        ],
        abilities: [],
        items: [],
      },
      p2Roster: ["trevenant", "torkoal"],
      p1MaxHp: (idx) => (idx === 0 ? 165 : 202),
      p1ItemSlug: () => null,
      patternSets: [ENGLISH_LOG_PATTERNS],
    });
    parserEn.feedMessage("Opponent sent out Torkoal and Trevenant!", 10_000);
    parserEn.feedMessage("Go! Gengar and Incineroar!", 12_000);
    parserEn.beginTurn(20_000);
    parserEn.feedMessage("The opposing Trevenant used Destiny Bond!", 24_000);
    parserEn.feedMessage(
      "The opposing Trevenant is hoping to take its attacker down with it!",
      25_000,
    );
    parserEn.feedMessage("Gengar used Shadow Ball!", 30_000);
    parserEn.feedDamage("p2a", "100%", "0%", "100%", 31_000);
    parserEn.feedMessage("The opposing Trevenant fainted!", 31_500);
    parserEn.feedMessage("The opposing Trevenant took its attacker down with it!", 33_000);
    parserEn.feedMessage("Gengar fainted!", 34_000);

    const renderedEn = parserEn.render().join("\n");
    expect(renderedEn).toContain("faint p1a [destiny-bond]");
  });

  it("detectResultScreenOutcome identifies WIN and LOSS split-screen results independently of language", () => {
    const w = 160;
    const h = 90;
    const fillRect = (
      buf: Uint8Array,
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      r: number,
      g: number,
      b: number,
    ) => {
      for (let y = Math.round(y0 * h); y < Math.round(y1 * h); y++) {
        for (let x = Math.round(x0 * w); x < Math.round(x1 * w); x++) {
          const i = (y * w + x) * 4;
          buf[i] = r;
          buf[i + 1] = g;
          buf[i + 2] = b;
          buf[i + 3] = 255;
        }
      }
    };

    const blank = new Uint8Array(w * h * 4);
    expect(detectResultScreenOutcome(blank, w, h)).toBeNull();

    // Left WIN (P1 won)
    const winBuf = new Uint8Array(w * h * 4);
    fillRect(winBuf, 0.16, 0.38, 0.86, 0.95, 40, 60, 200); // P1 blue plate
    fillRect(winBuf, 0.62, 0.84, 0.86, 0.95, 200, 30, 100); // P2 pink plate
    fillRect(winBuf, 0.14, 0.36, 0.56, 0.72, 220, 230, 60); // Left WIN yellow-green
    fillRect(winBuf, 0.16, 0.34, 0.74, 0.82, 200, 20, 40); // Left red ribbon
    expect(detectResultScreenOutcome(winBuf, w, h)).toBe("WIN");

    // Right WIN (P1 lost)
    const lossBuf = new Uint8Array(w * h * 4);
    fillRect(lossBuf, 0.16, 0.38, 0.86, 0.95, 40, 60, 200);
    fillRect(lossBuf, 0.62, 0.84, 0.86, 0.95, 200, 30, 100);
    fillRect(lossBuf, 0.64, 0.86, 0.56, 0.72, 220, 230, 60);
    fillRect(lossBuf, 0.66, 0.84, 0.74, 0.82, 200, 20, 40);
    expect(detectResultScreenOutcome(lossBuf, w, h)).toBe("LOSS");
  });
});
