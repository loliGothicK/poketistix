import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("move: psychicnoise", () => {
  it("should prevent target from healing", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "alolan-raichu", moves: ["psychicnoise", "thunderbolt"] }),
        pokemon({ species: "charizard", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "alakazam", moves: ["recover", "sleeptalk"] }),
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
      ],
    );

    // Turn 1: Raichu damages Alakazam, applies Heal Block
    env.executeAndAssert("move psychicnoise 1, move sleeptalk", "move sleeptalk, move sleeptalk", {
      damage_roll: "max",
    });

    // Turn 2: Alakazam tries to Recover but fails
    env.executeAndAssert("move thunderbolt 1, move sleeptalk", "move recover, move sleeptalk", {
      damage_roll: "max",
    });
  });

  it("should expire Heal Block at the end of turn 2 so target can heal on turn 3", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "alolan-raichu", moves: ["psychicnoise", "sleeptalk"] }),
        pokemon({ species: "charizard", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "alakazam", moves: ["recover", "sleeptalk"] }),
        pokemon({ species: "gengar", moves: ["sleeptalk"] }),
      ],
    );

    // Turn 1: Psychic Noise damages Alakazam and applies Heal Block (2 turns)
    env.executeAndAssert("move psychicnoise 1, move sleeptalk", "move sleeptalk, move sleeptalk", {
      damage_roll: "max",
    });

    // Turn 2: Alakazam cannot Recover; Heal Block ends at Step 24 of Turn 2
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move recover, move sleeptalk", {
      damage_roll: "max",
    });

    // Turn 3: Heal Block has expired, so Alakazam successfully uses Recover
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move recover, move sleeptalk", {
      damage_roll: "max",
    });
  });
});
