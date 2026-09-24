import { describe, it, expect } from "vitest";
import { teamSchema, teamSaveSchema } from "./team";

describe("team schemas with description", () => {
  it("teamSaveSchema should parse a valid team with description", () => {
    const data = {
      id: "01JTEAM01",
      name: "Rain Offense",
      description: "Pelipper + Archaludon lead against hyper offense. Keep Kingdra in the back.",
      members: [],
    };
    const result = teamSaveSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe(
        "Pelipper + Archaludon lead against hyper offense. Keep Kingdra in the back.",
      );
    }
  });

  it("teamSaveSchema should parse a valid team without description", () => {
    const data = {
      id: "01JTEAM02",
      name: "Standard Team",
      members: [],
    };
    const result = teamSaveSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
    }
  });

  it("teamSaveSchema should reject description exceeding 30000 characters", () => {
    const data = {
      id: "01JTEAM03",
      name: "Overly Verbose Team",
      description: "a".repeat(30001),
      members: [],
    };
    const result = teamSaveSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("teamSchema should preserve description when parsed", () => {
    const data = {
      id: "01JTEAM04",
      name: "Trick Room Core",
      description: "Concept: Hard TR with Hatterene and Indeedee-Female.",
      members: [null, null, null, null, null, null],
    };
    const result = teamSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Concept: Hard TR with Hatterene and Indeedee-Female.");
    }
  });
});
