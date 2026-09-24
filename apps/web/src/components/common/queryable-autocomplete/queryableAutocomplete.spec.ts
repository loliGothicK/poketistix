import { describe, expect, it } from "vitest";
import {
  buildQuerySuggestions,
  isCommittableInput,
  matchesQueryTokens,
  parseQueryInput,
  parseQueryToken,
  queryTokenLabel,
  resolveActiveQueryTokens,
  toQueryTokenString,
  type QueryFieldDefinition,
} from "./queryableAutocomplete";

const fields: QueryFieldDefinition[] = [
  {
    key: "type",
    label: "Type",
    values: [
      { value: "fire", label: "Fire" },
      { value: "fighting", label: "Fighting" },
      { value: "water", label: "Water" },
    ],
  },
  {
    key: "move",
    values: [{ value: "physical" }, { value: "special" }],
  },
];

describe("parseQueryInput", () => {
  it("treats plain text as text mode", () => {
    expect(parseQueryInput("pika", fields)).toEqual({ kind: "text", text: "pika" });
  });

  it("treats a bare @ as field-key mode", () => {
    expect(parseQueryInput("@", fields)).toEqual({ kind: "field-key", keyPrefix: "" });
    expect(parseQueryInput("@ty", fields)).toEqual({ kind: "field-key", keyPrefix: "ty" });
  });

  it("treats a known key with a colon as field-value mode", () => {
    expect(parseQueryInput("@type:fi", fields)).toEqual({
      kind: "field-value",
      field: fields[0],
      valuePrefix: "fi",
    });
  });

  it("falls back to field-key mode for an unknown key", () => {
    expect(parseQueryInput("@bogus:x", fields)).toEqual({
      kind: "field-key",
      keyPrefix: "bogus",
    });
  });
});

describe("buildQuerySuggestions", () => {
  it("produces no suggestions for plain text (results filter live)", () => {
    expect(buildQuerySuggestions("pika", fields)).toEqual([]);
  });

  it("suggests field keys after @", () => {
    expect(buildQuerySuggestions("@", fields)).toEqual([
      { insertValue: "@type:", label: "Type", caption: "@type", committable: false },
      { insertValue: "@move:", label: "move", caption: "@move", committable: false },
    ]);
  });

  it("filters field keys by the typed prefix", () => {
    expect(buildQuerySuggestions("@mo", fields)).toEqual([
      { insertValue: "@move:", label: "move", caption: "@move", committable: false },
    ]);
  });

  it("suggests every value right after the separator", () => {
    expect(buildQuerySuggestions("@type:", fields).map((s) => s.insertValue)).toEqual([
      "@type:fire",
      "@type:fighting",
      "@type:water",
    ]);
  });

  it("prefix-matches values (so @type:fi offers both fire and fighting)", () => {
    const suggestions = buildQuerySuggestions("@type:fi", fields);
    expect(suggestions.map((s) => s.insertValue)).toEqual(["@type:fire", "@type:fighting"]);
    expect(suggestions.every((s) => s.committable)).toBe(true);
  });
});

describe("isCommittableInput / toQueryTokenString", () => {
  it("commits non-empty plain text", () => {
    expect(isCommittableInput("pikachu", fields)).toBe(true);
    expect(toQueryTokenString("  pikachu ", fields)).toBe("pikachu");
  });

  it("rejects empty text and bare field keys", () => {
    expect(isCommittableInput("   ", fields)).toBe(false);
    expect(isCommittableInput("@type:", fields)).toBe(false);
    expect(isCommittableInput("@ty", fields)).toBe(false);
  });

  it("commits only an exact field value, not a partial prefix", () => {
    expect(isCommittableInput("@type:fi", fields)).toBe(false);
    expect(isCommittableInput("@type:fire", fields)).toBe(true);
    expect(toQueryTokenString("@type:FIRE", fields)).toBe("@type:fire");
  });
});

