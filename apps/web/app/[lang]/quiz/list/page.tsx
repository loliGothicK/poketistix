import type { Metadata } from "next";
import { Box } from "@mui/material";
import { allQuizzes } from "content-collections";
import { BASE_URL, createLocalizedMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { QuizList } from "@/components/client/quiz/QuizList";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const isJa = lang === "ja";

  return createLocalizedMetadata({
    path: "/quiz/list",
    lang,
    title: isJa
      ? "ポケモンバトル検定 クイズ一覧（予習・復習） | Pokétistix"
      : "Pokémon Battle Proficiency Test - Quiz Catalog | Pokétistix",
    description: isJa
      ? "ポケモンバトル検定の全問題を難易度・出題形式・キーワードで検索し、正解と解説を一覧で確認できる予習・復習ページ。"
      : "Browse, search, and review all Pokémon Battle Proficiency Test questions with answers and detailed explanations.",
    keywords: isJa
      ? [
          "ポケモン クイズ 一覧",
          "ポケモン バトル 検定 予習",
          "ポケモン 対戦 仕様 復習",
          "ダブルバトル 仕様",
          "Pokétistix",
        ]
      : [
          "pokemon quiz list",
          "pokemon battle quiz study",
          "competitive pokemon mechanics",
          "vgc quiz catalog",
          "poketistix",
        ],
  });
}

export default async function QuizListPage({
  params,
}: {
  readonly params: Promise<{ readonly lang: string }>;
}) {
  const { lang } = await params;
  const activeLang = lang === "en" ? "en" : "ja";

  const questions = allQuizzes.filter((q) => q.locale === activeLang && q.category === "academic");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name:
      activeLang === "ja"
        ? "Pokétistix ポケモンバトル検定 クイズ一覧"
        : "Pokétistix Pokémon Battle Proficiency Test Quiz Catalog",
    url: `${BASE_URL}/${activeLang}/quiz/list`,
    description:
      activeLang === "ja"
        ? "ポケモンバトル検定の全問題を予習・復習できる一覧ページ。"
        : "Browse and review all competitive Pokémon mechanics quiz questions.",
  };

  return (
    <Box sx={{ minHeight: "100vh", py: 4 }}>
      <JsonLd data={jsonLd} />
      <QuizList questions={questions} />
    </Box>
  );
}
