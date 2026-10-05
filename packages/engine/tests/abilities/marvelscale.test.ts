import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Marvel Scale", () => {
  it("boosts Defense by 1.5x when afflicted by a status condition", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "milotic",
          ability: "marvelscale",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "snorlax", ability: "thickfat", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "charizard",
          ability: "blaze",
          moves: ["willowisp", "rockslide", "sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["willowisp", "rockslide", "sleeptalk"],
      },
    );

    // Turn 1: Charizard burns Milotic with Will-O-Wisp
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move willowisp 1, move sleeptalk");

    // Turn 2: Charizard attacks with Rock Slide; Marvel Scale boosts Milotic's Defense
    env.executeAndAssert("move sleeptalk, move sleeptalk", "move rockslide, move sleeptalk");
  });
});
