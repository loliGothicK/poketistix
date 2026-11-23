import { describe, expect, it } from "vitest";
import { parsePbnToKifuDocument } from "./kifu";

describe("parsePbnToKifuDocument", () => {
  it("parses PBN 1.0 headers, selection, lead, turns, commands, and nested event blocks into structured JSON", () => {
    const pbn = [
      '[PBN "1.0"]',
      '[Regulation "M-C"]',
      '[Sheet "CTS"]',
      '[Result "WIN"]',
      "",
      "@p1 0 gengar @ gengarite | cursed-body | Timid H30 C5 D24 S7+ | 165,76,80,155,119,150 | shadow-ball, sludge-bomb, perish-song, protect",
      "@select 0, 1, 3, 5",
      "",
      "@p2 0 charizard",
      "@p2 1 venusaur",
      "",
      "@lead @t=55000ms",
      "  switch p2b charizard 100%",
      "  switch p1b incineroar 202/202 {",
      "    ability p1b intimidate {",
      "      p2a: atk -1",
      "      p2b: atk -1",
      "    }",
      "  }",
      "",
      "@turn 1 @t=68000ms",
      "  @field HarshSunlight 5/5",
      "  @state",
      "  p1:",
      "    | active:",
      "        p1a: gengar 165/165",
      "  @cmd p1a: protect +mega | p1b: flare-blitz p2a",
      "  mega p1a gengar-mega",
      "  move p1a protect",
      "  move p2b heat-wave {",
      "    p1a: protected",
      "    p1b: 202/202 -> 154/202",
      "  }",
      "  damage p1a 165/165 -> 155/165 [sandstorm]",
      "  move p2a weather-ball -> p1a { protected }",
    ].join("\n");

    const doc = parsePbnToKifuDocument(pbn);

    expect(doc.version).toBe("1.0");
    expect(doc.regulation).toBe("M-C");
    expect(doc.sheet).toBe("CTS");
    expect(doc.result).toBe("WIN");
    expect(doc.p1Select).toEqual([0, 1, 3, 5]);
    expect(doc.p2Roster).toEqual(["charizard", "venusaur"]);

    expect(doc.lead.timestampMs).toBe(55000);
    expect(doc.lead.events).toHaveLength(2);
    expect(doc.lead.events[1]?.verb).toBe("switch");
    expect(doc.lead.events[1]?.children?.[0]?.verb).toBe("ability");
    expect(doc.lead.events[1]?.children?.[0]?.children).toEqual([
      { verb: "target", args: ["p2a", "atk -1"] },
      { verb: "target", args: ["p2b", "atk -1"] },
    ]);

    expect(doc.turns).toHaveLength(1);
    const t1 = doc.turns[0]!;
    expect(t1.turnNumber).toBe(1);
    expect(t1.timestampMs).toBe(68000);
    expect(t1.field).toEqual(["HarshSunlight 5/5"]);
    expect(t1.cmd).toEqual({ p1a: "protect +mega", p1b: "flare-blitz p2a" });
    expect(t1.events).toHaveLength(5);
    expect(t1.events[2]).toEqual({
      verb: "move",
      args: ["p2b", "heat-wave"],
      children: [
        { verb: "target", args: ["p1a", "protected"] },
        { verb: "target", args: ["p1b", "202/202 -> 154/202"] },
      ],
    });
    expect(t1.events[3]).toEqual({
      verb: "damage",
      args: ["p1a", "165/165", "->", "155/165"],
      bracket: "sandstorm",
    });
    expect(t1.events[4]).toEqual({
      verb: "move",
      args: ["p2a", "weather-ball", "->", "p1a"],
      comment: "protected",
    });
  });
});
