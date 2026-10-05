import { test } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

test("Move: Weather Ball follows the active weather", () => {
  const env = new TestEnvironment(
    [
      pokemon({
        species: "venusaur",
        ability: "overgrow",
        moves: ["weatherball", "sunnyday", "sleeptalk"],
      }),
      pokemon({ species: "snorlax", moves: ["sleeptalk"] }),
    ],
    [
      pokemon({ species: "tauros", moves: ["sleeptalk"] }),
      pokemon({ species: "clefable", moves: ["sleeptalk"] }),
    ],
  );
  env.executeAndAssert("move sunnyday, move sleeptalk", "move sleeptalk, move sleeptalk");
  env.executeAndAssert("move weatherball 1, move sleeptalk", "move sleeptalk, move sleeptalk");
});
