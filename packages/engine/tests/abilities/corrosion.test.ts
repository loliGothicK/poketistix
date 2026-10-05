import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Corrosion", () => {
  it("allows the user to poison Steel-type Pokémon with Toxic", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "salazzle", ability: "corrosion", moves: ["toxic", "sleeptalk"] }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "forretress", ability: "sturdy", moves: ["sleeptalk"] }),
        pokemon({ species: "snorlax", ability: "immunity", moves: ["sleeptalk"] }),
      ],
    );

    // Salazzle uses Toxic on Forretress (Steel/Bug)
    // Corrosion allows the poison to be inflicted despite Steel typing
    env.executeAndAssert("move toxic 1, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
