import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Red Card", () => {
  it("forces attacker to switch out when damaging holder", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "clefable", item: "redcard", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["shadowball", "sleeptalk"] }),
        pokemon({ species: "machamp", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move shadowball 1, move sleeptalk");
  });
});
