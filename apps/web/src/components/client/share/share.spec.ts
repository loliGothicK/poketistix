/**
 * share.spec.ts
 *
 * テスト対象:
 *   1. シェア API の Valibot スナップショットバリデーション
 *   2. PokemonBuildCard で使うスタット計算ロジック (calcStat / statColor)
 *   3. EN/JA 翻訳キーの完全性 (share.* キーが両言語に存在するか)
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { calcHp, calcStatus } from "@/data/utility/training";
import enTranslation from "@locales/en/translation.json";
import jaTranslation from "@locales/ja/translation.json";

// ── 1. スナップショット Valibot スキーマ (API と同定義) ──────────────────────────

const snapshotSchema = v.object({
  teamName: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  members: v.pipe(v.array(v.nullable(v.looseObject({}))), v.length(6)),
});

const validSnapshot = {
  teamName: "My Team",
  members: [null, null, null, null, null, null],
};

describe("snapshotSchema — バリデーション", () => {
  it("有効なスナップショットは成功する", () => {
    const result = v.safeParse(snapshotSchema, validSnapshot);
    expect(result.success).toBe(true);
  });

  it("members が 6 未満だと失敗する", () => {
    const result = v.safeParse(snapshotSchema, {
      ...validSnapshot,
      members: [null, null, null],
    });
    expect(result.success).toBe(false);
  });

  it("members が 6 超だと失敗する", () => {
    const result = v.safeParse(snapshotSchema, {
      ...validSnapshot,
      members: [null, null, null, null, null, null, null],
    });
    expect(result.success).toBe(false);
  });

  it("teamName が空文字だと失敗する", () => {
    const result = v.safeParse(snapshotSchema, { ...validSnapshot, teamName: "" });
    expect(result.success).toBe(false);
  });

  it("teamName が 101 文字だと失敗する", () => {
    const result = v.safeParse(snapshotSchema, {
      ...validSnapshot,
      teamName: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("teamName が 100 文字は成功する", () => {
    const result = v.safeParse(snapshotSchema, {
      ...validSnapshot,
      teamName: "a".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it("members に TrainedPokemon ライクなオブジェクトを含んでも成功する", () => {
    const member = {
      boxId: "01J9Z8X",
      identifier: "garchomp",
      slug: "garchomp",
      item: null,
      ability: 1,
      gender: { fixed: false },
      nature: { plus: "atk", minus: "spa" },
      moves: [1, 2, null, null],
      evs: { hp: 0, atk: 4, def: 0, spa: 0, spd: 0, spe: 0 },
    };
    const result = v.safeParse(snapshotSchema, {
      ...validSnapshot,
      members: [member, null, null, null, null, null],
    });
    expect(result.success).toBe(true);
  });
});

// ── 2. スタット計算ロジック ──────────────────────────────────────────────────

type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

function calcStat(key: StatKey, base: number, ev: number, plus?: StatKey | null, minus?: StatKey | null): number {
  if (key === "hp") return calcHp(base, ev);
  const natureMult = key === plus ? 1.1 : key === minus ? 0.9 : 1.0;
  return calcStatus(base, ev, natureMult);
}

function statColor(key: StatKey, plus?: StatKey | null, minus?: StatKey | null): string | undefined {
  if (key === "hp") return undefined;
  if (key === plus) return "#ef5350";
  if (key === minus) return "#42a5f5";
  return undefined;
}

describe("calcStat — ステータス実数値計算", () => {
  it("HP は calcHp を使う (base=95, ev=0 → 170)", () => {
    // calcHp: base + ev + 75
    expect(calcStat("hp", 95, 0)).toBe(170);
  });

  it("HP は EV 分加算される (base=95, ev=4 → 174)", () => {
    expect(calcStat("hp", 95, 4)).toBe(174);
  });

  it("HP に性格補正は乗らない（plus/minus が hp でも値が変わらない）", () => {
    const base = calcStat("hp", 95, 0);
    const withPlus = calcStat("hp", 95, 0, "hp");
    expect(withPlus).toBe(base);
  });

  it("性格補正なし: calcStatus(base, ev, 1.0) と一致する", () => {
    expect(calcStat("atk", 130, 4)).toBe(calcStatus(130, 4, 1.0));
  });

  it("上昇補正: atk+ の場合 ×1.1 (base=130, ev=4)", () => {
    const without = calcStatus(130, 4, 1.0);
    const with_ = calcStat("atk", 130, 4, "atk");
    expect(with_).toBe(calcStatus(130, 4, 1.1));
    expect(with_).toBeGreaterThan(without);
  });

  it("下降補正: atk- の場合 ×0.9 (base=130, ev=4)", () => {
    const without = calcStatus(130, 4, 1.0);
    const with_ = calcStat("atk", 130, 4, null, "atk");
    expect(with_).toBe(calcStatus(130, 4, 0.9));
    expect(with_).toBeLessThan(without);
  });

  it("plus と minus が異なるとき、plus のステータスだけ赤色になる", () => {
    expect(statColor("atk", "atk", "spa")).toBe("#ef5350");
    expect(statColor("spa", "atk", "spa")).toBe("#42a5f5");
    expect(statColor("def", "atk", "spa")).toBeUndefined();
  });

  it("HP には常に color が undefined", () => {
    expect(statColor("hp", "hp", "spa")).toBeUndefined();
  });
});

describe("calcStat — EV 0/最大の境界値", () => {
  // Champions の EV 最大は 32（context から）
  it("EV=0 と EV=32 の差が base 依存で正しい", () => {
    const ev0 = calcStat("spe", 102, 0);
    const ev32 = calcStat("spe", 102, 32);
    // calcStatus: (base + ev + 20) * nature → 差は ev分だけ
    expect(ev32 - ev0).toBe(32);
  });
});

// ── 3. 翻訳キーの完全性 ──────────────────────────────────────────────────────

const SHARE_KEYS = [
  "pageTitle",
  "copyLink",
  "linkCopied",
  "notFound",
  "notFoundDescription",
  "memberCount",
  "createdAt",
  "shareTeam",
  "sharing",
  "shareSuccess",
  "shareError",
  "draftReasonTitle",
] as const;

describe("翻訳キー — share.* が EN/JA 両方に存在し空でない", () => {
  const enShare = (enTranslation as unknown as Record<string, Record<string, string>>).share;
  const jaShare = (jaTranslation as unknown as Record<string, Record<string, string>>).share;

  it("EN: share セクションが存在する", () => {
    expect(enShare).toBeDefined();
  });

  it("JA: share セクションが存在する", () => {
    expect(jaShare).toBeDefined();
  });

  it.for(SHARE_KEYS)("EN: share.%s が存在し空でない", (key) => {
    expect(enShare?.[key]).toBeDefined();
    expect(enShare?.[key].trim()).not.toBe("");
  });

  it.for(SHARE_KEYS)("JA: share.%s が存在し空でない", (key) => {
    expect(jaShare?.[key]).toBeDefined();
    expect(jaShare?.[key].trim()).not.toBe("");
  });
});
