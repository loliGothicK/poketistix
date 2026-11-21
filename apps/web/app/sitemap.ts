import type { MetadataRoute } from "next";
import { allDocs, allPosts } from "content-collections";
import { BASE_URL } from "@/lib/seo/metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: readonly {
    readonly path: string;
    readonly changeFrequency:
      | "always"
      | "hourly"
      | "daily"
      | "weekly"
      | "monthly"
      | "yearly"
      | "never";
    readonly priority: number;
  }[] = [
    { path: "", changeFrequency: "daily", priority: 1.0 },
    { path: "/damage-calc", changeFrequency: "weekly", priority: 0.9 },
    { path: "/team-builder", changeFrequency: "weekly", priority: 0.9 },
    { path: "/quiz", changeFrequency: "daily", priority: 0.85 },
    { path: "/quiz/list", changeFrequency: "daily", priority: 0.8 },
    { path: "/battle-analytics", changeFrequency: "weekly", priority: 0.75 },
    { path: "/battle-record", changeFrequency: "weekly", priority: 0.7 },
    { path: "/box", changeFrequency: "weekly", priority: 0.7 },
    { path: "/blog", changeFrequency: "daily", priority: 0.8 },
    { path: "/docs", changeFrequency: "weekly", priority: 0.8 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  ];

  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  // Static Routes for all supported languages
  for (const route of staticRoutes) {
    for (const lang of ["ja", "en"] as const) {
      entries.push({
        url: `${BASE_URL}/${lang}${route.path}`,
        lastModified: now,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: {
          languages: {
            ja: `${BASE_URL}/ja${route.path}`,
            en: `${BASE_URL}/en${route.path}`,
          },
        },
      });
    }
  }

  // Published Blog Posts
  const publishedPosts = allPosts.filter((post) => !post.draft);
  for (const post of publishedPosts) {
    const hasOtherLocale = publishedPosts.some(
      (p) => p.slug === post.slug && p.locale !== post.locale,
    );
    entries.push({
      url: `${BASE_URL}/${post.locale}/blog/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: "monthly",
      priority: 0.75,
      ...(hasOtherLocale
        ? {
            alternates: {
              languages: {
                ja: `${BASE_URL}/ja/blog/${post.slug}`,
                en: `${BASE_URL}/en/blog/${post.slug}`,
              },
            },
          }
        : {}),
    });
  }

  // Documentation Pages
  for (const doc of allDocs) {
    const hasOtherLocale = allDocs.some((d) => d.slug === doc.slug && d.locale !== doc.locale);
    entries.push({
      url: `${BASE_URL}/${doc.locale}/docs/${doc.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
      ...(hasOtherLocale
        ? {
            alternates: {
              languages: {
                ja: `${BASE_URL}/ja/docs/${doc.slug}`,
                en: `${BASE_URL}/en/docs/${doc.slug}`,
              },
            },
          }
        : {}),
    });
  }

  return entries;
}
