import { allDocs } from "content-collections";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocPageClient } from "./DocPageClient";
import { BASE_URL, createLocalizedMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";

type PageParams = {
  readonly lang: string;
  readonly slug: string;
};

export function generateStaticParams() {
  const slugs = new Set(allDocs.map((doc) => doc.slug));
  return Array.from(slugs).map((slug) => ({ slug }));
}

export const instant = false;

function getDoc(slug: string, locale: string) {
  return (
    allDocs.find((doc) => doc.slug === slug && doc.locale === locale) ||
    allDocs.find((doc) => doc.slug === slug)
  );
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<PageParams>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const doc = getDoc(slug, lang);
  if (!doc) {
    return {};
  }
  return createLocalizedMetadata({
    path: `/docs/${slug}`,
    lang,
    title: `${doc.title} | Pokétistix Docs`,
    description: doc.description ?? `${doc.title} documentation for Pokétistix.`,
    type: "article",
  });
}

export default async function DocPage({ params }: { readonly params: Promise<PageParams> }) {
  const { lang, slug } = await params;
  const docsForSlug = allDocs.filter((doc) => doc.slug === slug);

  if (docsForSlug.length === 0) {
    notFound();
  }

  const uniqueSlugs = Array.from(new Set(allDocs.map((d) => d.slug)));
  const sidebarItemsEn = uniqueSlugs
    .map((s) => getDoc(s, "en"))
    .filter((d) => d !== undefined)
    .sort((a, b) => a.order - b.order);
  const sidebarItemsJa = uniqueSlugs
    .map((s) => getDoc(s, "ja"))
    .filter((d) => d !== undefined)
    .sort((a, b) => a.order - b.order);

  // We map them so the client component can pick by active language
  const localizedContent = docsForSlug.map((d) => ({
    locale: d.locale,
    title: d.title,
    description: d.description,
    headings: d.headings ?? [],
    mdx: d.mdx,
  }));

  const localizedSidebar = {
    en: sidebarItemsEn.map((d) => ({
      slug: d.slug,
      title: d.title,
      description: d.description,
      group: d.group,
    })),
    ja: sidebarItemsJa.map((d) => ({
      slug: d.slug,
      title: d.title,
      description: d.description,
      group: d.group,
    })),
  };

  const docForSchema = docsForSlug.find((d) => d.locale === lang) ?? docsForSlug[0];
  const techArticleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: docForSchema.title,
    description: docForSchema.description ?? `${docForSchema.title} documentation for Pokétistix.`,
    inLanguage: lang === "ja" ? "ja-JP" : "en-US",
    url: `${BASE_URL}/${lang}/docs/${slug}`,
    author: {
      "@type": "Organization",
      name: "Pokétistix",
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Pokétistix",
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/icon.svg`,
      },
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${BASE_URL}/${lang}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: lang === "ja" ? "ドキュメント" : "Docs",
        item: `${BASE_URL}/${lang}/docs`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: docForSchema.title,
        item: `${BASE_URL}/${lang}/docs/${slug}`,
      },
    ],
  };

  return (
    <>
      <JsonLd data={techArticleJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <DocPageClient localizedSidebar={localizedSidebar} localizedContent={localizedContent} />
    </>
  );
}
