import { allPosts } from "content-collections";
import type { Metadata } from "next";
import { BlogIndexClient } from "./BlogIndexClient";

import { createLocalizedMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const isJa = lang === "ja";

  return createLocalizedMetadata({
    path: "/blog",
    lang,
    title: isJa ? "ブログ (最新機能・開発ノート) | Pokétistix" : "Blog | Pokétistix",
    description: isJa
      ? "Pokétistix の最新機能アップデート、開発ノート、対戦仕様に関する解説記事一覧。"
      : "Feature updates, release notes, and technical insights from the Pokétistix development team.",
    keywords: isJa
      ? ["Pokétistix ブログ", "ポケモン ツール アップデート", "開発ノート"]
      : ["poketistix blog", "pokemon tool updates", "release notes"],
  });
}

const isDev = process.env.NODE_ENV !== "production";
const isPostVisible = (p: { readonly draft: boolean }) => isDev || !p.draft;

export default function BlogIndexPage() {
  const uniqueSlugs = Array.from(new Set(allPosts.filter(isPostVisible).map((p) => p.slug)));

  const postsEn = uniqueSlugs
    .map((s) => allPosts.find((p) => p.slug === s && p.locale === "en" && isPostVisible(p)))
    .filter((p) => p !== undefined)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const postsJa = uniqueSlugs
    .map((s) => allPosts.find((p) => p.slug === s && p.locale === "ja" && isPostVisible(p)))
    .filter((p) => p !== undefined)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const localizedSidebar = {
    en: postsEn.map((p) => ({ slug: p.slug, title: p.title, description: p.description })),
    ja: postsJa.map((p) => ({ slug: p.slug, title: p.title, description: p.description })),
  };

  const localizedPosts = {
    en: postsEn.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      date: p.date.toISOString(),
      tags: p.tags,
      draft: p.draft,
    })),
    ja: postsJa.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      date: p.date.toISOString(),
      tags: p.tags,
      draft: p.draft,
    })),
  };

  return <BlogIndexClient localizedSidebar={localizedSidebar} localizedPosts={localizedPosts} />;
}
