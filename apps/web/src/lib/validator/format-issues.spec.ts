import { describe, it, expect } from "vitest";
import * as v from "valibot";
import i18next from "i18next";
import jaTranslation from "@locales/ja/translation.json";
import enTranslation from "@locales/en/translation.json";
import { formatTeamValidationIssues } from "./format-issues";
import { teamSchema } from "./team";

const i18nJa = i18next.createInstance();
await i18nJa.init({
  lng: "ja",
  resources: { ja: { translation: jaTranslation } },
});

const i18nEn = i18next.createInstance();
await i18nEn.init({
  lng: "en",
  resources: { en: { translation: enTranslation } },
});

describe("formatTeamValidationIssues", () => {
  it("特性が未設定 (null) の場合、ヒューマンリーダブルなメッセージを返す (JA & EN)", () => {
    const invalidTeam = {
      id: "01JTEAM",
      name: "My Team",
      members: [
        {
          boxId: "01J9Z8X",
          identifier: "golisopod",
          slug: "golisopod",
          item: null,
          ability: null as unknown as number,
          gender: { fixed: false },
          nature: { plus: "atk", minus: "spa" },
          moves: [1, null, null, null],
          evs: { hp: 0, atk: 4, def: 0, spa: 0, spd: 0, spe: 0 },
        },
        null,
        null,
        null,
        null,
        null,
      ],
    };

    const parseResult = v.safeParse(teamSchema, invalidTeam);
    expect(parseResult.success).toBe(false);

    const issuesJa = formatTeamValidationIssues(parseResult, i18nJa.t.bind(i18nJa), invalidTeam.members);
    expect(issuesJa).toContain("グソクムシャ: 特性が設定されていません");

    const issuesEn = formatTeamValidationIssues(parseResult, i18nEn.t.bind(i18nEn), invalidTeam.members);
    expect(issuesEn).toContain("Golisopod: Ability is required");
  });

  it("技が1つも設定されていない場合、ヒューマンリーダブルなメッセージを返す", () => {
    const invalidTeam = {
      id: "01JTEAM",
      name: "My Team",
      members: [
        {
          boxId: "01J9Z8X",
          identifier: "pikachu",
          slug: "pikachu",
          item: null,
          ability: 9,
          gender: { fixed: false },
          nature: { plus: "atk", minus: "spa" },
          moves: [null, null, null, null],
          evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        },
        null,
        null,
        null,
        null,
        null,
      ],
    };

    const parseResult = v.safeParse(teamSchema, invalidTeam);
    expect(parseResult.success).toBe(false);

    const issuesJa = formatTeamValidationIssues(parseResult, i18nJa.t.bind(i18nJa), invalidTeam.members);
    expect(issuesJa).toContain("ピカチュウ: 技が1つも設定されていません");

    const issuesEn = formatTeamValidationIssues(parseResult, i18nEn.t.bind(i18nEn), invalidTeam.members);
    expect(issuesEn).toContain("Pikachu: At least one move is required");
  });

  it("重複した持ち物がある場合、アイテム名付きでヒューマンリーダブルに案内する", () => {
    const invalidTeam = {
      id: "01JTEAM",
      name: "My Team",
      members: [
        {
          boxId: "01J9Z81",
          identifier: "golisopod",
          slug: "golisopod",
          item: 247, // life-orb
          ability: 209,
          gender: { fixed: false },
          nature: { plus: "atk", minus: "spa" },
          moves: [1, null, null, null],
          evs: { hp: 0, atk: 4, def: 0, spa: 0, spd: 0, spe: 0 },
        },
        {
          boxId: "01J9Z82",
          identifier: "pikachu",
          slug: "pikachu",
          item: 247, // duplicate life-orb
          ability: 9,
          gender: { fixed: false },
          nature: { plus: "spe", minus: "atk" },
          moves: [1, null, null, null],
          evs: { hp: 0, atk: 0, def: 0, spa: 4, spd: 0, spe: 4 },
        },
        null,
        null,
        null,
        null,
      ],
    };

    const parseResult = v.safeParse(teamSchema, invalidTeam);
    expect(parseResult.success).toBe(false);

    const issuesJa = formatTeamValidationIssues(parseResult, i18nJa.t.bind(i18nJa), invalidTeam.members);
    expect(issuesJa.some((msg) => msg.includes("いのちのたま") && msg.includes("重複"))).toBe(true);

    const issuesEn = formatTeamValidationIssues(parseResult, i18nEn.t.bind(i18nEn), invalidTeam.members);
    expect(issuesEn.some((msg) => msg.includes("Life Orb") && msg.includes("Duplicate"))).toBe(true);
  });

  it("同じポケモンが重複している場合、重複エラーを人間向けに出力する", () => {
    const invalidTeam = {
      id: "01JTEAM",
      name: "My Team",
      members: [
        {
          boxId: "01J9Z81",
          identifier: "pikachu",
          slug: "pikachu",
          item: null,
          ability: 9,
          gender: { fixed: false },
          nature: { plus: "atk", minus: "spa" },
          moves: [1, null, null, null],
          evs: { hp: 0, atk: 4, def: 0, spa: 0, spd: 0, spe: 0 },
        },
        {
          boxId: "01J9Z82",
          identifier: "pikachu",
          slug: "pikachu",
          item: null,
          ability: 9,
          gender: { fixed: false },
          nature: { plus: "spe", minus: "atk" },
          moves: [1, null, null, null],
          evs: { hp: 0, atk: 0, def: 0, spa: 4, spd: 0, spe: 4 },
        },
        null,
        null,
        null,
        null,
      ],
    };

    const parseResult = v.safeParse(teamSchema, invalidTeam);
    expect(parseResult.success).toBe(false);

    const issuesJa = formatTeamValidationIssues(parseResult, i18nJa.t.bind(i18nJa), invalidTeam.members);
    expect(issuesJa).toContain("ピカチュウ: 同じポケモンが重複しています");
  });

  it("ステータス努力値が上限(32)を超えている場合、ステータス名付きで出力する", () => {
    const invalidTeam = {
      id: "01JTEAM",
      name: "My Team",
      members: [
        {
          boxId: "01J9Z81",
          identifier: "pikachu",
          slug: "pikachu",
          item: null,
          ability: 9,
          gender: { fixed: false },
          nature: { plus: "atk", minus: "spa" },
          moves: [1, null, null, null],
          evs: { hp: 0, atk: 36, def: 0, spa: 0, spd: 0, spe: 0 }, // atk > 32
        },
        null,
        null,
        null,
        null,
        null,
      ],
    };

    const parseResult = v.safeParse(teamSchema, invalidTeam);
    expect(parseResult.success).toBe(false);

    const issuesJa = formatTeamValidationIssues(parseResult, i18nJa.t.bind(i18nJa), invalidTeam.members);
    expect(issuesJa).toContain("ピカチュウ: 攻撃の努力値が上限(32)を超えています");

    const issuesEn = formatTeamValidationIssues(parseResult, i18nEn.t.bind(i18nEn), invalidTeam.members);
    expect(issuesEn).toContain("Pikachu: Atk EV exceeds maximum (32)");
  });

  it("努力値合計が上限(66)を超えている場合、合計努力値上限エラーを出力する", () => {
    const invalidTeam = {
      id: "01JTEAM",
      name: "My Team",
      members: [
        {
          boxId: "01J9Z81",
          identifier: "pikachu",
          slug: "pikachu",
          item: null,
          ability: 9,
          gender: { fixed: false },
          nature: { plus: "atk", minus: "spa" },
          moves: [1, null, null, null],
          evs: { hp: 32, atk: 32, def: 10, spa: 0, spd: 0, spe: 0 }, // total = 74 > 66
        },
        null,
        null,
        null,
        null,
        null,
      ],
    };

    const parseResult = v.safeParse(teamSchema, invalidTeam);
    expect(parseResult.success).toBe(false);

    const issuesJa = formatTeamValidationIssues(parseResult, i18nJa.t.bind(i18nJa), invalidTeam.members);
    expect(issuesJa).toContain("ピカチュウ: 努力値の合計が上限(66)を超えています");

    const issuesEn = formatTeamValidationIssues(parseResult, i18nEn.t.bind(i18nEn), invalidTeam.members);
    expect(issuesEn).toContain("Pikachu: Total EVs exceed maximum (66)");
  });

  it("スロットが未登録（null）のメンバーにバリデーションエラーがある場合、スロットラベルを正しくローカライズする", () => {
    const invalidTeam = {
      id: "01JTEAM",
      name: "My Team",
      members: [
        null,
        {
          boxId: "01J9Z81",
          identifier: "pikachu",
          slug: "pikachu",
          item: null,
          ability: null as unknown as number,
          gender: { fixed: false },
          nature: { plus: "atk", minus: "spa" },
          moves: [1, null, null, null],
          evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        },
        null,
        null,
        null,
        null,
      ],
    };

    const parseResult = v.safeParse(teamSchema, invalidTeam);
    expect(parseResult.success).toBe(false);

    // members 引数でスロット2を null に見立てた場合
    const membersWithNull = [null, null, null, null, null, null];
    const issuesJa = formatTeamValidationIssues(parseResult, i18nJa.t.bind(i18nJa), membersWithNull);
    expect(issuesJa).toContain("スロット 2: 特性が設定されていません");

    const issuesEn = formatTeamValidationIssues(parseResult, i18nEn.t.bind(i18nEn), membersWithNull);
    expect(issuesEn).toContain("Slot 2: Ability is required");
  });

  it("不正なポケモン識別子の場合、不正ポケモンエラーをローカライズして出力する", () => {
    const invalidTeam = {
      id: "01JTEAM",
      name: "My Team",
      members: [
        {
          boxId: "01J9Z81",
          identifier: "invalid_pokemon_identifier",
          slug: "invalid",
          item: null,
          ability: 1,
          gender: { fixed: false },
          nature: { plus: "atk", minus: "spa" },
          moves: [1, null, null, null],
          evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        },
        null,
        null,
        null,
        null,
        null,
      ],
    };

    const parseResult = v.safeParse(teamSchema, invalidTeam);
    expect(parseResult.success).toBe(false);

    const issuesJa = formatTeamValidationIssues(parseResult, i18nJa.t.bind(i18nJa), invalidTeam.members);
    expect(issuesJa.some((msg) => msg.includes("不正なポケモンです"))).toBe(true);

    const issuesEn = formatTeamValidationIssues(parseResult, i18nEn.t.bind(i18nEn), invalidTeam.members);
    expect(issuesEn.some((msg) => msg.includes("Invalid Pokémon"))).toBe(true);
  });
});
