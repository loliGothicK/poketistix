"use client";

import { Box, Chip, Stack, Typography } from "@mui/material";
import { LocalizedLink as Link } from "@/components/client/LocalizedLink";

export type BlogListItem = {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly tags: readonly string[];
  readonly draft?: boolean;
};

export function BlogList({ posts }: { readonly posts: readonly BlogListItem[] }) {
  return (
    <Stack spacing={3}>
      {posts.map((post) => (
        <Box
          key={post.slug}
          component={Link}
          href={`/blog/${post.slug}`}
          sx={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            border: "1px solid",
            borderColor: "divider",
            transition: "border-color 0.2s ease",
            "&:hover": { borderColor: "primary.main" },
            borderRadius: "14px",
            py: 3,
            px: { xs: 3, sm: 4 },
          }}
        >
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="overline" color="text.secondary">
                {new Date(post.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </Typography>
              {post.draft ? (
                <Chip
                  label="Draft"
                  color="warning"
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: "0.7rem", fontWeight: 600 }}
                />
              ) : null}
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {post.title}
            </Typography>
            <Typography color="text.secondary">{post.description}</Typography>
            {post.tags.length > 0 ? (
              <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
                {post.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" />
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Box>
      ))}
      {posts.length === 0 ? <Typography color="text.secondary">No posts yet.</Typography> : null}
    </Stack>
  );
}
