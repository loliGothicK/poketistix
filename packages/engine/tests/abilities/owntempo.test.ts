import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Own Tempo", () => {
  it("prevents the user from becoming confused", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "slowbro",
          ability: "owntempo",
          moves: ["amnesia", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "umbreon",
          ability: "synchronize",
          moves: ["confuseray", "sleeptalk"],
        }),
        pokemon({ species: "clefable", ability: "magicguard", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["confuseray", "amnesia", "sleeptalk"],
      },
    );

    // Umbreon attempts to confuse Slowbro; Own Tempo prevents it
    env.executeAndAssert("move amnesia, move sleeptalk", "move confuseray 1, move sleeptalk");
  });
});
