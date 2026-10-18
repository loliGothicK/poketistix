import { describe, expect, it } from "vitest";
import type { TrainedPokemon } from "@/store/team/team";
import { BattleLogParser } from "./battleLogParser";
import {
  analysisSummaryToBattleRecordDraft,
  analyzeVideoFrameRgba,
  buildChampionsDictionaries,
  calcTrainedPokemonStatsLv50,
  classifyTypeHsv,
  formatChampionsSpread,
  fuzzyMatchEntity,
  DIGIT_4_TEMPLATE_12X10,
  matchDigitTemplate,
  parsePbnToAnalysisSummary,
  resolveSpeciesFromTypes,
  rgbToHsv,
  SELECTION_DIGIT_TEMPLATES_24X17,
  VideoKifuAnalyzer,
  type LocalizedEntityAlias,
} from "./videoKifuAnalyzer";

function makeSynthetic1080pCommandFrame(p2aHpPct: number, p2bHpPct: number): Uint8Array {
  const width = 1920;
  const height = 1080;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(80);

  const fillRect = (x0: number, y0: number, w: number, h: number, r: number, g: number, b: number) => {
    for (let y = y0; y < Math.min(height, y0 + h); y++) {
      for (let x = x0; x < Math.min(width, x0 + w); x++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      }
    }
  };

  // P1A & P1B blue headers
  fillRect(170, 932, 350, 24, 134, 116, 234);
  fillRect(566, 932, 350, 24, 134, 116, 234);
  // P2A & P2B magenta headers
  fillRect(1215, 48, 350, 20, 210, 52, 136);
  fillRect(1611, 48, 300, 20, 210, 52, 136);

  // Dark HP bar tracks (224px wide)
  fillRect(181, 1002, 224, 6, 20, 20, 20);
  fillRect(577, 1002, 224, 6, 20, 20, 20);
  fillRect(1225, 118, 224, 6, 20, 20, 20);
  fillRect(1621, 118, 224, 6, 20, 20, 20);

  // Fill P1A & P1B 100% green
  fillRect(181, 1002, 224, 6, 55, 225, 65);
  fillRect(577, 1002, 224, 6, 55, 225, 65);

  const p2aW = Math.round((224 * p2aHpPct) / 100);
  const [rA, gA, bA] = p2aHpPct > 50 ? [55, 225, 65] : p2aHpPct > 20 ? [225, 185, 40] : [215, 45, 45];
  fillRect(1225, 118, p2aW, 6, rA, gA, bA);

  const p2bW = Math.round((224 * p2bHpPct) / 100);
  fillRect(1621, 118, p2bW, 6, 55, 225, 65);

  // Command timer box: dark banner + white text strokes ("MOVE TIME 45")
  fillRect(1550, 295, 310, 60, 40, 50, 70);
  for (let x = 1590; x < 1810; x += 10) {
    fillRect(x, 310, 5, 25, 240, 240, 240);
  }

  return rgba;
}

