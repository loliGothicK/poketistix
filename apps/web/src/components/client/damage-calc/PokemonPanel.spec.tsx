import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PokemonPanel } from "./PokemonPanel";
import { ThemeProvider, createTheme } from "@mui/material";
import type { PokemonPanelState } from "./useDamageCalcPage";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";

// Define translations matching the real app keys used for conditions
const resources = {
  en: {
    translation: {
      damageCalc: {
        condTargetStatus: "Target has a status condition",
        condUserStatus: "User has a status condition",
        condMetronomeTurns: "Consecutive uses",
        condStockpileTurns: "Stockpile uses",
        condFickleBeamFullPower: "All heads attacked (Full Power)",
        pokemon: "Pokemon",
        item: "Item",
        ability: "Ability",
        hp: "HP",
        attack: "Atk",
        defense: "Def",
        spAttack: "SpA",
        spDefense: "SpD",
        speed: "Spe",
        conditions: "Conditions",
        status: "Status",
        reflect: "Reflect",
        lightScreen: "Light Screen",
        auroraVeil: "Aurora Veil",
        helpingHand: "Helping Hand",
        powerSpot: "Power Spot",
        loadFromBox: "Load from Box",
      },
    },
  },
};

vi.mock("@/hooks/useBoxData", () => ({
  useBoxData: () => ({
    box: [],
    isLoading: false,
    isError: false,
    saveToBox: vi.fn(),
    updateInBox: vi.fn(),
    removeFromBox: vi.fn(),
  }),
}));

// Use an IIFE or top-level await to init i18n safely before tests run
await i18n.init({
  lng: "en",
  fallbackLng: "en",
  resources,
});

const defaultPanel: PokemonPanelState = {
  identifier: "gengar",
  move: null,
  ability: "cursed-body",
  item: null,
  boosts: {},
  evHp: 0,
  evAtk: 0,
  evDef: 0,
  evSpa: 0,
  evSpd: 0,
  evSpe: 0,
  hpPercent: 100,
  conditions: {},
  moveConditions: {},
  itemConditions: {},
  natures: {},
};

function renderPanel(props: Partial<React.ComponentProps<typeof PokemonPanel>> = {}) {
  const theme = createTheme();
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={theme}>
        <PokemonPanel
          label="Attacker"
          role="attacker"
          value={defaultPanel}
          onChange={vi.fn()}
          activeMove={defaultPanel.move}
          isDoubles={false}
          {...props}
        />
      </ThemeProvider>
    </I18nextProvider>,
  );
}

describe("PokemonPanel UI Conditions", () => {
  it("does not render special move conditions by default", () => {
    renderPanel();
    expect(screen.queryByLabelText("Target has a status condition")).toBeNull();
    expect(screen.queryByLabelText("User has a status condition")).toBeNull();
  });

  it("renders 'User has a status condition' checkbox when Facade is selected", () => {
    const value = { ...defaultPanel, move: "facade" };
    renderPanel({ value, activeMove: "facade" });
    const checkbox = screen.getByLabelText("User has a status condition");
    expect(checkbox).toBeDefined();
    expect(checkbox.getAttribute("type")).toBe("checkbox");
  });

  it("renders 'Target has a status condition' checkbox when Hex is selected", () => {
    const value = { ...defaultPanel, move: "hex" };
    renderPanel({ value, activeMove: "hex" });
    const checkbox = screen.getByLabelText("Target has a status condition");
    expect(checkbox).toBeDefined();
  });

  it("renders 'Stockpile uses' number input when Spit Up is selected", () => {
    const value = { ...defaultPanel, move: "spit-up" };
    renderPanel({ value, activeMove: "spit-up" });
    const input = screen.getByLabelText("Stockpile uses");
    expect(input).toBeDefined();
    expect(input.getAttribute("type")).toBe("number");
    expect(input.getAttribute("min")).toBe("1");
    expect(input.getAttribute("max")).toBe("3");
  });

  it("renders 'All heads attacked (Full Power)' checkbox when Fickle Beam is selected", () => {
    const value = { ...defaultPanel, move: "fickle-beam" };
    renderPanel({ value, activeMove: "fickle-beam" });
    const checkbox = screen.getByLabelText("All heads attacked (Full Power)");
    expect(checkbox).toBeDefined();
    expect(checkbox.getAttribute("type")).toBe("checkbox");
  });

  it("renders 'Consecutive uses' input when Metronome is held by attacker", () => {
    const value = { ...defaultPanel, item: "metronome" };
    renderPanel({ value, activeMove: "tackle" });
    const input = screen.getByLabelText("Consecutive uses");
    expect(input).toBeDefined();
    expect(input.getAttribute("type")).toBe("number");
  });

  it("does not render Metronome turns if role is defender", () => {
    const value = { ...defaultPanel, item: "metronome" };
    renderPanel({ value, activeMove: "tackle", role: "defender" });
    expect(screen.queryByLabelText("Consecutive uses")).toBeNull();
  });

  it("renders Reflect, Light Screen, and Aurora Veil checkboxes for defender", () => {
    renderPanel({
      role: "defender",
      screens: { reflect: false, lightScreen: false, auroraVeil: false },
      onScreensChange: vi.fn(),
    });
    const reflectCheckbox = screen.getByLabelText("Reflect");
    const lightScreenCheckbox = screen.getByLabelText("Light Screen");
    const auroraVeilCheckbox = screen.getByLabelText("Aurora Veil");
    expect(reflectCheckbox).toBeDefined();
    expect(lightScreenCheckbox).toBeDefined();
    expect(auroraVeilCheckbox).toBeDefined();
  });

  it("does not render screen checkboxes for attacker", () => {
    renderPanel({
      role: "attacker",
      screens: { reflect: false, lightScreen: false, auroraVeil: false },
      onScreensChange: vi.fn(),
    });
    expect(screen.queryByLabelText("Reflect")).toBeNull();
    expect(screen.queryByLabelText("Light Screen")).toBeNull();
    expect(screen.queryByLabelText("Aurora Veil")).toBeNull();
  });

  it("renders 'Helping Hand' and 'Power Spot' condition only in doubles battle", () => {
    const { unmount } = renderPanel({ role: "attacker", isDoubles: true });
    expect(screen.getByLabelText("Helping Hand")).toBeDefined();
    expect(screen.getByLabelText("Power Spot")).toBeDefined();
    unmount();

    renderPanel({ role: "attacker", isDoubles: false });
    expect(screen.queryByLabelText("Helping Hand")).toBeNull();
    expect(screen.queryByLabelText("Power Spot")).toBeNull();
  });

  it("renders 'Load from Box' button", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /Load from Box/i })).toBeDefined();
  });
});