describe("parseQueryToken", () => {
  it("parses a committed field chip", () => {
    expect(parseQueryToken("@type:fire", fields)).toEqual({
      kind: "field",
      key: "type",
      value: "fire",
    });
  });

  it("parses plain text and unknown queries as text", () => {
    expect(parseQueryToken("pikachu", fields)).toEqual({ kind: "text", text: "pikachu" });
    expect(parseQueryToken("@type:unknown", fields)).toEqual({
      kind: "text",
      text: "@type:unknown",
    });
  });
});

describe("queryTokenLabel", () => {
  it("labels a field chip with its human-readable parts", () => {
    expect(queryTokenLabel({ kind: "field", key: "type", value: "fire" }, fields)).toBe("Type: Fire");
  });

  it("labels a text chip with the raw text", () => {
    expect(queryTokenLabel({ kind: "text", text: "pika" }, fields)).toBe("pika");
  });
});

describe("resolveActiveQueryTokens", () => {
  it("combines committed chips with the live plain-text input", () => {
    expect(resolveActiveQueryTokens(["@type:fire"], "pika", fields)).toEqual([
      { kind: "field", key: "type", value: "fire" },
      { kind: "text", text: "pika" },
    ]);
  });

  it("ignores an in-progress field query in the input", () => {
    expect(resolveActiveQueryTokens(["@type:fire"], "@type:wa", fields)).toEqual([
      { kind: "field", key: "type", value: "fire" },
    ]);
  });
});

describe("matchesQueryTokens", () => {
  const charizard = { text: "charizard", fields: { type: ["fire", "flying"] } };
  const machamp = { text: "machamp", fields: { type: ["fighting"] } };

  it("matches a field token exactly (fire does not match fighting)", () => {
    const tokens = parseQueryToken("@type:fire", fields);
    expect(matchesQueryTokens(charizard, [tokens])).toBe(true);
    expect(matchesQueryTokens(machamp, [tokens])).toBe(false);
  });

  it("matches plain text as a case-insensitive substring", () => {
    expect(matchesQueryTokens(charizard, [{ kind: "text", text: "CHAR" }])).toBe(true);
    expect(matchesQueryTokens(machamp, [{ kind: "text", text: "char" }])).toBe(false);
  });

  it("applies multiple tokens as an AND filter", () => {
    const tokens = [{ kind: "field", key: "type", value: "fire" } as const, { kind: "text", text: "char" } as const];
    expect(matchesQueryTokens(charizard, tokens)).toBe(true);
    expect(matchesQueryTokens({ text: "flareon", fields: { type: ["fire"] } }, tokens)).toBe(false);
  });

  it("supports Japanese Hiragana, Katakana, and Romaji matching when isJapanese is true", () => {
    const target = { text: "リザードン", fields: { type: ["fire", "flying"] } };
    expect(matchesQueryTokens(target, [{ kind: "text", text: "リザ" }], { isJapanese: true })).toBe(true);
    expect(matchesQueryTokens(target, [{ kind: "text", text: "りざ" }], { isJapanese: true })).toBe(true);
    expect(matchesQueryTokens(target, [{ kind: "text", text: "riza-don" }], { isJapanese: true })).toBe(true);
    expect(matchesQueryTokens(target, [{ kind: "text", text: "rizadon" }], { isJapanese: true })).toBe(true);
    expect(matchesQueryTokens(target, [{ kind: "text", text: "pika" }], { isJapanese: true })).toBe(false);
  });

  it("does not match unrelated Japanese names when user types Japanese/Romaji (e.g. あーぼ does not match ユキノオー)", () => {
    const abomasnow = { text: "ユキノオー", fields: { type: ["grass", "ice"] } };
    expect(matchesQueryTokens(abomasnow, [{ kind: "text", text: "あーぼ" }], { isJapanese: true })).toBe(false);
    expect(matchesQueryTokens(abomasnow, [{ kind: "text", text: "yukino" }], { isJapanese: true })).toBe(true);
    expect(matchesQueryTokens(abomasnow, [{ kind: "text", text: "ゆき" }], { isJapanese: true })).toBe(true);
  });
});
