import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import "./globals.css";
import { AppLayout } from "@/components/client/layout";
import { ContentLayoutProvider } from "@/components/client/content/ContentLayoutContext";
import { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { BASE_URL } from "@/lib/seo/metadata";

const siteName = "Pokétistix";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const isJa = lang === "ja";
  const locale = isJa ? "ja_JP" : "en_US";
  const alternateLocale = isJa ? ["en_US"] : ["ja_JP"];
  const localizedDescription = isJa
    ? "ポケモン対戦の構築・育成・ダメージ計算・対戦記録・データ分析を一元管理する次世代アナリティクスワークスペース。"
    : "The analytics workspace for Pokémon battles. Damage calculation, team building, battle records, and winrate insights.";

  return {
    metadataBase: new URL(BASE_URL),
    title: {
      default: siteName,
      template: `%s - ${siteName}`,
    },
    description: localizedDescription,
    keywords: isJa
      ? ["Pokétistix", "poketistix", "ダメージ計算", "チームビルダー", "ダブルバトル", "対戦記録"]
      : [
          "Pokétistix",
          "poketistix",
          "Pokemon damage calculator",
          "Pokemon team builder",
          "Pokemon battle records",
          "Double battle",
        ],
    openGraph: {
      title: siteName,
      description: localizedDescription,
      url: `${BASE_URL}/${lang}`,
      siteName,
      locale,
      alternateLocale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: siteName,
      description: localizedDescription,
      site: "@mitama_rs",
      creator: "@mitama_rs",
    },
    alternates: {
      canonical: `${BASE_URL}/${lang}`,
      languages: {
        ja: `${BASE_URL}/ja`,
        en: `${BASE_URL}/en`,
        "x-default": `${BASE_URL}/en`,
      },
    },
  };
}

import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { SuppressCancelation } from "@/components/client/SuppressCancelation";
export function generateStaticParams() {
  return [{ lang: "en" }, { lang: "ja" }];
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  readonly children: ReactNode;
  readonly params: Promise<{ readonly lang: string }>;
}>) {
  const { lang } = await params;

  return (
    <html lang={lang} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
        <SuppressCancelation />
        <AppRouterCacheProvider>
          <ContentLayoutProvider>
            <AppLayout lang={lang}>
              {children}
              <Analytics />
              <SpeedInsights />
            </AppLayout>
          </ContentLayoutProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
