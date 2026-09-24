"use client";
import { useParams } from "next/navigation";

import { Container, Stack, Typography } from "@mui/material";
import { useContentLayout } from "@/components/client/content/ContentLayoutContext";
import { ContentShell } from "@/components/client/content/ContentShell";
import {
  ContentSidebarDesktop,
  ContentSidebarMobile,
  type ContentSidebarItem,
} from "@/components/client/content/ContentSidebar";
import { BlogList } from "@/components/client/content/BlogList";

type BlogListItem = {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly tags: readonly string[];
  readonly draft?: boolean;
};

type LocalizedSidebar = {
  readonly en: readonly ContentSidebarItem[];
  readonly ja: readonly ContentSidebarItem[];
};

type LocalizedPosts = {
  readonly en: readonly BlogListItem[];
  readonly ja: readonly BlogListItem[];
};

type Props = {
  readonly localizedSidebar: LocalizedSidebar;
  readonly localizedPosts: LocalizedPosts;
};

export function BlogIndexClient({ localizedSidebar, localizedPosts }: Props) {
  const { isSidebarOpen, setIsSidebarOpen } = useContentLayout();

  const params = useParams();
  const lang = (params?.lang as string) || "en";
  const activeLang = lang === "ja" ? "ja" : "en";

  const sidebarItems = localizedSidebar[activeLang];
  const posts = localizedPosts[activeLang];

  return (
    <ContentShell
      breadcrumbs={[{ label: "Blog", href: "/blog" }]}
      sidebar={<ContentSidebarDesktop items={sidebarItems} basePath="/blog" label="Blog" />}
      sidebarDrawer={
        <ContentSidebarMobile
          items={sidebarItems}
          basePath="/blog"
          label="Blog"
          open={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      }
    >
      <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
        <Stack spacing={4}>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>
            Blog
          </Typography>
          <BlogList posts={posts} />
        </Stack>
      </Container>
    </ContentShell>
  );
}
