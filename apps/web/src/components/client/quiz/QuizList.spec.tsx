import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";
import jaTranslation from "@locales/ja/translation.json";
import { QuizList } from "@/components/client/quiz/QuizList";
import type { QuizQuestion } from "@/types/quiz";

vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "ja" }),
}));

vi.mock("@content-collections/mdx/react", () => ({
  MDXContent: ({ code }: { code: string }) => <div data-testid="mdx-content">{code}</div>,
}));

const testI18n = i18next.createInstance();
await testI18n.init({
  lng: "ja",
  fallbackLng: "ja",
  resources: {
    ja: { translation: jaTranslation },
  },
  interpolation: { escapeValue: false },
});

const theme = createTheme();

const SAMPLE_QUESTIONS: readonly QuizQuestion[] = [
  {
    id: "basics-weather",
    difficulty: "basics",
    category: "academic",
    format: "choices",
    question: "天候「にほんばれ」のとき、ほのおタイプの技の威力は何倍になるか？",
    options: ["1.5倍", "1.3倍", "2.0倍", "1.2倍"],
    correctAnswerIndex: 0,
    content: "にほんばれ中はほのおタイプの技の威力が1.5倍になります。",
    mdx: "EXPLANATION_SUN",
    locale: "ja",
  },
  {
    id: "expert-priority-order",
    difficulty: "expert",
    category: "academic",
    format: "ordering",
    question: "次の技を優先度が高い順に並べ替えよ。",
    options: ["ねこだまし", "しんそく", "アクアジェット", "まもる"],
    correctOrderIndices: [3, 0, 1, 2],
    content: "まもる(+4) > ねこだまし(+3) > しんそく(+2) > アクアジェット(+1)",
    mdx: "EXPLANATION_ORDER",
    locale: "ja",
  },
  {
    id: "master-contact-grouping",
    difficulty: "master",
    category: "academic",
    format: "grouping",
    question: "次の技を接触技と非接触技に分類せよ。",
    options: ["くさむすび", "サイコカッター", "ドレインキッス"],
    correctGroups: {
      接触技: ["くさむすび", "ドレインキッス"],
      非接触技: ["サイコカッター"],
    },
    content: "くさむすびとドレインキッスは接触技、サイコカッターは非接触技です。",
    mdx: "EXPLANATION_GROUPING",
    locale: "ja",
  },
];

function renderQuizList(questions: readonly QuizQuestion[] = SAMPLE_QUESTIONS) {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={testI18n}>
        <QuizList questions={questions} />
      </I18nextProvider>
    </ThemeProvider>,
  );
}

describe("QuizList", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all questions with answers hidden by default", () => {
    renderQuizList();

    expect(screen.getByText(/にほんばれ/)).toBeTruthy();
    expect(screen.getByText(/優先度が高い順/)).toBeTruthy();
    expect(screen.getByText(/接触技と非接触技/)).toBeTruthy();
    expect(screen.queryByTestId("mdx-content")).toBeNull();
  });

  it("reveals and hides individual question answers and explanations", async () => {
    renderQuizList();

    const showButtons = screen.getAllByRole("button", { name: "答え・解説を見る" });
    expect(showButtons).toHaveLength(3);

    fireEvent.click(showButtons[0]);
    expect(screen.getByText("EXPLANATION_SUN")).toBeTruthy();

    const hideButton = screen.getByRole("button", { name: "答え・解説を隠す" });
    fireEvent.click(hideButton);
    await waitFor(() => {
      expect(screen.queryByText("EXPLANATION_SUN")).toBeNull();
    });
  });

  it("supports bulk reveal and hide of all filtered questions", async () => {
    renderQuizList();

    fireEvent.click(screen.getByRole("button", { name: "すべて答えを見る" }));
    expect(screen.getByText("EXPLANATION_SUN")).toBeTruthy();
    expect(screen.getByText("EXPLANATION_ORDER")).toBeTruthy();
    expect(screen.getByText("EXPLANATION_GROUPING")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "すべて答えを隠す" }));
    await waitFor(() => {
      expect(screen.queryAllByTestId("mdx-content")).toHaveLength(0);
    });
  });

  it("filters questions by difficulty and search keyword", () => {
    renderQuizList();

    fireEvent.click(screen.getByRole("button", { name: /エキスパート級/ }));
    expect(screen.queryByText(/にほんばれ/)).toBeNull();
    expect(screen.getByText(/優先度が高い順/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /すべて \(3\)/ }));
    const searchInput = screen.getByPlaceholderText("問題文・選択肢・解説を検索...");
    fireEvent.change(searchInput, { target: { value: "くさむすび" } });
    expect(screen.getByText(/接触技と非接触技/)).toBeTruthy();
    expect(screen.queryByText(/にほんばれ/)).toBeNull();
  });
});
