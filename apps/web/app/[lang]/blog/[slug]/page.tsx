import { Suspense } from "react";
import { allPosts } from "content-collections";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Skeleton, Stack } from "@mui/material";
import { BlogPostClient } from "./BlogPostClient";
import { BASE_URL, createLocalizedMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";

type PageParams = {
  readonly lang: string;
  readonly slug: string;
};

const isDev = process.env.NODE_ENV !== "production";
const isPostVisible = (p: { readonly draft: boolean }) => isDev || !p.draft;

export function generateStaticParams() {
  const slugs = new Set(allPosts.filter(isPostVisible).map((post) => post.slug));
  return Array.from(slugs).map((slug) => ({ slug }));
}

function getPost(slug: string, locale: string) {
  return (
    allPosts.find((post) => post.slug === slug && post.locale === locale && isPostVisible(post)) ||
    allPosts.find((post) => post.slug === slug && isPostVisible(post))
  );
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<PageParams>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const post = getPost(slug, lang);
  if (!post) {
    return {};
  }
  return createLocalizedMetadata({
    path: `/blog/${slug}`,
    lang,
    title: `${post.title} | Pokétistix Blog`,
    description: post.description,
    keywords: post.tags,
    type: "article",
  });
}

function BlogPostSkeleton() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Skeleton variant="text" width={140} height={24} />
          <Skeleton variant="text" width="80%" height={56} />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Skeleton variant="rounded" width={64} height={32} />
            <Skeleton variant="rounded" width={80} height={32} />
          </Stack>
        </Stack>
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Skeleton variant="text" width="100%" height={24} />
          <Skeleton variant="text" width="95%" height={24} />
          <Skeleton variant="text" width="90%" height={24} />
          <Skeleton variant="rectangular" width="100%" height={240} sx={{ borderRadius: 1 }} />
          <Skeleton variant="text" width="98%" height={24} />
          <Skeleton variant="text" width="92%" height={24} />
        </Stack>
      </Stack>
    </Container>
  );
}

export default function BlogPostPage({ params }: { readonly params: Promise<PageParams> }) {
  return (
    <Suspense fallback={<BlogPostSkeleton />}>
      <BlogPostContent params={params} />
    </Suspense>
  );
}

async function BlogPostContent({ params }: { readonly params: Promise<PageParams> }) {
  const { lang, slug } = await params;
  const postsForSlug = allPosts.filter((post) => post.slug === slug && isPostVisible(post));

  if (postsForSlug.length === 0) {
    notFound();
  }

  const uniqueSlugs = Array.from(new Set(allPosts.filter(isPostVisible).map((p) => p.slug)));
  const sidebarItemsEn = uniqueSlugs
    .map((s) => getPost(s, "en"))
    .filter((p) => p !== undefined)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const sidebarItemsJa = uniqueSlugs
    .map((s) => getPost(s, "ja"))
    .filter((p) => p !== undefined)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // We map them so the client component can pick by active language
  const localizedContent = postsForSlug.map((p) => ({
    locale: p.locale,
    title: p.title,
    description: p.description,
    date: p.date.toISOString(),
    tags: p.tags,
    draft: p.draft,
    headings: p.headings ?? [],
    mdx: p.mdx,
  }));

  const localizedSidebar = {
    en: sidebarItemsEn.map((p) => ({ slug: p.slug, title: p.title, description: p.description })),
    ja: sidebarItemsJa.map((p) => ({ slug: p.slug, title: p.title, description: p.description })),
  };

  const postForSchema = postsForSlug.find((p) => p.locale === lang) ?? postsForSlug[0];
  const blogPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: postForSchema.title,
    description: postForSchema.description,
    datePublished: postForSchema.date.toISOString(),
    inLanguage: lang === "ja" ? "ja-JP" : "en-US",
    url: `${BASE_URL}/${lang}/blog/${slug}`,
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
        name: lang === "ja" ? "ブログ" : "Blog",
        item: `${BASE_URL}/${lang}/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: postForSchema.title,
        item: `${BASE_URL}/${lang}/blog/${slug}`,
      },
    ],
  };

  return (
    <>
      <JsonLd data={blogPostingJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <BlogPostClient localizedSidebar={localizedSidebar} localizedContent={localizedContent} />
    </>
  );
}
