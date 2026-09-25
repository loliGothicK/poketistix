"use client";

import { useMemo } from "react";
import { Box, SxProps, Theme, useTheme } from "@mui/material";
import { marked } from "marked";
import parse from "html-react-parser";

interface Props {
  readonly content?: string;
  readonly sx?: SxProps<Theme>;
}

export function MarkdownView({ content, sx }: Props) {
  const theme = useTheme();

  const rendered = useMemo(() => {
    if (!content || !content.trim()) return null;
    try {
      const html = marked.parse(content, {
        async: false,
        breaks: true,
        gfm: true,
      }) as string;
      return parse(html);
    } catch {
      return content;
    }
  }, [content]);

  if (!rendered) return null;

  return (
    <Box
      sx={[
        {
          fontSize: { xs: "0.88rem", md: "0.93rem" },
          lineHeight: 1.65,
          color: "text.primary",
          wordBreak: "break-word",
          "& p": {
            margin: "0 0 0.5rem 0",
            "&:last-child": {
              mb: 0,
            },
          },
          "& h1": {
            fontSize: "1.25rem",
            fontWeight: 800,
            margin: "0.85rem 0 0.35rem 0",
            lineHeight: 1.3,
          },
          "& h2": {
            fontSize: "1.1rem",
            fontWeight: 700,
            margin: "0.75rem 0 0.3rem 0",
            lineHeight: 1.3,
          },
          "& h3": {
            fontSize: "1rem",
            fontWeight: 700,
            margin: "0.6rem 0 0.25rem 0",
            lineHeight: 1.3,
          },
          "& ul, & ol": {
            paddingLeft: "1.35rem",
            margin: "0.25rem 0 0.5rem 0",
          },
          "& li": {
            margin: "0.15rem 0",
          },
          "& blockquote": {
            borderLeft: `3px solid ${theme.palette.divider}`,
            paddingLeft: "0.85rem",
            margin: "0.5rem 0",
            color: "text.secondary",
            fontStyle: "italic",
          },
          "& code": {
            bgcolor: "action.hover",
            borderRadius: 0.5,
            px: 0.5,
            py: 0.1,
            fontFamily: "monospace",
            fontSize: "0.85em",
          },
          "& pre": {
            bgcolor: "background.paperTint",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            p: 1.25,
            overflowX: "auto",
            margin: "0.5rem 0",
            "& code": {
              bgcolor: "transparent",
              p: 0,
            },
          },
          '& input[type="checkbox"]': {
            accentColor: theme.palette.primary.main,
            marginRight: "0.35rem",
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {rendered}
    </Box>
  );
}