describe("videoKifuAnalyzer", () => {
  it("detects CommandSelect phase and measures HP bar percentages and color zones accurately", () => {
    const frame = makeSynthetic1080pCommandFrame(33, 100);
    const analysis = analyzeVideoFrameRgba(frame, 1920, 1080, 130_000);

    expect(analysis.phase).toBe("CommandSelect");
    expect(analysis.hpBars[0].visible).toBe(true);
    expect(analysis.hpBars[0].percent).toBe(100);
    expect(analysis.hpBars[0].colorZone).toBe("Green");

    expect(analysis.hpBars[2].visible).toBe(true);
    expect(analysis.hpBars[2].percent).toBe(33);
    expect(analysis.hpBars[2].colorZone).toBe("Yellow");

    expect(analysis.hpBars[3].visible).toBe(true);
    expect(analysis.hpBars[3].percent).toBe(100);
  });

  it("accurately detects HUD and measures HP even when long names or mega evolution text occlude single-pixel sample points", () => {
    const frame = makeSynthetic1080pCommandFrame(88, 80);
    // Overwrite x=1300, y=56 (the single-pixel sample point) with white text pixels ("Mega Garchomp Z")
    for (let y = 48; y <= 64; y++) {
      for (let x = 1280; x <= 1320; x++) {
        const idx = (y * 1920 + x) * 4;
        frame[idx] = 250;
        frame[idx + 1] = 250;
        frame[idx + 2] = 250;
        frame[idx + 3] = 255;
      }
    }

    const analysis = analyzeVideoFrameRgba(frame, 1920, 1080, 169_000);
    expect(analysis.hpBars[2].visible).toBe(true);
    expect(analysis.hpBars[2].percent).toBe(88);
    expect(analysis.hpBars[3].visible).toBe(true);
    expect(analysis.hpBars[3].percent).toBe(80);
  });

  it("matches noisy OCR strings against English and Japanese Champions dictionaries", () => {
    const dict: readonly LocalizedEntityAlias[] = [
      { slug: "farigiraf", alias: "Farigiraf" },
      { slug: "farigiraf", alias: "リキキリン" },
      { slug: "incineroar", alias: "Incineroar" },
      { slug: "incineroar", alias: "ガオガエン" },
      { slug: "helping-hand", alias: "Helping Hand" },
      { slug: "helping-hand", alias: "てだすけ" },
    ];

    const m1 = fuzzyMatchEntity("Farigirat", dict);
    expect(m1?.slug).toBe("farigiraf");
    expect(m1?.confidence).toBeGreaterThanOrEqual(85);

    const m2 = fuzzyMatchEntity("ガオガェン", dict);
    expect(m2?.slug).toBe("incineroar");
    expect(m2?.confidence).toBeGreaterThanOrEqual(75);

    const m3 = fuzzyMatchEntity("Helping Hand!", dict);
    expect(m3?.slug).toBe("helping-hand");
    expect(m3?.confidence).toBe(100);
  });

  it("parses PBN text into VideoKifuAnalysisSummary and converts to BattleRecordDraft", () => {
    const samplePbn = `
[PBN "1.0"]
[Regulation "M-A"]
[Sheet "CTS"]
[Result "WIN"]
[Rating "1603.525"]

@p1 0 salamence @ salamencite | intimidate | Jolly A32 S32+ | 170,187,100,117,100,167 | tailwind, protect
@p1 1 incineroar @ sitrus-berry | intimidate | Careful H32 D32+ | 202,135,110,90,156,80 | fake-out, flare-blitz
@select 0, 1, 2, 3

@p2 0 farigiraf
@p2 1 garchomp
@p2 2 pelipper

@lead @t=112000ms
  switch p1a salamence 170/170
  switch p1b incineroar 202/202
  switch p2a farigiraf 100%
  switch p2b garchomp 100%
  ability p1a intimidate

@turn 1 @t=130000ms
  @cmd p1a: tailwind | p1b: fake-out -> p2b
  move p2a helping-hand @review
  damage p2a 33%
  switch p2b pelipper 100%
  ability p2b drizzle
`.trim();

    const summary = parsePbnToAnalysisSummary(samplePbn);
    expect(summary.result).toBe("win");
    expect(summary.detectedRating).toBe(1603.525);
    expect(summary.p1Selection).toEqual([0, 1, 2, 3]);
    expect(summary.opponentSlugs).toEqual(["farigiraf", "garchomp", "pelipper"]);
    expect(summary.opponentLeadSlugs).toEqual(["farigiraf", "garchomp"]);
    expect(summary.opponentBackSlugs).toEqual(["pelipper"]);
    expect(summary.revealedMovesByOpponent["farigiraf"]).toEqual(["helping-hand"]);
    expect(summary.revealedAbilityByOpponent["pelipper"]).toBe("drizzle");
    expect(summary.turnTimestamps[0]).toBe(112000);
    expect(summary.turnTimestamps[1]).toBe(130000);
    expect(summary.reviewEvents).toHaveLength(1);
    expect(summary.reviewEvents[0]?.lineText).toBe("move p2a helping-hand");
    expect(summary.reviewEvents[0]?.needsReview).toBe(true);
    expect(summary.reviewEvents[0]?.timestampMs).toBe(130000);

    const draft = analysisSummaryToBattleRecordDraft(summary, {
      teamId: "team-1",
      myTeam: [],
    });
    expect(draft.result).toBe("win");
    expect(draft.rating).toBe("1603.525");
    expect(draft.opponents).toHaveLength(3);
    expect(draft.opponents[0]?.selectionRole).toBe("lead");
    expect(draft.opponents[0]?.moves).toEqual(["helping-hand"]);
    expect(draft.opponents[2]?.selectionRole).toBe("back");
    expect(draft.opponents[2]?.abilitySlug).toBe("drizzle");
  });

  it("formats Champions nature and EV spread strings accurately without hardcoding Hardy", () => {
    const salamence: TrainedPokemon = {
      boxId: "box-1",
      identifier: "salamence",
      slug: "salamence",
      item: 1,
      ability: 1,
      gender: { fixed: false },
      nature: { plus: "spe", minus: "spa" },
      moves: [1, 2, null, null],
      evs: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
    };
    expect(formatChampionsSpread(salamence)).toBe("Jolly A32 S32+");

    const incineroar: TrainedPokemon = {
      boxId: "box-2",
      identifier: "incineroar",
      slug: "incineroar",
      item: 2,
      ability: 1,
      gender: { fixed: false },
      nature: { plus: "spd", minus: "spa" },
      moves: [1, 2, 3, 4],
      evs: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 },
    };
    expect(formatChampionsSpread(incineroar)).toBe("Careful H32 B2 D32+");

    const neutralMon: TrainedPokemon = {
      boxId: "box-3",
      identifier: "mew",
      slug: "mew",
      item: null,
      ability: 1,
      gender: { fixed: false },
      nature: { plus: null, minus: null },
      moves: [null, null, null, null],
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    };
    expect(formatChampionsSpread(neutralMon)).toBe("Serious");
  });

  it("calculates Lv50 Champions stats accurately using official calcHp and calcStatus (e.g. Rillaboom)", () => {
    // Rillaboom: status = [100, 125, 90, 60, 70, 85]
    // H32 A32+ D1 いじっぱり (Adamant: +atk, -spa)
    const rillaboomH32: TrainedPokemon = {
      boxId: "box-rilla-1",
      identifier: "rillaboom",
      slug: "rillaboom",
      item: 1,
      ability: 1,
      gender: { fixed: false },
      nature: { plus: "atk", minus: "spa" },
      moves: [1, 2, 3, 4],
      evs: { hp: 32, atk: 32, def: 0, spa: 0, spd: 1, spe: 0 },
    };
    const statsH32 = calcTrainedPokemonStatsLv50(rillaboomH32);
    // HP: 100 + 75 + 32 = 207 (NEVER 239 or 209)
    expect(statsH32[0]).toBe(207);
    // Atk: Math.floor((125 + 20 + 32) * 1.1) = Math.floor(194.7) = 194
    expect(statsH32[1]).toBe(194);
    // Def: 90 + 20 = 110
    expect(statsH32[2]).toBe(110);
    // SpA: Math.floor((60 + 20) * 0.9) = 72
    expect(statsH32[3]).toBe(72);
    // SpD: 70 + 20 + 1 = 91
    expect(statsH32[4]).toBe(91);
    // Spe: 85 + 20 = 105
    expect(statsH32[5]).toBe(105);

    // H0振り無補正
    const rillaboomH0: TrainedPokemon = {
      boxId: "box-rilla-2",
      identifier: "rillaboom",
      slug: "rillaboom",
      item: null,
      ability: 1,
      gender: { fixed: false },
      nature: { plus: null, minus: null },
      moves: [1, null, null, null],
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    };
    const statsH0 = calcTrainedPokemonStatsLv50(rillaboomH0);
    // HP: 100 + 75 = 175
    expect(statsH0[0]).toBe(175);
  });

  it("detects message box with faint white pixels (threshold >= 6)", () => {
    // 1080p frame with white text pixels inside the message box ROI (x=120..1520, y=785..865)
    const width = 1920;
    const height = 1080;
    const rgba = new Uint8Array(width * height * 4);
    rgba.fill(30);

    // messageBox is from1080p(120, 785, 1400, 80)
    // Fill a 40x10 block of white text pixels inside messageBox
    for (let y = 790; y < 800; y++) {
      for (let x = 200; x < 240; x++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = 200;
        rgba[idx + 1] = 200;
        rgba[idx + 2] = 200;
        rgba[idx + 3] = 255;
      }
    }

    const analysis = analyzeVideoFrameRgba(rgba, width, height, 148_000);
    expect(analysis.messageBoxVisible).toBe(true);
    expect(analysis.phase).toBe("BattleAnimation");
  });

  it("detects command timer (MOVE TIME 45) in top-right HUD and triggers CommandSelect phase", () => {
    const width = 1920;
    const height = 1080;
    const rgba = new Uint8Array(width * height * 4);
    rgba.fill(30);

    // Fill text strokes inside commandTimerBox (representing "MOVE TIME 45")
    for (let x = 1590; x < 1810; x += 10) {
      for (let y = 310; y < 335; y++) {
        for (let dx = 0; dx < 5; dx++) {
          const idx = (y * width + (x + dx)) * 4;
          rgba[idx] = 220;
          rgba[idx + 1] = 220;
          rgba[idx + 2] = 220;
          rgba[idx + 3] = 255;
        }
      }
    }

    const analysis = analyzeVideoFrameRgba(rgba, width, height, 120_000);
    expect(analysis.commandTimerVisible).toBe(true);
    expect(analysis.phase).toBe("CommandSelect");
  });

  it("accurately detects digit 4 (MOVE TIME 45) and distinguishes from countdown / other digits", () => {
    const width = 960;
    const height = 540;
    const rgba = new Uint8Array(width * height * 4);
    rgba.fill(30);

    // Box: 775, 148, 930, 178 (boxW=155, boxH=30)
    // Draw MOVE TIME text strokes (midline y=162)
    for (let x = 790; x < 870; x += 3) {
      const idx = (162 * width + x) * 4;
      rgba[idx] = 220;
      rgba[idx + 1] = 220;
      rgba[idx + 2] = 220;
    }
    // Draw dark border
    for (let x = 790; x < 900; x += 4) {
      for (let y = 148; y < 155; y += 2) {
        const idx = (y * width + x) * 4;
        rgba[idx] = 40;
        rgba[idx + 1] = 50;
        rgba[idx + 2] = 70;
      }
    }

    // Without digit 4 drawn, isMoveTime45 is false
    const without4 = analyzeVideoFrameRgba(rgba, width, height, 120_000);
    expect(without4.isMoveTime45).toBe(false);

    // Draw DIGIT_4_TEMPLATE_12X10 in the digit area
    // dx0 = 775 + round(155*0.74) = 890, dy0 = 148 + round(30*0.2) = 154
    for (let r = 0; r < DIGIT_4_TEMPLATE_12X10.length; r++) {
      const row = DIGIT_4_TEMPLATE_12X10[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c] === 1) {
          const cy = 154 + r;
          const cx = 890 + c;
          const idx = (cy * width + cx) * 4;
          rgba[idx] = 220;
          rgba[idx + 1] = 220;
          rgba[idx + 2] = 220;
        }
      }
    }

    const with4 = analyzeVideoFrameRgba(rgba, width, height, 120_000);
    expect(with4.commandTimerVisible).toBe(true);
    expect(with4.isMoveTime45).toBe(true);
  });

  it("converts RGB to HSV and accurately classifies Champions types invariant to shininess", () => {
    // Normal: low saturation
    const [nH, nS, nV] = rgbToHsv(150, 150, 150);
    expect(classifyTypeHsv(nH, nS, nV)).toBe("normal");

    // Grass: green hue
    const [gH, gS, gV] = rgbToHsv(80, 190, 60);
    expect(classifyTypeHsv(gH, gS, gV)).toBe("grass");

    // Water: blue hue (high saturation)
    const [wH, wS, wV] = rgbToHsv(40, 120, 240);
    expect(classifyTypeHsv(wH, wS, wV)).toBe("water");

    // Bug: lime/olive hue
    const [bH, bS, bV] = rgbToHsv(150, 180, 40);
    expect(classifyTypeHsv(bH, bS, bV)).toBe("bug");

    // Dragon: dark blue/purple hue
    const [dH, dS, dV] = rgbToHsv(50, 60, 200);
    expect(classifyTypeHsv(dH, dS, dV)).toBe("dragon");

    // Ground: brownish orange hue
    const [grH, grS, grV] = rgbToHsv(200, 140, 50);
    expect(classifyTypeHsv(grH, grS, grV)).toBe("ground");

    // Steel: metallic desaturated / light steel blue
    const [sH, sS, sV] = rgbToHsv(100, 120, 140);
    expect(classifyTypeHsv(sH, sS, sV)).toBe("steel");

    // Psychic: magenta/pink hue
    const [pH, pS, pV] = rgbToHsv(230, 60, 130);
    expect(classifyTypeHsv(pH, pS, pV)).toBe("psychic");
  });

  it("resolves exact opponent species from single or dual types invariant to shiny sprites", () => {
    expect(resolveSpeciesFromTypes(["bug", "water"])).toBe("golisopod");
    expect(resolveSpeciesFromTypes(["grass"])).toBe("rillaboom");
    expect(resolveSpeciesFromTypes(["normal", "psychic"])).toBe("farigiraf");
    expect(resolveSpeciesFromTypes(["water", "flying"])).toBe("pelipper");
    expect(resolveSpeciesFromTypes(["dragon", "ground"])).toBe("garchomp");
    expect(resolveSpeciesFromTypes(["steel", "dragon"])).toBe("archaludon");
  });

  it("matches selection digit templates (1..4) with high correlation on 37x37 patches", () => {
    // Generate synthetic 37x37 grayscale patch embedding template 1
    const patch1: number[] = Array.from({ length: 37 * 37 }, () => 250);
    const tmpl1 = SELECTION_DIGIT_TEMPLATES_24X17[1];
    for (let ty = 0; ty < 24; ty++) {
      for (let tx = 0; tx < 17; tx++) {
        patch1[(ty + 6) * 37 + (tx + 10)] = tmpl1[ty]?.[tx] ?? 250;
      }
    }

    const score1 = matchDigitTemplate(patch1, tmpl1);
    expect(score1).toBeGreaterThanOrEqual(0.95);

    const scoreOther = matchDigitTemplate(patch1, SELECTION_DIGIT_TEMPLATES_24X17[2]);
    expect(scoreOther).toBeLessThan(score1);
  });

  it("reconstructs battle kifu strictly from messages without duplicate switches, bogus heals, or missing Intimidate/Protect/Mega logs", () => {
    const dictionaries = buildChampionsDictionaries(
      (k) => k,
      (k) => k,
    );
    const p2Roster = ["golisopod", "rillaboom", "farigiraf", "pelipper", "garchomp", "archaludon"];
    const myTeam = [
      { identifier: "raichu", slug: "raichu" },
      { identifier: "incineroar", slug: "incineroar" },
      { identifier: "rillaboom", slug: "rillaboom" },
      { identifier: "basculegion-male", slug: "basculegion-male" },
      { identifier: "volcarona", slug: "volcarona" },
      { identifier: "salamence", slug: "salamence" },
    ];
    const hpByIdx: Record<number, number> = {
      0: 183,
      1: 234,
      2: 209,
      3: 197,
      4: 224,
      5: 172,
    };
    const itemByIdx: Record<number, string> = {
      1: "sitrus-berry",
      2: "miracle-seed",
      5: "salamencite",
    };

    const parser = new BattleLogParser({
      myTeam,
      dictionaries,
      p2Roster,
      p1MaxHp: (idx) => hpByIdx[idx] ?? 100,
      p1ItemSlug: (idx) => itemByIdx[idx] ?? null,
      p1AbilitySlug: (idx) => (idx === 5 || idx === 1 ? "intimidate" : null),
      p1Speed: (idx) => (idx === 5 ? 184 : 100),
    });

    // @lead: noisy multi-frame OCR for opponent and player lead send-outs + double Intimidate
    parser.feedMessage("Lunalotl sent out Farigiraf and Garchomp!", 106_000);
    parser.feedMessage("Lunalot! sent out Farigiraf and Garchomp!", 107_000);
    parser.feedMessage("Go! Salamence and Incineroar the Sodden!", 111_000);
    parser.feedMessage("Gol Salamence and Incineroar the Sodden!", 112_000);
    parser.feedBanner("Salamence’s\nIntimidate", "p1", 115_000);
    parser.feedMessage("The opposing Farigiraf and the opposing Garchomp's Attack fell!", 115_000);
    parser.feedMessage("The opposing Farigiraf and the opposing Garchomp's Attack fell!", 116_000);
    parser.feedBanner("Incineroar’s\nIntimidate", "p1", 117_000);
    parser.feedMessage("The opposing Farigiraf and the opposing Garchomp's Attack fell!", 117_000);

    // Turn 1: Mega Garchomp Z + Helping Hand + Protect (with protected itself on dragon pulse!) + Snarl
    parser.beginTurn(120_000);
    parser.feedMessage("The opposing Garchomp's Garchompite Z is reacting to Lunalotl's Omni Ring!", 138_000);
    parser.feedMessage("The opposing Garchomp has Mega Evolved into Mega Garchomp Z!", 146_000);
    parser.feedMessage("The opposing Garchomp has Mega Evolved into Mega Garchomp Z!", 147_000);
    parser.feedMessage("The opposing Farigiraf used Helping Hand!", 149_000);
    parser.feedMessage("The opposing Farigiraf is ready to help Garchomp!", 153_000);
    parser.feedMessage("Salamence used Protect!", 155_000);
    parser.feedMessage("The opposing Garchomp used Dragon Pulse!", 160_000);
    parser.feedMessage("Salamence protected itself!", 163_000);
    parser.feedMessage("Incineroar used Snarl!", 165_000);
    parser.feedDamage("p2a", "100%", "88%", "12%", 169_000);
    parser.feedDamage("p2b", "100%", "80%", "20%", 170_000);
    parser.feedMessage("The opposing Farigiraf and the opposing Garchomp's Sp. Atk fell!", 171_000);

    // Turn 2: switches, Grassy Surge (duplicate frames), Trick Room (move + twisted dimensions)
    parser.beginTurn(174_000);
    parser.feedMessage("Lunalotl sent out Archaludon!", 215_000);
    parser.feedMessage("Go! Rillaboom!", 222_000);
    parser.feedBanner("Rillaboom’s\nGrassy Surge", "p1", 226_000);
    parser.feedMessage("Grass grew to cover the battlefield!", 226_000);
    parser.feedMessage("Grass grew to cover the battlefield!", 227_000);
    parser.feedMessage("Incineroar used Snarl!", 228_000);
    parser.feedDamage("p2a", "100%", "92%", "8%", 230_000);
    parser.feedDamage("p2b", "80%", "62%", "18%", 231_000);
    parser.feedMessage("The opposing Farigiraf and the opposing Archaludon's Sp. Atk fell!", 233_000);
    parser.feedBanner("Archaludon’s\nStamina", "p2", 237_000);
    parser.feedMessage("The opposing Archaludon's Defense rose!", 237_000);
    parser.feedMessage("The opposing Farigiraf used Trick Room!", 241_000);
    parser.feedMessage("The opposing Farigiraf twisted the dimensions!", 245_000);

    // Turn 3: Player Mega Evolution (+mega in @cmd)
    parser.beginTurn(883_000);
    parser.feedMessage("Go! Salamence!", 883_000);
    parser.feedMessage("Salamence's Salamencite is reacting to Player's Omni Ring!", 894_000);
    parser.feedMessage("Salamence has Mega Evolved into Mega Salamence!", 904_000);
    parser.feedMessage("Salamence used Hyper Voice!", 911_000);

    const rendered = parser.render().join("\n");

    // 1. Lead switches are emitted once per slot, both Intimidates and Attack drops are recorded inside their switch blocks
    expect(rendered.match(/switch p1a salamence 172\/172/g)).toHaveLength(1);
    expect(rendered.match(/switch p1b incineroar 234\/234/g)).toHaveLength(1);
    expect(rendered).toContain(
      "switch p1a salamence 172/172 {\n    ability p1a intimidate {\n      p2a: atk -1\n      p2b: atk -1\n    }\n  }",
    );
    expect(rendered).toContain(
      "switch p1b incineroar 234/234 {\n    ability p1b intimidate {\n      p2a: atk -1\n      p2b: atk -1\n    }\n  }",
    );
    expect(rendered).not.toContain("intimidate @t=");
    expect(rendered).not.toContain("@conf");
    expect(rendered).toContain("@lead @t=106000ms");
    expect(rendered).toContain("@turn 1 @t=120000ms");

    // 2. Turn 1 has accurate @cmd, single Mega Garchomp Z, Helping Hand target, Protect annotation, and 0 bogus heals
    expect(rendered).toContain("@cmd p1a: protect | p1b: snarl");
    expect(rendered.match(/mega p2a garchomp-mega-z/g)).toHaveLength(1);
    expect(rendered).toContain("move p2b helping-hand -> p2a");
    expect(rendered).toContain("move p1a protect\n");
    expect(rendered).toContain("move p2a dragon-pulse -> p1a { protected }");
    expect(rendered).toContain("move p1b snarl {\n    p2a: 100% -> 88%, spa -1\n    p2b: 100% -> 80%, spa -1\n  }");
    expect(rendered).not.toContain("[from=");
    expect(rendered).not.toContain("heal ");

    // 3. Turn 2 deduplicates terrain grassy and records Trick Room dimension twist as field state, not a second move
    expect(rendered).toContain("@cmd p1a: switch rillaboom | p1b: snarl");
    expect(rendered).toContain("switch p1a rillaboom 209/209 {\n    ability p1a grassy-surge\n    terrain Grassy\n  }");
    expect(rendered).toContain(
      "move p1b snarl {\n    p2a: 100% -> 92%, spa -1 {\n      ability p2a stamina\n      boost p2a def +1\n    }\n    p2b: 80% -> 62%, spa -1\n  }",
    );
    expect(rendered.match(/terrain Grassy/g)).toHaveLength(1);
    expect(rendered.match(/move p2b trick-room/g)).toHaveLength(1);
    expect(rendered).toContain("move p2b trick-room {\n    field trick-room on\n  }");

    // 4. Turn 3 includes +mega on p1a command, "?" for re-switched Salamence HP, and active field effects
    expect(rendered).toContain("switch p1a salamence ?");
    expect(rendered).toContain("@cmd p1a: hyper-voice +mega | p1b: ?");
    expect(rendered).toContain("mega p1a salamence-mega");
    expect(rendered).toContain("@field Grassy 2/5 | Trick Room 2/5");
  });

  it("tracks field effects across turns with accurate turn counters and natural expiration", () => {
    const dictionaries = buildChampionsDictionaries(
      (k) => k,
      (k) => k,
    );
    const myTeam = [
      { identifier: "pelipper", slug: "pelipper" },
      { identifier: "rillaboom", slug: "rillaboom" },
    ];
    const itemByIdx: Record<number, string> = {
      0: "damp-rock",
      1: "miracle-seed",
    };

    const parser = new BattleLogParser({
      dictionaries,
      myTeam,
      p2Roster: ["archaludon", "garchomp"],
      p1MaxHp: () => 167,
      p1ItemSlug: (idx) => itemByIdx[idx] ?? null,
    });

    // Lead: Pelipper sets Rain (with Damp Rock -> 8 turns)
    parser.feedMessage("Go! Pelipper and Rillaboom!", 10_000);
    parser.feedBanner("Pelipper’s\nDrizzle", "p1", 12_000);
    parser.feedMessage("It started to rain!", 12_000);

    // Turn 1: Rain is 1/8
    parser.beginTurn(15_000);
    parser.feedMessage("Pelipper used Scald!", 20_000);

    // Turn 2: Rain is 2/8, Rillaboom sets Grassy Terrain (5 turns)
    parser.beginTurn(25_000);
    parser.feedBanner("Rillaboom’s\nGrassy Surge", "p1", 28_000);
    parser.feedMessage("Grass grew to cover the battlefield!", 28_000);
    parser.feedMessage("Rillaboom used Wood Hammer!", 30_000);

    // Turn 3: Rain is 3/8, Grassy is 2/5
    parser.beginTurn(35_000);
    parser.feedMessage("Pelipper used Protect!", 40_000);

    // Turn 4: Rain is 4/8, Grassy is 3/5
    parser.beginTurn(45_000);
    parser.feedMessage("Pelipper used Roost!", 50_000);

    // Turn 5: Rain is 5/8, Grassy is 4/5
    parser.beginTurn(55_000);
    parser.feedMessage("Pelipper used Scald!", 60_000);

    // Turn 6: Rain is 6/8, Grassy is 5/5
    parser.beginTurn(65_000);
    parser.feedMessage("Pelipper used Scald!", 70_000);

    // Turn 7: Grassy has naturally expired (5 turns over). Rain is 7/8.
    parser.beginTurn(75_000);
    parser.feedMessage("Pelipper used Scald!", 80_000);

    // Rain stopped early via message during turn 7
    parser.feedMessage("The rain stopped.", 82_000);

    // Turn 8: Rain is now gone
    parser.beginTurn(85_000);
    parser.feedMessage("Pelipper used Scald!", 90_000);

    const lines = parser.render();
    const rendered = lines.join("\n");

    expect(rendered).toContain("@turn 1");
    expect(rendered).toContain("@field Rain 1/8");

    expect(rendered).toContain("@turn 2");
    expect(rendered).toContain("@field Rain 2/8");

    expect(rendered).toContain("@turn 3");
    expect(rendered).toContain("@field Rain 3/8 | Grassy 2/5");

    expect(rendered).toContain("@turn 6");
    expect(rendered).toContain("@field Rain 6/8 | Grassy 5/5");

    expect(rendered).toContain("@turn 7");
    expect(rendered).toContain("@field Rain 7/8");
    expect(rendered).not.toContain("@field Rain 7/8 | Grassy");

    // Turn 8 should have no @field directive since both expired
    const turn8Block = rendered.slice(rendered.indexOf("@turn 8"));
    expect(turn8Block).not.toContain("@field");
  });

  it("handles consecutive ability banners followed by boost messages, attributing boosts to each ability distinctly", () => {
    const dictionaries = buildChampionsDictionaries(
      (k) => k,
      (k) => k,
    );
    const p2Roster = ["farigiraf", "garchomp"];
    const myTeam = [
      { identifier: "Salamence", slug: "salamence" },
      { identifier: "Incineroar", slug: "incineroar" },
    ];
    const parser = new BattleLogParser({
      myTeam,
      dictionaries,
      p2Roster,
      p1MaxHp: () => 200,
      p1ItemSlug: () => null,
      p1AbilitySlug: (idx) => (idx === 0 || idx === 1 ? "intimidate" : null),
      p1Speed: (idx) => (idx === 0 ? 180 : 100),
    });

    // Lead phase
    parser.feedMessage("Lunalotl sent out Farigiraf and Garchomp!", 100_000);
    parser.feedMessage("Go! Salamence and Incineroar!", 105_000);

    // Consecutive ability banners
    parser.feedBanner("Salamence’s\nIntimidate", "p1", 108_000);
    parser.feedBanner("Incineroar’s\nIntimidate", "p1", 109_000);

    // Attack drops in message box
    parser.feedMessage("The opposing Farigiraf and the opposing Garchomp's Attack fell!", 110_000);
    parser.feedMessage("The opposing Farigiraf and the opposing Garchomp's Attack fell!", 112_000);

    const rendered = parser.render().join("\n");

    // Both ability blocks must be present and distinct inside their switch blocks
    expect(rendered).toContain(
      "switch p1a salamence 200/200 {\n    ability p1a intimidate {\n      p2a: atk -1\n      p2b: atk -1\n    }\n  }",
    );
    expect(rendered).toContain(
      "switch p1b incineroar 200/200 {\n    ability p1b intimidate {\n      p2a: atk -1\n      p2b: atk -1\n    }\n  }",
    );

    // Crucially, atk -1 must NEVER be doubled up under a single target line
    expect(rendered).not.toContain("p2a: atk -1, atk -1");
    expect(rendered).not.toContain("p2b: atk -1, atk -1");
  });

  it("handles self-boosting attack like electro-shot with both self-boost and damage target accurately", () => {
    const dictionaries = buildChampionsDictionaries(
      (k) => k,
      (k) => k,
    );
    const p2Roster = ["archaludon", "farigiraf"];
    const myTeam = [
      { identifier: "Salamence", slug: "salamence" },
      { identifier: "Incineroar", slug: "incineroar" },
    ];
    const parser = new BattleLogParser({
      myTeam,
      dictionaries,
      p2Roster,
      p1MaxHp: () => 234,
      p1ItemSlug: () => null,
    });

    parser.feedMessage("Lunalotl sent out Archaludon and Farigiraf!", 100_000);
    parser.feedMessage("Go! Salamence and Incineroar!", 105_000);

    parser.beginTurn(110_000);
    parser.feedMessage("The opposing Archaludon used Electro Shot!", 112_000);
    parser.feedMessage("The opposing Archaludon's Sp. Atk rose!", 113_000);
    parser.feedDamage("p1b", "234/234", "126/234", "46%", 115_000);

    const rendered = parser.render().join("\n");
    expect(rendered).toContain("move p2b electro-shot {\n    boost p2b spa +1\n    p1b: 234/234 -> 126/234\n  }");
  });

  it("handles wide-guard blocking spread moves and renders { wide-guard } annotation", () => {
    const dictionaries = buildChampionsDictionaries(
      (k) => k,
      (k) => k,
    );
    const p2Roster = ["archaludon", "farigiraf"];
    const myTeam = [
      { identifier: "Salamence", slug: "salamence" },
      { identifier: "Incineroar", slug: "incineroar" },
    ];
    const parser = new BattleLogParser({
      myTeam,
      dictionaries,
      p2Roster,
      p1MaxHp: () => 234,
      p1ItemSlug: () => null,
    });

    parser.feedMessage("Lunalotl sent out Archaludon and Farigiraf!", 100_000);
    parser.feedMessage("Go! Salamence and Incineroar!", 105_000);

    parser.beginTurn(110_000);
    parser.feedMessage("The opposing Farigiraf used Wide Guard!", 111_000);
    parser.feedMessage("Incineroar used Snarl!", 113_000);
    parser.feedMessage("Wide Guard protected the opposing Farigiraf and Archaludon!", 114_000);

    const rendered = parser.render().join("\n");
    expect(rendered).toContain("move p1b snarl { wide-guard }");
  });

  it("handles heal events with accurate HP transitions and cause attribution", () => {
    const dictionaries = buildChampionsDictionaries(
      (k) => k,
      (k) => k,
    );
    const p2Roster = ["archaludon", "farigiraf"];
    const myTeam = [
      { identifier: "Salamence", slug: "salamence" },
      { identifier: "Incineroar", slug: "incineroar" },
    ];
    const parser = new BattleLogParser({
      myTeam,
      dictionaries,
      p2Roster,
      p1MaxHp: () => 234,
      p1ItemSlug: (idx) => (idx === 1 ? "sitrus-berry" : null),
    });

    parser.feedMessage("Lunalotl sent out Archaludon and Farigiraf!", 100_000);
    parser.feedMessage("Go! Salamence and Incineroar!", 105_000);

    parser.beginTurn(110_000);
    // 1. Incineroar takes damage down to 100/234
    parser.feedDamage("p1b", "234/234", "100/234", "57%", 112_000);
    // Incineroar eats Sitrus Berry (message first, then HP bar stabilization)
    parser.feedMessage("Incineroar restored its HP using its Sitrus Berry!", 113_000);
    parser.feedHeal("p1b", "100/234", "158/234", "25%", 113_500);

    // 2. Archaludon (p2b) heals with Leftovers (HP bar stabilization first, then message)
    parser.feedDamage("p2b", "100%", "70%", "30%", 114_000);
    parser.feedHeal("p2b", "70%", "76%", "6%", 115_500);
    parser.feedMessage("The opposing Archaludon restored a little HP using its Leftovers!", 116_000);

    // 3. Grassy terrain heal on Farigiraf (p2a) via feedHeal from HP bar stabilization directly
    parser.feedHeal("p2a", "80%", "86%", "6%", 118_000, { effect: "grassy-terrain" });

    const rendered = parser.render().join("\n");

    // Sitrus Berry heal on p1b
    expect(rendered).toContain("heal p1b 100/234 -> 158/234 [sitrus-berry]");

    // Leftovers heal on p2b
    expect(rendered).toContain("heal p2b 70% -> 76% [leftovers]");

    // Grassy terrain heal on p2a
    expect(rendered).toContain("heal p2a 80% -> 86% [grassy-terrain]");

    // Must never output bare "heal <slot>" without HP or effect
    expect(rendered).not.toMatch(/heal p1[ab]\s*$/m);
    expect(rendered).not.toMatch(/heal p2[ab]\s*$/m);
  });

  it("reconstructs battle kifu accurately from Japanese battle messages", () => {
    const dictionaries = buildChampionsDictionaries(
      (k) => k,
      (k) => {
        if (k === "pokemon.garchomp.name") return "ガブリアス";
        if (k === "pokemon.farigiraf.name") return "リキキリン";
        if (k === "pokemon.salamence.name") return "ボーマンダ";
        if (k === "pokemon.incineroar.name") return "ガオガエン";
        if (k === "moves.protect.name") return "まもる";
        if (k === "moves.snarl.name") return "バークアウト";
        if (k === "moves.dragon-pulse.name") return "りゅうのはどう";
        if (k === "abilities.intimidate.name") return "いかく";
        return k;
      },
    );

    const p2Roster = ["farigiraf", "garchomp"];
    const myTeam = [
      { identifier: "salamence", slug: "salamence" },
      { identifier: "incineroar", slug: "incineroar" },
    ];

    const parser = new BattleLogParser({
      myTeam,
      dictionaries,
      p2Roster,
      p1MaxHp: () => 200,
      p1ItemSlug: () => null,
    });

    // 繰り出し（相手・自分）
    parser.feedMessage("相手は ガブリアス と リキキリン を繰り出した！", 100_000);
    parser.feedMessage("ゆけっ！ ボーマンダ と ガオガエン！", 105_000);

    // 特性バナー & 日本語メッセージ
    parser.feedBanner("ボーマンダの\nいかく", "p1", 108_000);
    parser.feedMessage("相手の リキキリン と ガブリアス の 攻撃が下がった！", 109_000);

    // ターン 1
    parser.beginTurn(120_000);
    parser.feedMessage("ボーマンダは まもる を使った！", 125_000);
    parser.feedMessage("相手の ガブリアス は りゅうのはどう を使った！", 128_000);
    parser.feedMessage("ボーマンダは 攻撃から身を守った！", 130_000);
    parser.feedMessage("ガオガエンの バークアウト！", 133_000);
    parser.feedDamage("p2a", "100%", "85%", "15%", 135_000);
    parser.feedDamage("p2b", "100%", "80%", "20%", 136_000);
    parser.feedMessage("相手の リキキリン と ガブリアス の 特攻が下がった！", 138_000);

    const rendered = parser.render().join("\n");

    // 繰り出しが正しく反映されていること
    expect(rendered).toContain("switch p2a farigiraf 100%");
    expect(rendered).toContain("switch p2b garchomp 100%");
    expect(rendered).toContain("switch p1a salamence 200/200");
    expect(rendered).toContain("switch p1b incineroar 200/200");

    // 威嚇の A デバフが反映されていること
    expect(rendered).toContain("ability p1a intimidate");
    expect(rendered).toContain("p2a: atk -1");
    expect(rendered).toContain("p2b: atk -1");

    // まもる・身を守った判定
    expect(rendered).toContain("move p1a protect");
    expect(rendered).toContain("move p2b dragon-pulse -> p1a { protected }");

    // バークアウト
    expect(rendered).toContain("move p1b snarl");
    expect(rendered).toContain("p2a: 100% -> 85%, spa -1");
    expect(rendered).toContain("p2b: 100% -> 80%, spa -1");
  });

  it("processes real video Turn 2 recovery sequence through VideoKifuAnalyzer pipeline accurately", async () => {
    const dictionaries = buildChampionsDictionaries(
      (k) => {
        if (k === "pokemon.archaludon.name") return "Archaludon";
        if (k === "pokemon.farigiraf.name") return "Farigiraf";
        if (k === "items.leftovers.name") return "Leftovers";
        return k;
      },
      (k) => k,
    );

    const myTeam: TrainedPokemon[] = [
      {
        boxId: "box-1",
        identifier: "salamence",
        slug: "salamence",
        ability: 1,
        item: 1,
        gender: { fixed: false },
        nature: { plus: "spe", minus: "spa" },
        evs: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
        moves: [1, null, null, null],
      },
      {
        boxId: "box-2",
        identifier: "incineroar",
        slug: "incineroar",
        ability: 2,
        item: 2,
        gender: { fixed: false },
        nature: { plus: "def", minus: "spa" },
        evs: { hp: 32, atk: 0, def: 32, spa: 0, spd: 0, spe: 0 },
        moves: [2, null, null, null],
      },
    ];

    function make960x540Frame(
      p2aHp: number,
      p2bHp: number,
      opts?: { isMoveTime45?: boolean; hasBanner?: string; hasMessage?: string },
    ): Uint8Array {
      const width = 960;
      const height = 540;
      const rgba = new Uint8Array(width * height * 4);
      rgba.fill(30);

      const fill = (x0: number, y0: number, w: number, h: number, r: number, g: number, b: number) => {
        for (let y = y0; y < Math.min(height, y0 + h); y++) {
          for (let x = x0; x < Math.min(width, x0 + w); x++) {
            const idx = (y * width + x) * 4;
            rgba[idx] = r;
            rgba[idx + 1] = g;
            rgba[idx + 2] = b;
            rgba[idx + 3] = 255;
          }
        }
      };

      // P1A & P1B headers (blue)
      fill(85, 466, 175, 12, 134, 116, 234);
      fill(280, 466, 175, 12, 134, 116, 234);
      // P2A & P2B headers (magenta)
      fill(607, 24, 175, 10, 210, 52, 136);
      fill(805, 24, 150, 10, 210, 52, 136);

      // HP bar tracks (112px wide on 960x540)
      fill(90, 501, 112, 3, 20, 20, 20);
      fill(288, 501, 112, 3, 20, 20, 20);
      fill(613, 59, 112, 3, 20, 20, 20);
      fill(811, 59, 112, 3, 20, 20, 20);

      // P1 HP (100% green)
      fill(90, 501, 112, 3, 55, 225, 65);
      fill(288, 501, 112, 3, 55, 225, 65);

      // P2 HP bars
      const p2aW = Math.round((112 * p2aHp) / 100);
      const [rA, gA, bA] = p2aHp > 50 ? [55, 225, 65] : [225, 185, 40];
      fill(613, 59, p2aW, 3, rA, gA, bA);

      const p2bW = Math.round((112 * p2bHp) / 100);
      const [rB, gB, bB] = p2bHp > 50 ? [55, 225, 65] : [225, 185, 40];
      fill(811, 59, p2bW, 3, rB, gB, bB);

      // Move Time 45 (timer box: 775, 148, 155, 30)
      if (opts?.isMoveTime45) {
        // Dark box
        fill(775, 148, 155, 30, 40, 50, 70);
        // MOVE TIME text strokes (midline y=162)
        for (let x = 790; x < 870; x += 3) {
          const idx = (162 * width + x) * 4;
          rgba[idx] = 220;
          rgba[idx + 1] = 220;
          rgba[idx + 2] = 220;
        }
        // Digit 4
        const dx0 = 775 + Math.round(155 * 0.74);
        const dy0 = 148 + Math.round(30 * 0.2);
        for (let r = 0; r < DIGIT_4_TEMPLATE_12X10.length; r++) {
          const row = DIGIT_4_TEMPLATE_12X10[r];
          if (!row) continue;
          for (let c = 0; c < row.length; c++) {
            if (row[c] === 1) {
              const idx = ((dy0 + r) * width + (dx0 + c)) * 4;
              rgba[idx] = 240;
              rgba[idx + 1] = 240;
              rgba[idx + 2] = 240;
            }
          }
        }
      }

      // Message Box (from1080p(120, 785, 1400, 80) -> 60, 392, 700, 40)
      if (opts?.hasMessage) {
        fill(60, 392, 700, 40, 20, 20, 30);
        fill(80, 400, 200, 16, 220, 220, 220);
        const charSum = Array.from(opts.hasMessage).reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const uniqueX = 300 + (charSum % 100);
        fill(uniqueX, 400, 10, 10, 220, 220, 220);
      }

      // Ability/Item Banner (from1080p(1510, 385, 265, 115) -> 755, 192, 132, 57)
      if (opts?.hasBanner) {
        fill(755, 192, 132, 57, 40, 40, 50);
        fill(755, 192, 132, 6, 210, 52, 136);
        fill(770, 210, 80, 20, 220, 220, 220);
        const charSum = Array.from(opts.hasBanner).reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const uniqueX = 860 + (charSum % 20);
        fill(uniqueX, 210, 10, 10, 220, 220, 220);
      }

      return rgba;
    }

    interface MockFrameInfo {
      readonly tSec: number;
      readonly p2aHp: number;
      readonly p2bHp: number;
      readonly message?: string;
      readonly banner?: { text: string; side: "p1" | "p2" };
      readonly isMoveTime45?: boolean;
    }

    const timeline: MockFrameInfo[] = [
      // 繰り出し (p2b: Farigiraf, p2a: Archaludon) & Turn 1, Turn 2 導入
      { tSec: 10, p2aHp: 100, p2bHp: 100, message: "Lunalotl sent out Farigiraf and Archaludon!" },
      { tSec: 15, p2aHp: 100, p2bHp: 100, message: "Go! Salamence and Incineroar!" },
      { tSec: 80, p2aHp: 100, p2bHp: 100, isMoveTime45: true },
      { tSec: 140, p2aHp: 100, p2bHp: 100, isMoveTime45: true },
      // Turn 2 被弾後 (Archaludon 88%, Farigiraf 80%)
      { tSec: 245, p2aHp: 88, p2bHp: 80 },
      // 248s: Farigiraf (p2b) HP bar 回復演出 (80% -> 86%)
      { tSec: 248, p2aHp: 88, p2bHp: 86 },
      // 249s: Grassy terrain 回復メッセージ表示
      { tSec: 249, p2aHp: 88, p2bHp: 86, message: "The opposing Farigiraf had its HP restored." },
      // 251s: Archaludon (p2a) HP bar 回復演出 (88% -> 95%)
      { tSec: 251, p2aHp: 95, p2bHp: 86 },
      // 252s: Grassy terrain 回復メッセージ表示
      { tSec: 252, p2aHp: 95, p2bHp: 86, message: "The opposing Archaludon had its HP restored." },
      // 254s: Leftovers バナー & Farigiraf (p2b) たべのこし回復演出 (86% -> 92%)
      {
        tSec: 254,
        p2aHp: 95,
        p2bHp: 92,
        banner: { text: "Farigiraf's Leftovers", side: "p2" },
      },
      // 257s: 安定
      { tSec: 257, p2aHp: 95, p2bHp: 92 },
      // 270s: Turn 3 コマンド画面
      { tSec: 270, p2aHp: 95, p2bHp: 92, isMoveTime45: true },
    ];

    let currentSeekSec = 0;

    const mockFrameSource = {
      durationSec: 280,
      async seek(timeSec: number) {
        currentSeekSec = timeSec;
      },
      async captureFrame() {
        const activeItem = timeline.find((x) => Math.abs(x.tSec - currentSeekSec) < 0.5);
        const lastHpItem = [...timeline].reverse().find((x) => x.tSec <= currentSeekSec) ?? timeline[0]!;
        const rgba = make960x540Frame(lastHpItem.p2aHp, lastHpItem.p2bHp, {
          isMoveTime45: Boolean(activeItem?.isMoveTime45),
          hasBanner: activeItem?.banner?.text,
          hasMessage: activeItem?.message,
        });

        return {
          rgba,
          width: 960,
          height: 540,
          timestampMs: Math.round(currentSeekSec * 1000),
        };
      },
      async recognizeRoiText(_rect: unknown, hint: "species" | "move" | "ability" | "message" | "hp" | "result") {
        const item = timeline.find((x) => Math.abs(x.tSec - currentSeekSec) < 0.5);
        if (hint === "ability" && item?.banner) {
          return item.banner.text;
        }
        if (hint === "message" && item?.message) {
          return item.message;
        }
        return null;
      },
    };

    const analyzer = new VideoKifuAnalyzer({
      myTeam,
      dictionaries,
      sampleStepSec: 1.0,
    });

    const summary = await analyzer.analyze(mockFrameSource);
    const pbn = summary.pbnText;

    // Turn 2 の 3つの回復イベントが正確な順序と属性で出力されていること
    expect(pbn).toContain("heal p2b 80% -> 86% [grassy-terrain]");
    expect(pbn).toContain("heal p2a 88% -> 94% [grassy-terrain]");
    expect(pbn).toContain("heal p2b 86% -> 92% [leftovers]");

    // 誤った leftovers の誤爆（Archaludon への誤割り当て等）がないこと
    expect(pbn).not.toContain("heal p2a 88% -> 94% [leftovers]");
    expect(pbn).not.toContain("heal p2a 88% -> 95% [leftovers]");
  });

  it("resolves previous confirmed HP as source of truth for damage and heal, eliminating intermediate 99% noise", () => {
    const dictionaries = buildChampionsDictionaries(
      (k) => k,
      (k) => k,
    );
    const parser = new BattleLogParser({
      myTeam: [{ identifier: "incineroar", slug: "incineroar" }],
      dictionaries,
      p2Roster: ["farigiraf", "garchomp"],
      p1MaxHp: () => 200,
      p1ItemSlug: () => null,
    });

    parser.feedMessage("Lunalotl sent out Farigiraf and Garchomp!", 100_000);
    parser.feedMessage("Go! Incineroar!", 105_000);
    parser.beginTurn(120_000);
    parser.feedMessage("Incineroar used Snarl!", 125_000);
    // Even if intermediate frame reports 99% or 98%, previous confirmed HP (100%) must be locked in
    parser.feedDamage("p2b", "99%", "80%", "19%", 128_000);
    parser.feedDamage("p2a", "98%", "88%", "10%", 128_000);
    parser.feedMessage("The opposing Farigiraf and the opposing Garchomp's Sp. Atk fell!", 130_000);

    const rendered = parser.render().join("\n");
    expect(rendered).toContain("p2a: 100% -> 88%, spa -1");
    expect(rendered).toContain("p2b: 100% -> 80%, spa -1");
    expect(rendered).not.toContain("99% ->");
    expect(rendered).not.toContain("98% ->");
  });
});
