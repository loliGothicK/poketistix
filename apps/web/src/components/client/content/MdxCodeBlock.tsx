"use client";

import {
  isValidElement,
  useEffect,
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Check from "@mui/icons-material/Check";
import ContentCopy from "@mui/icons-material/ContentCopy";

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
}

function extractCodeMeta(children: ReactNode): { lang: string; code: string } {
  if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    const className = children.props.className ?? "";
    const match = /language-([^\s]+)/.exec(className);
    const lang = match?.[1]?.toLowerCase() ?? "";
    const code = extractText(children.props.children).replace(/\n$/, "");
    return { lang, code };
  }
  return { lang: "", code: extractText(children).replace(/\n$/, "") };
}

function MermaidDiagram({ chart }: { readonly chart: string }) {
  const theme = useTheme();
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme.palette.mode === "dark" ? "dark" : "default",
          htmlLabels: false,
          flowchart: {
            useMaxWidth: true,
            padding: 16,
          },
        });
        const renderId = `mermaid-${reactId}-${theme.palette.mode}`;
        const { svg: renderedSvg } = await mermaid.render(renderId, chart);
        if (!cancelled) {
          setSvg(renderedSvg);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [chart, reactId, theme.palette.mode]);

  if (failed) {
    return (
      <Box
        component="pre"
        sx={{
          my: 2.5,
          p: 2,
          borderRadius: "8px",
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "action.hover",
          overflowX: "auto",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
          fontSize: "0.85rem",
          lineHeight: 1.6,
        }}
      >
        {chart}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        my: 3,
        p: 2.5,
        borderRadius: "8px",
        border: "1px solid",
        borderColor: "divider",
        bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
        overflowX: "auto",
        display: "flex",
        justifyContent: "center",
        minHeight: 80,
        "& svg": {
          maxWidth: "100%",
          height: "auto",
        },
        "& p": {
          m: 0,
          lineHeight: 1.4,
        },
        "& .nodeLabel, & .edgeLabel": {
          whiteSpace: "nowrap",
        },
      }}
    >
      {svg ? (
        <Box
          sx={{ width: "100%", display: "flex", justifyContent: "center" }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
          Rendering diagram...
        </Typography>
      )}
    </Box>
  );
}

export function MdxPre({ children, ...rest }: ComponentPropsWithoutRef<"pre">) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const { lang, code } = extractCodeMeta(children);

  if (lang === "mermaid") {
    return <MermaidDiagram chart={code} />;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  const isDark = theme.palette.mode === "dark";
  const displayLang = lang && lang !== "text" && lang !== "plaintext" ? lang.toUpperCase() : "CODE";

  return (
    <Box
      sx={{
        my: 2.5,
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid",
        borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)",
        bgcolor: isDark ? "#0d1117" : "#161b22",
        color: "#e6edf3",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 0.75,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          bgcolor: "rgba(255,255,255,0.04)",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "rgba(230,237,243,0.72)",
            fontSize: "0.7rem",
          }}
        >
          {displayLang}
        </Typography>
        <Tooltip title={copied ? "Copied!" : "Copy"}>
          <IconButton
            size="small"
            onClick={() => void handleCopy()}
            aria-label="Copy code"
            sx={{ color: "rgba(230,237,243,0.72)", "&:hover": { color: "#fff" } }}
          >
            {copied ? <Check sx={{ fontSize: 15 }} /> : <ContentCopy sx={{ fontSize: 15 }} />}
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        component="pre"
        {...rest}
        sx={{
          m: 0,
          p: 2,
          overflowX: "auto",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
          fontSize: "0.85rem",
          lineHeight: 1.65,
          tabSize: 2,
          color: "#e6edf3",
          "& code": {
            bgcolor: "transparent",
            p: 0,
            borderRadius: 0,
            fontSize: "inherit",
            fontFamily: "inherit",
            color: "inherit",
            whiteSpace: "pre",
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
