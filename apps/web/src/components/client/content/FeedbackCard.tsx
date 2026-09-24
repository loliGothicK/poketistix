"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { Box, Chip, Link, Stack, Typography, alpha, useTheme } from "@mui/material";
import BugReportIcon from "@mui/icons-material/BugReport";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import CalculateIcon from "@mui/icons-material/Calculate";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import ScheduleIcon from "@mui/icons-material/Schedule";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PersonIcon from "@mui/icons-material/Person";
import ForumIcon from "@mui/icons-material/Forum";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

export type FeedbackCategory = "error" | "feature" | "other" | "calculation";
export type FeedbackStatus =
  | "fixed"
  | "resolved"
  | "available"
  | "in_progress"
  | "planned"
  | "considering"
  | "partially_planned";

export type FeedbackCardProps = {
  readonly title: string;
  readonly category: FeedbackCategory;
  readonly status?: FeedbackStatus;
  readonly source?: string;
  readonly children: ReactNode;
};

const CATEGORY_MAP: Record<
  string,
  {
    labelJa: string;
    labelEn: string;
    color: "error" | "primary" | "warning" | "default";
    icon: ReactNode;
  }
> = {
  error: {
    labelJa: "不具合報告",
    labelEn: "Bug Report",
    color: "error",
    icon: <BugReportIcon sx={{ fontSize: 15 }} />,
  },
  calculation: {
    labelJa: "計算・データ誤り",
    labelEn: "Data Issue",
    color: "warning",
    icon: <CalculateIcon sx={{ fontSize: 15 }} />,
  },
  feature: {
    labelJa: "機能要望",
    labelEn: "Feature Request",
    color: "primary",
    icon: <LightbulbIcon sx={{ fontSize: 15 }} />,
  },
  other: {
    labelJa: "その他",
    labelEn: "Other",
    color: "default",
    icon: <HelpOutlineIcon sx={{ fontSize: 15 }} />,
  },
};

const STATUS_MAP: Record<
  string,
  {
    labelJa: string;
    labelEn: string;
    color: "success" | "warning" | "info" | "default";
    icon: ReactNode;
  }
> = {
  fixed: {
    labelJa: "対応済み",
    labelEn: "Resolved",
    color: "success",
    icon: <CheckCircleIcon sx={{ fontSize: 15 }} />,
  },
  resolved: {
    labelJa: "対応済み",
    labelEn: "Resolved",
    color: "success",
    icon: <CheckCircleIcon sx={{ fontSize: 15 }} />,
  },
  available: {
    labelJa: "すでに可能",
    labelEn: "Already Available",
    color: "success",
    icon: <CheckCircleIcon sx={{ fontSize: 15 }} />,
  },
  in_progress: {
    labelJa: "対応中",
    labelEn: "In Progress",
    color: "warning",
    icon: <HourglassEmptyIcon sx={{ fontSize: 15 }} />,
  },
  planned: {
    labelJa: "対応予定",
    labelEn: "Planned",
    color: "info",
    icon: <ScheduleIcon sx={{ fontSize: 15 }} />,
  },
  partially_planned: {
    labelJa: "一部対応予定",
    labelEn: "Partially Planned",
    color: "info",
    icon: <ScheduleIcon sx={{ fontSize: 15 }} />,
  },
  considering: {
    labelJa: "検討中",
    labelEn: "Under Review",
    color: "default",
    icon: <VisibilityIcon sx={{ fontSize: 15 }} />,
  },
};

export function FeedbackCard({ title, category, status, source, children }: FeedbackCardProps) {
  const theme = useTheme();
  const params = useParams();
  const lang = (params?.lang as string) || "ja";
  const isJa = lang === "ja";

  const catConfig = CATEGORY_MAP[category.toLowerCase()] ?? {
    labelJa: category.toUpperCase(),
    labelEn: category.toUpperCase(),
    color: "default" as const,
    icon: <HelpOutlineIcon sx={{ fontSize: 15 }} />,
  };

  const statusConfig = status ? STATUS_MAP[status.toLowerCase()] : null;

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "14px",
        p: { xs: 2.5, sm: 3 },
        mb: 3.5,
        bgcolor: "background.paper",
        boxShadow:
          theme.palette.mode === "dark"
            ? "0 4px 20px -2px rgba(0, 0, 0, 0.45)"
            : "0 2px 10px -2px rgba(0, 0, 0, 0.05)",
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
          mb: 1.5,
        }}
      >
        <Chip
          icon={catConfig.icon as React.ReactElement}
          label={isJa ? catConfig.labelJa : catConfig.labelEn}
          color={catConfig.color}
          size="small"
          sx={{
            fontWeight: 600,
            fontSize: "0.75rem",
            borderRadius: "6px",
            height: 24,
          }}
        />
        {statusConfig ? (
          <Chip
            icon={statusConfig.icon as React.ReactElement}
            label={isJa ? statusConfig.labelJa : statusConfig.labelEn}
            color={statusConfig.color}
            variant="outlined"
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: "0.75rem",
              borderRadius: "6px",
              height: 24,
            }}
          />
        ) : null}
        {source ? (
          <Link
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            color="text.secondary"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              fontSize: "0.75rem",
              textDecoration: "none",
              ml: "auto !important",
              py: 0.25,
              px: 0.75,
              borderRadius: "6px",
              bgcolor: alpha(theme.palette.text.primary, 0.04),
              "&:hover": {
                textDecoration: "none",
                color: "primary.main",
                bgcolor: alpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            {source.replace(/^https?:\/\/[^/]+/, "") || source}
            <OpenInNewIcon sx={{ fontSize: 13 }} />
          </Link>
        ) : null}
      </Stack>

      <Typography
        variant="h5"
        component="h3"
        sx={{
          fontWeight: 700,
          letterSpacing: "-0.015em",
          mb: 2.5,
          mt: 0.5,
          fontSize: { xs: "1.2rem", sm: "1.35rem" },
        }}
      >
        {title}
      </Typography>

      <Stack spacing={2}>{children}</Stack>
    </Box>
  );
}

