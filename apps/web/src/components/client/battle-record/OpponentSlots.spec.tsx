import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OpponentSlots } from "./OpponentSlots";
import { ThemeProvider, createTheme } from "@mui/material";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "i18next";
import type { OpponentDraft } from "./formState";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const resources = {
  en: {
    translation: {
      battleRecord: {
        form: {
          opponents: "Opponent's team",
          addOpponent: "Add opponent",
          removeOpponent: "Remove opponent",
          editOpponent: "Edit details",
          changePokemon: "Change Pokémon",
          resetSlots: "Reset slots",
          resetSelection: "Reset selection",
        },
        selection: {
          lead: "Lead",
          back: "Back",
          leadShort: "Leads",
          hint: "Tap to cycle selection",
        },
      },
      pokemon: {
        pikachu: { name: "Pikachu" },
        charizard: { name: "Charizard" },
      },
    },
  },
};

await i18n.init({
  lng: "en",
  fallbackLng: "en",
  resources,
});

const theme = createTheme();

const mockOpponents: readonly OpponentDraft[] = [
  {
    key: "opp-1",
    pokemonSlug: "pikachu",
    itemSlug: null,
    abilitySlug: null,
    moves: [],
    selectionRole: "lead",
    notes: "",
  },
  {
    key: "opp-2",
    pokemonSlug: "charizard",
    itemSlug: null,
    abilitySlug: null,
    moves: [],
    selectionRole: "back",
    notes: "",
  },
];

function renderOpponentSlots(props: Partial<React.ComponentProps<typeof OpponentSlots>> = {}) {
  const defaultProps: React.ComponentProps<typeof OpponentSlots> = {
    opponents: mockOpponents,
    onChange: vi.fn(),
    format: "doubles",
    ...props,
  };

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider theme={theme}>
            <OpponentSlots {...defaultProps} />
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    ),
    onChange: defaultProps.onChange,
  };
}

describe("OpponentSlots", () => {
  it("renders opponents and reset buttons when opponents exist", () => {
    renderOpponentSlots();

    expect(screen.getByText("Reset slots")).toBeDefined();
    expect(screen.getByText("Reset selection")).toBeDefined();
    expect(screen.getByLabelText("Pikachu")).toBeDefined();
    expect(screen.getByLabelText("Charizard")).toBeDefined();
  });

  it("calls onChange([]) when 'Reset slots' is clicked", () => {
    const { onChange } = renderOpponentSlots();

    const resetButton = screen.getByText("Reset slots");
    fireEvent.click(resetButton);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("resets selection roles when 'Reset selection' is clicked", () => {
    const { onChange } = renderOpponentSlots();

    const resetSelectionButton = screen.getByText("Reset selection");
    fireEvent.click(resetSelectionButton);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ pokemonSlug: "pikachu", selectionRole: null }),
      expect.objectContaining({ pokemonSlug: "charizard", selectionRole: null }),
    ]);
  });

  it("removes an individual slot when the remove button is clicked", () => {
    const { onChange } = renderOpponentSlots();

    const removeButtons = screen.getAllByLabelText("Remove opponent");
    fireEvent.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith([mockOpponents[1]]);
  });

  it("cycles selection on keyboard Enter/Space", () => {
    const { onChange } = renderOpponentSlots();

    const pikachuCard = screen.getByLabelText("Pikachu");
    fireEvent.keyDown(pikachuCard, { key: "Enter" });

    expect(onChange).toHaveBeenCalled();
  });

  it("removes slot on keyboard Delete", () => {
    const { onChange } = renderOpponentSlots();

    const pikachuCard = screen.getByLabelText("Pikachu");
    fireEvent.keyDown(pikachuCard, { key: "Delete" });

    expect(onChange).toHaveBeenCalledWith([mockOpponents[1]]);
  });
});
