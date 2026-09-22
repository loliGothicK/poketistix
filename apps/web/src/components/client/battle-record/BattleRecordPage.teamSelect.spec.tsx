import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getDefaultStore } from "jotai";
import { ThemeProvider, createTheme } from "@mui/material";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";
import type { ComponentProps } from "react";
import type NextLink from "next/link";
import type NextImage from "next/image";
import BattleRecordPage from "@/components/client/battle-record/BattleRecordPage";
import { activeTeamIdAtom, localTeamsAtom, type Team } from "@/store/team/team";
import { isAuthenticatedAtom } from "@/store/auth";
import type { Season } from "@/store/battle-record/battleRecord";

vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "ja" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
  usePathname: () => "/ja/battle-record",
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: Pick<ComponentProps<typeof NextLink>, "href" | "children">) => (
    <a href={typeof href === "string" ? href : "#"}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: Pick<ComponentProps<typeof NextImage>, "src" | "alt">) => (
    // next/image のテスト用スタブ
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src as string} alt={alt as string} />
  ),
}));

const theme = createTheme();
const store = getDefaultStore();

const teamA: Team = { id: "team-a", name: "Team A", members: [null, null, null, null, null, null] };
const teamB: Team = { id: "team-b", name: "Team B", members: [null, null, null, null, null, null] };

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

let serverTeams: Team[] = [];
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
          <BattleRecordPage />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("BattleRecordPage team selection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    store.set(localTeamsAtom, []);
    store.set(activeTeamIdAtom, null);
    store.set(isAuthenticatedAtom, true);
    serverTeams = [{ ...teamA }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : (input as URL).href;
        if (url === "/api/teams") return jsonResponse(serverTeams);
        if (url === "/api/seasons") return jsonResponse([season1]);
        if (url.startsWith("/api/battle-records")) return jsonResponse([]);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  it("selecting a synced team sticks and does not roll back", async () => {
    await i18n.init({ lng: "en", fallbackLng: "en", resources: {} });
    const client = makeClient();
    renderPage(client);

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "battleRecord.team" })).toBeDefined();
    });

    // Sync で Team B が追加された
    await act(async () => {
      serverTeams = [{ ...teamA }, { ...teamB }];
      client.setQueryData<readonly Team[]>(["teams"], serverTeams);
    });

    const teamCombo = screen.getByRole("combobox", { name: "battleRecord.team" });
    fireEvent.mouseDown(teamCombo);
    const options = await screen.findAllByRole("option", { name: "Team B" });
    fireEvent.click(options[0]);

    await waitFor(() => {
      expect(store.get(activeTeamIdAtom)).toBe("team-b");
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(store.get(activeTeamIdAtom)).toBe("team-b");
    expect(document.querySelector('input.MuiSelect-nativeInput[value="team-b"]')).not.toBeNull();
  });

  it("does not touch a persisted selection while teams are still loading", async () => {
    await i18n.init({ lng: "en", fallbackLng: "en", resources: {} });
    // 永続化済みのつもりで先に保存済み選択を入れておく
    store.set(activeTeamIdAtom, "team-a");
    // ローカルの未同期チームだけが先に見えている状態
    store.set(localTeamsAtom, [{ ...teamB }]);

    let resolveFetch!: (value: Response) => void;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as URL).href;
      if (url === "/api/teams") {
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      }
      if (url === "/api/seasons") return jsonResponse([season1]);
      if (url.startsWith("/api/battle-records")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    });

    const client = makeClient();
    renderPage(client);

    // 読込中も保存済みの選択に手を触れない (書き戻し effect は存在しない)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(store.get(activeTeamIdAtom)).toBe("team-a");

    // サーバー応答後は A が一覧にいるので表示も A に戻る
    await act(async () => {
      resolveFetch(await jsonResponse([{ ...teamA }, { ...teamB }]));
    });
    await waitFor(() => {
      expect(document.querySelector('input.MuiSelect-nativeInput[value="team-a"]')).not.toBeNull();
    });
    expect(store.get(activeTeamIdAtom)).toBe("team-a");
  });

  it("displays the first team when the persisted id is gone, without rewriting storage", async () => {
    await i18n.init({ lng: "en", fallbackLng: "en", resources: {} });
    store.set(activeTeamIdAtom, "team-gone");
    serverTeams = [{ ...teamA }, { ...teamB }];

    const client = makeClient();
    renderPage(client);

    await waitFor(() => {
      expect(document.querySelector('input.MuiSelect-nativeInput[value="team-a"]')).not.toBeNull();
    });
    // 表示はフォールバックするが保存値は書き換えない
    expect(store.get(activeTeamIdAtom)).toBe("team-gone");
  });
});
