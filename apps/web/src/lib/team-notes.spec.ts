import { describe, it, expect } from "vitest";
import { parseTeamNotes, serializeTeamNotes, hasTeamNotes, TeamNotes } from "./team-notes";

describe("team-notes", () => {
  it("serializes and parses structured notes cleanly", () => {
    const notes: TeamNotes = {
      buildProcess: "Started with Pelipper and Archaludon rain core",
      basicConcepts: "Lead Pelipper + Archaludon, set Tailwind and click Electro Shot",
      metaPlans: "vs Sun: pivot Pelipper to overwrite weather. vs Trick Room: pressure Hatterene early.",
    };

    const serialized = serializeTeamNotes(notes);
    expect(serialized).toContain('"buildProcess"');

    const parsed = parseTeamNotes(serialized);
    expect(parsed.buildProcess).toBe(notes.buildProcess);
    expect(parsed.basicConcepts).toBe(notes.basicConcepts);
    expect(parsed.metaPlans).toBe(notes.metaPlans);
    expect(hasTeamNotes(parsed)).toBe(true);
  });

  it("handles legacy plain text as basicConcepts", () => {
    const plain = "This is an old plain text description without JSON.";
    const parsed = parseTeamNotes(plain);

    expect(parsed.basicConcepts).toBe(plain);
    expect(parsed.buildProcess).toBeUndefined();
    expect(parsed.metaPlans).toBeUndefined();
    expect(hasTeamNotes(parsed)).toBe(true);
  });

  it("handles empty or whitespace notes cleanly", () => {
    expect(parseTeamNotes("")).toEqual({});
    expect(parseTeamNotes("   ")).toEqual({});
    expect(parseTeamNotes(undefined)).toEqual({});

    expect(serializeTeamNotes({})).toBe("");
    expect(serializeTeamNotes({ buildProcess: "  ", basicConcepts: "" })).toBe("");
    expect(hasTeamNotes({})).toBe(false);
  });

  it("preserves Markdown formatting across serialization", () => {
    const mdNotes: TeamNotes = {
      buildProcess: "## Rationale\n\n- Core: **Urshifu-Rapid-Strike**\n- Speed control: *Tailwind*",
      basicConcepts: "### Leads\n\n1. Lead A + Lead B\n2. Backline: `Ogerpon-Wellspring`",
      metaPlans: "#### Matchup Plans\n\n> Note: Be careful with Prankster Taunt\n\n- [ ] vs Psyspam\n- [ ] vs Rain",
    };

    const serialized = serializeTeamNotes(mdNotes);
    const parsed = parseTeamNotes(serialized);

    expect(parsed.buildProcess).toBe(mdNotes.buildProcess);
    expect(parsed.basicConcepts).toBe(mdNotes.basicConcepts);
    expect(parsed.metaPlans).toBe(mdNotes.metaPlans);
  });
});
