import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Prankster", () => {
  it("gives +1 priority to status moves", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "whimsicott",
          ability: "prankster",
          moves: ["tailwind", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "aerodactyl",
          ability: "unnerve",
          moves: ["tailwind", "sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["tailwind", "sleeptalk"],
      },
    );

    // Whimsicott is slower than Aerodactyl, but Prankster gives Tailwind +1 priority so Whimsicott moves first
    env.executeAndAssert("move tailwind, move sleeptalk", "move tailwind, move sleeptalk");
  });
});
