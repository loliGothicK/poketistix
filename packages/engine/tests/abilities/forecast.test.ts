import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Ability: Forecast", () => {
  it("changes Castform form and type based on weather", () => {
    const env = new TestEnvironment(
      [
        pokemon({
          species: "castform",
          ability: "forecast",
          moves: ["sunnyday", "sleeptalk"],
        }),
        pokemon({ species: "charizard", ability: "blaze", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({
          species: "snorlax",
          ability: "thickfat",
          moves: ["sleeptalk"],
        }),
        pokemon({ species: "umbreon", ability: "synchronize", moves: ["sleeptalk"] }),
      ],
      {
        deterministicMoves: ["sunnyday", "sleeptalk"],
      },
    );

    // Turn 1: Castform uses Sunny Day -> Castform becomes Fire type
    env.executeAndAssert("move sunnyday, move sleeptalk", "move sleeptalk, move sleeptalk");
  });
});
