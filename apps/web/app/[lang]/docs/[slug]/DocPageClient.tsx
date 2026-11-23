"use client";
import { useParams } from "next/navigation";
import { Box, Container, Stack, Typography } from "@mui/material";
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
import { DocsSearchBar } from "@/components/client/content/DocsSearchBar";
import { MdxPre } from "@/components/client/content/MdxCodeBlock";

const docMdxComponents = {
  pre: MdxPre,
};

type LocalizedSidebar = {
  readonly en: readonly ContentSidebarItem[];
  readonly ja: readonly ContentSidebarItem[];
};

type LocalizedContent = {
  readonly locale: string;
  readonly title: string;
  readonly description?: string;
  readonly headings: readonly TocHeading[];
  readonly mdx: string;
};

type Props = {
  readonly localizedSidebar: LocalizedSidebar;
  readonly localizedContent: readonly LocalizedContent[];
};

export function DocPageClient({ localizedSidebar, localizedContent }: Props) {
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
    { label: "Docs", href: "/docs" },
    { label: activeContent.title },
  ];

  return (
    <ContentShell
      breadcrumbs={breadcrumbs}
      hasToc
      headings={activeContent.headings}
      sidebar={
        <ContentSidebarDesktop
          items={sidebarItems}
          basePath="/docs"
          label="Docs"
          searchBar={<DocsSearchBar />}
        />
      }
      sidebarDrawer={
        <ContentSidebarMobile
          items={sidebarItems}
          basePath="/docs"
          label="Docs"
          open={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          searchBar={<DocsSearchBar />}
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
            <Typography variant="h3" sx={{ fontWeight: 800 }}>
              {activeContent.title}
            </Typography>
            {activeContent.description ? (
              <Typography color="text.secondary">{activeContent.description}</Typography>
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
              "& :not(pre) > code": {
                bgcolor: "action.hover",
                px: 0.75,
                py: 0.2,
                borderRadius: "4px",
                fontSize: "0.875em",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
              },
            }}
          >
            <MDXContent code={activeContent.mdx} components={docMdxComponents} />
          </Box>
        </Stack>
      </Container>
    </ContentShell>
  );
}
