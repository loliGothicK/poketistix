import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getDefaultStore } from "jotai";
import { ThemeProvider, createTheme } from "@mui/material";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";
import type { ComponentProps } from "react";
import type NextLink from "next/link";
import BattleAnalyticsPage from "./BattleAnalyticsPage";
import { isAuthenticatedAtom } from "@/store/auth";
import { localTeamsAtom, type Team, type TrainedPokemon } from "@/store/team/team";
import type { BattleRecord, Season } from "@/store/battle-record/battleRecord";

vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "ja" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
  usePathname: () => "/ja/battle-analytics",
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: Pick<ComponentProps<typeof NextLink>, "href" | "children">) => (
    <a href={typeof href === "string" ? href : "#"}>{children}</a>
  ),
}));

const theme = createTheme();
const store = getDefaultStore();

const pokemonA = { identifier: "garchomp", boxId: "p1" } as unknown as TrainedPokemon;
const teamA: Team = {
  id: "team-a",
  name: "Chomp Core",
  members: [pokemonA, null, null, null, null, null],
};

const season1: Season = {
  id: "season-1",
  name: "Season 1",
  format: "doubles",
  ruleMark: null,
  startedAt: null,
  endedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const records: BattleRecord[] = [
  {
    id: "rec-1",
    seasonId: "season-1",
    teamId: "team-a",
    result: "win",
    myTeam: [pokemonA],
    mySelection: [0],
    rating: 1500,
    notes: null,
    tags: [],
    playedAt: new Date().toISOString(),
    opponents: [
      {
        slotIndex: 0,
        pokemonSlug: "flutter-mane",
        itemSlug: null,
        abilitySlug: null,
        moves: null,
        selectionRole: null,
        notes: null,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const jsonResponse = (data: unknown) =>
  Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  });
}

function renderPage(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider theme={theme}>
          <BattleAnalyticsPage />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("BattleAnalyticsPage", () => {
  beforeEach(async () => {
    store.set(isAuthenticatedAtom, true);
    store.set(localTeamsAtom, [teamA]);
    await i18n.init({
      lng: "ja",
      fallbackLng: "ja",
      resources: {
        ja: {
          translation: {
            "auth.loginRequired": "ログインが必要です",
            "battleRecord.analytics.title": "対戦分析",
            "battleRecord.analytics.backToRecords": "対戦記録に戻る",
            "battleRecord.analytics.winRate": "勝率",
            "battleRecord.analytics.total": "総対戦数",
            "battleRecord.result.win": "勝ち",
            "battleRecord.result.loss": "負け",
            "battleRecord.season.label": "シーズン",
            "battleRecord.season.none": "シーズンなし",
            "battleRecord.format.doubles": "ダブルバトル",
            "battleRecord.analytics.tabs.myPokemon": "使用ポケモン",
            "battleRecord.analytics.tabs.teams": "使用パーティ",
            "battleRecord.analytics.tabs.opponents": "相手ポケモン",
            "battleRecord.analytics.myPokemonTitle": "使用ポケモンの選出率・勝率",
            "battleRecord.analytics.teamsTitle": "使用パーティ別成績",
            "battleRecord.analytics.topOpponents": "対面ポケモンの勝率",
            "battleRecord.analytics.selectionRate": "選出率",
            "battleRecord.analytics.selectedWinRate": "選出時勝率",
            "battleRecord.analytics.wldShort": "{{w}}勝 {{l}}敗",
            "battleRecord.analytics.empty": "データがありません",
            "pokemon.garchomp.name": "ガブリアス",
            "pokemon.flutter-mane.name": "ハバタクカミ",
          },
        },
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : (input as URL).href;
        if (url === "/api/teams") return jsonResponse([teamA]);
        if (url === "/api/seasons") return jsonResponse([season1]);
        if (url.startsWith("/api/battle-records")) return jsonResponse(records);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  it("renders myPokemon tab by default with pokemon stats", async () => {
    const client = makeClient();
    renderPage(client);

    await waitFor(() => {
      expect(screen.getByText("使用ポケモンの選出率・勝率")).toBeDefined();
      expect(screen.getByText("ガブリアス")).toBeDefined();
    });
  });

  it("switches to teams tab and displays team stats", async () => {
    const client = makeClient();
    renderPage(client);

    await waitFor(() => {
      expect(screen.getByText("使用パーティ")).toBeDefined();
    });

    fireEvent.click(screen.getByText("使用パーティ"));

    await waitFor(() => {
      expect(screen.getByText("使用パーティ別成績")).toBeDefined();
      expect(screen.getByText("Chomp Core")).toBeDefined();
    });
  });

  it("switches to opponents tab and displays opponent stats", async () => {
    const client = makeClient();
    renderPage(client);

    await waitFor(() => {
      expect(screen.getByText("相手ポケモン")).toBeDefined();
    });

    fireEvent.click(screen.getByText("相手ポケモン"));

    await waitFor(() => {
      expect(screen.getByText("対面ポケモンの勝率")).toBeDefined();
      expect(screen.getByText("ハバタクカミ")).toBeDefined();
    });
  });
});