export type FeedbackMessageProps = {
  readonly children: ReactNode;
};

export function FeedbackMessage({ children }: FeedbackMessageProps) {
  const theme = useTheme();
  const params = useParams();
  const lang = (params?.lang as string) || "ja";
  const isJa = lang === "ja";

  return (
    <Box
      sx={{
        display: "flex",
        borderRadius: "10px",
        bgcolor: alpha(theme.palette.text.primary, 0.03),
        border: "1px solid",
        borderColor: alpha(theme.palette.divider, 0.8),
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          width: 4,
          bgcolor: alpha(theme.palette.text.secondary, 0.4),
          flexShrink: 0,
        }}
      />
      <Box sx={{ p: 2, flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1 }}>
          <PersonIcon sx={{ fontSize: 17, color: "text.secondary" }} />
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, color: "text.secondary", fontSize: "0.8rem" }}
          >
            {isJa ? "ユーザーからのフィードバック" : "User Feedback"}
          </Typography>
        </Stack>
        <Box
          sx={{
            color: "text.primary",
            fontSize: "0.925rem",
            lineHeight: 1.7,
            "& p": { m: 0, mb: 1, "&:last-child": { mb: 0 } },
            "& ul, & ol": { pl: 2.5, my: 0.5 },
            "& li": { mb: 0.75, "&:last-child": { mb: 0 } },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export type FeedbackReplyProps = {
  readonly children: ReactNode;
  readonly author?: string;
};

export function FeedbackReply({ children, author }: FeedbackReplyProps) {
  const theme = useTheme();
  const params = useParams();
  const lang = (params?.lang as string) || "ja";
  const isJa = lang === "ja";

  const defaultAuthor = isJa ? "Pokétistix 開発チームからの回答" : "Pokétistix Team Response";

  return (
    <Box
      sx={{
        borderRadius: "10px",
        bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.08 : 0.035),
        border: "1px solid",
        borderColor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.25 : 0.15),
        p: { xs: 2, sm: 2.5 },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.25 }}>
        <ForumIcon sx={{ fontSize: 18, color: "primary.main" }} />
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 700, color: "primary.main", fontSize: "0.85rem" }}
        >
          {author || defaultAuthor}
        </Typography>
      </Stack>
      <Box
        sx={{
          color: "text.primary",
          fontSize: "0.925rem",
          lineHeight: 1.75,
          "& p": { m: 0, mb: 1.25, "&:last-child": { mb: 0 } },
          "& ul, & ol": { pl: 2.5, mb: 1.25 },
          "& li": { mb: 1, "&:last-child": { mb: 0 } },
          "& code": {
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.15 : 0.08),
            color: theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
            px: 0.75,
            py: 0.25,
            borderRadius: "4px",
            fontSize: "0.85em",
            fontFamily: "monospace",
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export type FeedbackBadgeProps = {
  readonly status: FeedbackStatus;
  readonly label?: string;
  readonly size?: "small" | "medium";
};

export function FeedbackBadge({ status, label, size = "small" }: FeedbackBadgeProps) {
  const params = useParams();
  const lang = (params?.lang as string) || "ja";
  const isJa = lang === "ja";

  const config = STATUS_MAP[status.toLowerCase()];
  if (!config) return null;

  return (
    <Chip
      icon={config.icon as React.ReactElement}
      label={label || (isJa ? config.labelJa : config.labelEn)}
      color={config.color}
      variant="outlined"
      size={size}
      sx={{
        fontWeight: 600,
        fontSize: "0.75rem",
        borderRadius: "6px",
        height: 22,
        verticalAlign: "middle",
        display: "inline-flex",
        mx: 0.5,
      }}
    />
  );
}

export type FeedbackItemProps = {
  readonly title: string;
  readonly status?: FeedbackStatus;
  readonly label?: string;
  readonly children: ReactNode;
};

export function FeedbackItem({ title, status, label, children }: FeedbackItemProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        p: { xs: 1.75, sm: 2 },
        borderRadius: "8px",
        bgcolor:
          theme.palette.mode === "dark"
            ? alpha(theme.palette.common.white, 0.04)
            : alpha(theme.palette.common.black, 0.025),
        border: "1px solid",
        borderColor:
          theme.palette.mode === "dark"
            ? alpha(theme.palette.common.white, 0.08)
            : alpha(theme.palette.common.black, 0.08),
        mb: 1.5,
        "&:last-child": { mb: 0 },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
          mb: 0.75,
        }}
      >
        <Typography
          variant="subtitle2"
          component="span"
          sx={{ fontWeight: 700, fontSize: { xs: "0.9rem", sm: "0.95rem" }, color: "text.primary" }}
        >
          {title}
        </Typography>
        {status ? <FeedbackBadge status={status} label={label} /> : null}
      </Stack>
      <Box
        sx={{
          fontSize: "0.875rem",
          lineHeight: 1.75,
          color: "text.secondary",
          "& p": { m: 0, mb: 0.75, "&:last-child": { mb: 0 } },
          "& strong": { color: "text.primary", fontWeight: 700 },
          "& code": {
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.15 : 0.08),
            color: theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
            px: 0.75,
            py: 0.25,
            borderRadius: "4px",
            fontSize: "0.85em",
            fontFamily: "monospace",
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
