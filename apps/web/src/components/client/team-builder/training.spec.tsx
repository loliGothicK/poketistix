import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { createTheme } from "@mui/material";
import { Training } from "@/components/client/team-builder/training";
import type { TrainedPokemon } from "@/store/team/team";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt = "",
    width,
    height,
  }: {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
  }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} width={width} height={height} />;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      exists: () => false,
      language: "ja",
    },
  }),
}));

vi.mock("@/hooks/useActiveTeam", () => ({
  useActiveTeam: () => [
    {
      id: "team_1",
      name: "Test Team",
      members: [null, null, null, null, null, null],
    },
    vi.fn(),
  ],
}));

vi.mock("@/hooks/useBattleData", () => ({
  useBattleData: () => ({
    battleData: null,
    isError: false,
  }),
}));

vi.mock("@/components/client/team-builder/InlineMarkdownEditor", () => ({
  InlineMarkdownEditor: () => null,
}));

vi.mock("@/components/client/team-builder/MovesDrawer", () => ({
  MoveSelectionDrawer: () => null,
}));

vi.mock("@/components/client/team-builder/SurvivalTuningModal", () => ({
  SurvivalTuningModal: () => null,
}));

const theme = createTheme();

const charizardBase: TrainedPokemon = {
  boxId: "box_charizard",
  identifier: "charizard",
  slug: "charizard",
  item: 714, // charizardite-y
  ability: 66, // blaze
  gender: { fixed: false },
  nature: { plus: "spe", minus: "atk" },
  moves: [null, null, null, null],
  evs: { hp: 0, atk: 0, def: 0, spa: 32, spd: 2, spe: 32 },
};

describe("Training - Mega Evolution ability behavior", () => {
  it("switches ability to mega ability and disables editing when mega evolution is toggled on, and restores base ability when toggled off", () => {
    const onUpdate = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <Training member={charizardBase} onUpdate={onUpdate} activeTab={0} />
      </ThemeProvider>,
    );

    const abilityInput = screen.getByLabelText("teamBuilder.ability") as HTMLInputElement;

    // Before Mega Evolution: shows base ability (blaze) and is editable
    expect(abilityInput.value).toBe("abilities.blaze.name");
    expect(abilityInput.disabled).toBe(false);

    // Click Mega Evolution toggle button
    const megaButton = screen.getByAltText("Mega Evolve");
    fireEvent.click(megaButton);

    // During Mega Evolution: shows Mega Charizard Y's ability (drought) and is disabled
    expect(abilityInput.value).toBe("abilities.drought.name");
    expect(abilityInput.disabled).toBe(true);
    // Persisted base ability must not be overwritten by toggling preview
    expect(onUpdate).not.toHaveBeenCalled();

    // Toggle Mega Evolution off: restores base ability (blaze) and becomes editable again
    fireEvent.click(megaButton);
    expect(abilityInput.value).toBe("abilities.blaze.name");
    expect(abilityInput.disabled).toBe(false);
  });

  it("switches ability to mega ability and disables editing when selecting a mega stone", () => {
    const onUpdate = vi.fn();
    const charizardWithoutItem: TrainedPokemon = {
      ...charizardBase,
      item: null,
    };

    render(
      <ThemeProvider theme={theme}>
        <Training member={charizardWithoutItem} onUpdate={onUpdate} activeTab={0} />
      </ThemeProvider>,
    );

    const abilityInput = screen.getByLabelText("teamBuilder.ability") as HTMLInputElement;
    expect(abilityInput.value).toBe("abilities.blaze.name");
    expect(abilityInput.disabled).toBe(false);

    // Open item autocomplete and select charizardite-y
    const itemInput = screen.getByLabelText("teamBuilder.heldItem");
    fireEvent.mouseDown(itemInput);
    const megaStoneOption = screen.getByText("items.charizardite-y.name");
    fireEvent.click(megaStoneOption);

    // After selecting Mega Stone: Mega Evolution activates automatically, ability becomes drought & disabled
    expect(abilityInput.value).toBe("abilities.drought.name");
    expect(abilityInput.disabled).toBe(true);

    // Base ability in persisted update remains blaze (66)
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        item: 714,
        ability: 66,
      }),
    );
  });
});
