import { describe, it } from "vitest";
import { TestEnvironment, pokemon } from "@/sim-utils";

describe("Item: Eject Button", () => {
  it("causes holder to switch out when damaged", () => {
    const env = new TestEnvironment(
      [
        pokemon({ species: "snorlax", item: "ejectbutton", moves: ["sleeptalk"] }),
        pokemon({ species: "clefable", moves: ["sleeptalk"] }),
        pokemon({ species: "pikachu", moves: ["sleeptalk"] }),
      ],
      [
        pokemon({ species: "gengar", moves: ["shadowball", "sleeptalk"] }),
        pokemon({ species: "machamp", moves: ["sleeptalk"] }),
      ],
    );

    env.executeAndAssert("move sleeptalk, move sleeptalk", "move shadowball 1, move sleeptalk");
  });
});
