"use client";
import { useParams } from "next/navigation";

import { Box, Chip, Container, Stack, Typography } from "@mui/material";
import { MDXContent } from "@content-collections/mdx/react";
import { useContentLayout } from "@/components/client/content/ContentLayoutContext";
import { ContentShell } from "@/components/client/content/ContentShell";
import {
  ContentSidebarDesktop,
  ContentSidebarMobile,
  type ContentSidebarItem,
} from "@/components/client/content/ContentSidebar";
import {
  TableOfContentsDesktop,
  TableOfContentsBottomSheet,
  type TocHeading,
} from "@/components/client/content/TableOfContents";
import type { BreadcrumbItem } from "@/components/client/content/ContentLayoutContext";
import {
  FeedbackBadge,
  FeedbackCard,
  FeedbackItem,
  FeedbackMessage,
  FeedbackReply,
} from "@/components/client/content/FeedbackCard";

const mdxComponents = {
  FeedbackCard,
  FeedbackMessage,
  FeedbackReply,
  FeedbackResponse: FeedbackReply,
  FeedbackBadge,
  FeedbackStatusBadge: FeedbackBadge,
  FeedbackItem,
};

type LocalizedSidebar = {
  readonly en: readonly ContentSidebarItem[];
  readonly ja: readonly ContentSidebarItem[];
};

type LocalizedContent = {
  readonly locale: string;
  readonly title: string;
  readonly description?: string;
  readonly date: string;
  readonly tags: readonly string[];
  readonly draft?: boolean;
  readonly headings: readonly TocHeading[];
  readonly mdx: string;
};

type Props = {
  readonly localizedSidebar: LocalizedSidebar;
  readonly localizedContent: readonly LocalizedContent[];
};

export function BlogPostClient({ localizedSidebar, localizedContent }: Props) {
  const { isSidebarOpen, setIsSidebarOpen, isTocOpen, setIsTocOpen } = useContentLayout();

  const params = useParams();
  const lang = (params?.lang as string) || "en";
  const activeLang = lang === "ja" ? "ja" : "en";

  const sidebarItems = localizedSidebar[activeLang];
  const activeContent =
    localizedContent.find((c) => c.locale === activeLang) ||
    localizedContent.find((c) => c.locale === "ja");

  if (!activeContent) return null;

  const breadcrumbs: readonly BreadcrumbItem[] = [
    { label: "Blog", href: "/blog" },
    { label: activeContent.title },
  ];

  return (
    <ContentShell
      breadcrumbs={breadcrumbs}
      hasToc
      headings={activeContent.headings}
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
      toc={<TableOfContentsDesktop headings={activeContent.headings} />}
      tocBottomSheet={
        <TableOfContentsBottomSheet
          headings={activeContent.headings}
          open={isTocOpen}
          onClose={() => setIsTocOpen(false)}
        />
      }
    >
      <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
        <Stack spacing={4}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="overline" color="text.secondary">
                {new Date(activeContent.date).toLocaleDateString(
                  activeLang === "ja" ? "ja-JP" : "en-US",
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  },
                )}
              </Typography>
              {activeContent.draft ? (
                <Chip
                  label="Draft"
                  color="warning"
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: "0.7rem", fontWeight: 600 }}
                />
              ) : null}
            </Stack>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>
              {activeContent.title}
            </Typography>
            {activeContent.tags.length > 0 ? (
              <Stack direction="row" spacing={1}>
                {activeContent.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" />
                ))}
              </Stack>
            ) : null}
          </Stack>
          <Box
            sx={{
              "& h2": { mt: 4, mb: 2, fontWeight: 700, scrollMarginTop: "80px" },
              "& h3": { mt: 3, mb: 1.5, fontWeight: 700, scrollMarginTop: "80px" },
              "& p": { mb: 2, lineHeight: 1.8 },
              "& ul, & ol": { mb: 2, pl: 3 },
              "& table": { width: "100%", borderCollapse: "collapse", mb: 2 },
              "& th, & td": {
                border: "1px solid",
                borderColor: "divider",
                px: 2,
                py: 1,
                textAlign: "left",
              },
              "& th": { bgcolor: "action.hover", fontWeight: 700 },
              "& blockquote": {
                borderLeft: "4px solid",
                borderColor: "primary.main",
                pl: 2,
                ml: 0,
                color: "text.secondary",
              },
              "& code": {
                bgcolor: "action.hover",
                px: 0.5,
                py: 0.25,
                borderRadius: 1,
                fontSize: "0.875em",
              },
            }}
          >
            <MDXContent code={activeContent.mdx} components={mdxComponents} />
          </Box>
        </Stack>
      </Container>
    </ContentShell>
  );
}
