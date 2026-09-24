import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderFieldDiff } from "./TeamHistoryDialog";
import type { TrainedPokemon } from "@/store/team/team";

const mockT = (key: string) => {
  if (key === "natures.impish.name") return "Impish";
  return key;
};

describe("TeamHistoryDialog - renderFieldDiff", () => {
  const fromPokemon: TrainedPokemon = {
    boxId: "box_01",
    slug: "incineroar",
    identifier: "incineroar",
    ability: 22,
    item: null,
    gender: { fixed: false },
    nature: { plus: "def", minus: "spa" },
    evs: { hp: 32, atk: 0, def: 10, spa: 0, spd: 14, spe: 10 },
    moves: [null, null, null, null],
  };

  const toPokemon: TrainedPokemon = {
    boxId: "box_01",
    slug: "incineroar",
    identifier: "incineroar",
    ability: 22,
    item: null,
    gender: { fixed: false },
    nature: { plus: "def", minus: "spa" },
    evs: { hp: 32, atk: 3, def: 10, spa: 0, spd: 11, spe: 10 },
    moves: [null, null, null, null],
  };

  it("locks in desktop baseline appearance (single-line horizontal arrow)", () => {
    const { container } = render(
      renderFieldDiff("evs", fromPokemon, toPokemon, mockT, "#1976d2", false)!,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders 3-line vertical format on mobile", () => {
    const { container } = render(
      renderFieldDiff("evs", fromPokemon, toPokemon, mockT, "#1976d2", true)!,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
