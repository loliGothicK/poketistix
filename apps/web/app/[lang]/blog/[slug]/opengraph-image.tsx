import { OgTemplate } from "@/components/og/OgTemplate";
import { ImageResponse } from "next/og";
import { allPosts } from "content-collections";

export const alt = "Blog Post | Pokétistix";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const isDev = process.env.NODE_ENV !== "production";
const isPostVisible = (p: { readonly draft: boolean }) => isDev || !p.draft;

function getPost(slug: string, locale: string) {
  return (
    allPosts.find((post) => post.slug === slug && post.locale === locale && isPostVisible(post)) ||
    allPosts.find((post) => post.slug === slug && isPostVisible(post))
  );
}

export default async function Image({
  params,
}: {
  readonly params: Promise<{ readonly lang: string; readonly slug: string }>;
}) {
  const { lang, slug } = await params;
  const post = getPost(slug, lang);

  const title = post?.title ? `${post.title} | Pokétistix` : "Blog | Pokétistix";
  const subtitle = post?.description ?? "News, Updates & Technical Deep Dives";

  return new ImageResponse(<OgTemplate title={title} subtitle={subtitle} />, { ...size });
}
