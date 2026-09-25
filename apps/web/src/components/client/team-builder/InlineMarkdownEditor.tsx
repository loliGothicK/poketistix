"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent, Extension, InputRule } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import { Box, Stack, IconButton, Tooltip, Divider, useTheme, Typography } from "@mui/material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import TitleIcon from "@mui/icons-material/Title";
import CodeIcon from "@mui/icons-material/Code";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";

/**
 * タスクリスト（チェックボックス）の仕様拡張:
 * - デフォルトの tight 属性を付与し、Markdown 出力時に不要な空行（\n\n）を防止
 */
const CustomTaskList = TaskList.extend({
  addAttributes() {
    return {
      tight: {
        default: true,
        parseHTML: () => true,
        renderHTML: () => ({ "data-tight": "true" }),
      },
    };
  },
});

/**
 * タスク項目の仕様拡張:
 * - デフォルトの wrappingInputRule が bulletList 内で多重ネストを引き起こすのを防ぐため、
 *   インプットルールは TaskListInputRule に一元化
 */
const CustomTaskItem = TaskItem.extend({
  addInputRules() {
    return [];
  },
});

/**
 * 入力ルール拡張:
 * 1. 通常行での `[ ] ` や `- [ ] ` 入力時にタスクリストへ即時変換
 * 2. 箇条書きリスト内（`- ` を入力した直後など）にいる状態で `[ ] ` や `[x] ` を入力した際も
 *    箇条書きリストからリフトしてシームレスにタスクリストへ切り替え、不要な改行やネストを防ぐ
 */
const TaskListInputRule = Extension.create({
  name: "taskListInputRule",
  addInputRules() {
    return [
      new InputRule({
        find: /^\s*([-+*]\s*)?\[([ xX])?\]\s$/,
        handler: ({ range, match, chain, can }) => {
          const checked = match[2]?.toLowerCase() === "x";
          const isInsideListItem =
            this.editor.isActive("listItem") || can().liftListItem("listItem");
          const isInsideTaskItem =
            this.editor.isActive("taskItem") || can().liftListItem("taskItem");

          if (isInsideListItem) {
            chain()
              .command(({ tr }) => {
                tr.delete(range.from, range.to);
                return true;
              })
              .liftListItem("listItem")
              .wrapInList("taskList")
              .command(({ commands }) => {
                if (checked) {
                  commands.updateAttributes("taskItem", { checked: true });
                }
                return true;
              })
              .run();
          } else if (!isInsideTaskItem) {
            chain()
              .command(({ tr }) => {
                tr.delete(range.from, range.to);
                return true;
              })
              .wrapInList("taskList")
              .command(({ commands }) => {
                if (checked) {
                  commands.updateAttributes("taskItem", { checked: true });
                }
                return true;
              })
              .run();
          } else {
            chain()
              .command(({ tr }) => {
                tr.delete(range.from, range.to);
                return true;
              })
              .command(({ commands }) => {
                if (checked) {
                  commands.updateAttributes("taskItem", { checked: true });
                }
                return true;
              })
              .run();
          }
        },
      }),
    ];
  },
});

/**
 * タスクリスト内のキーボード操作拡張:
 * - テキストがあるタスク項目で Enter を押すと新しいタスク項目を作成
 * - 空のタスク項目で Enter または Backspace を押すとタスクリストから抜け出して通常の段落へ移行する
 */
const TaskItemKeymap = Extension.create({
  name: "taskItemKeymap",
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!editor.isActive("taskItem")) {
          return false;
        }
        const { selection } = editor.state;
        const { $from } = selection;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === "taskItem") {
            if (node.textContent.trim() === "") {
              return editor.commands.liftListItem("taskItem");
            }
            return editor.commands.splitListItem("taskItem");
          }
        }
        return false;
      },
      Backspace: ({ editor }) => {
        if (!editor.isActive("taskItem")) {
          return false;
        }
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (empty && $from.parentOffset === 0 && $from.parent.textContent.trim() === "") {
          return editor.commands.liftListItem("taskItem");
        }
        return false;
      },
    };
  },
});

/**
 * 空のチェックリスト（`- [ ]` や `- [x]` の直後に文字が入力されていない状態）でも
 * markdown-it が箇条書きテキストとして誤判定せず、確実に taskList / taskItem として復元できるようにするプラグイン
 */
const RobustTaskLists = Extension.create({
  name: "robustTaskLists",
  addStorage() {
    return {
      markdown: {
        parse: {
          updateDOM(element: HTMLElement) {
            element.querySelectorAll("li").forEach((item) => {
              const text = item.textContent || "";
              const match = text.match(/^\s*\[([ xX])?\]\s*(.*)$/);
              if (match) {
                item.setAttribute("data-type", "taskItem");
                item.setAttribute("data-checked", String(match[1]?.toLowerCase() === "x"));
                const parentUl = item.closest("ul");
                if (parentUl) {
                  parentUl.setAttribute("data-type", "taskList");
                }
                const doc = item.ownerDocument ?? document;
                const walker = doc.createTreeWalker(item, 4 /* NodeFilter.SHOW_TEXT */);
                let textNode = walker.nextNode() as Text | null;
                while (textNode) {
                  const m = textNode.nodeValue?.match(/^\s*\[([ xX])?\]\s*/);
                  if (m) {
                    textNode.nodeValue = textNode.nodeValue?.slice(m[0].length) ?? "";
                    break;
                  }
                  textNode = walker.nextNode() as Text | null;
                }
              }
            });
            // 既存の tiptap-markdown クラスも確実に属性へ反映
            element.querySelectorAll("li.task-list-item").forEach((item) => {
              item.setAttribute("data-type", "taskItem");
              const input = item.querySelector("input");
              if (input) {
                item.setAttribute("data-checked", String(input.checked));
                input.remove();
              }
            });
            element.querySelectorAll("ul.contains-task-list").forEach((list) => {
              list.setAttribute("data-type", "taskList");
            });
          },
        },
      },
    };
  },
});

interface Props {
  readonly value: string;
  readonly onChange: (markdown: string) => void;
  readonly placeholder?: string;
  readonly minHeight?: number | string;
  readonly isMobile?: boolean;
}

export function InlineMarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = 360,
  isMobile = false,
}: Props) {
  const theme = useTheme();
  const lastEmittedValue = useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        trailingNode: false,
        heading: {
          levels: [1, 2, 3],
        },
      }),
      CustomTaskList,
      CustomTaskItem.configure({
        nested: true,
        HTMLAttributes: {
          "data-type": "taskItem",
        },
      }),
      TaskListInputRule,
      TaskItemKeymap,
      RobustTaskLists,
      Placeholder.configure({
        placeholder: placeholder ?? "",
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        tightListClass: "tight",
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const markdownStorage = editor.storage as unknown as {
        markdown?: { getMarkdown: () => string };
      };
      const current = markdownStorage.markdown?.getMarkdown() ?? editor.getText();
      lastEmittedValue.current = current;
      onChange(current);
    },
  });

  // 外部からの更新（チーム切替やリビジョン復元）があった場合のみ内容を同期する
  useEffect(() => {
    if (!editor) return;
    // ユーザー自身が編集中の場合は外部同期によるカーソルリセットを防ぐ
    if (editor.isFocused) return;

    const markdownStorage = editor.storage as unknown as {
      markdown?: { getMarkdown: () => string };
    };
    const current = markdownStorage.markdown?.getMarkdown() ?? editor.getText();
    if (value.trim() !== current.trim() && value.trim() !== lastEmittedValue.current.trim()) {
      lastEmittedValue.current = value;
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        bgcolor: "background.paperTint",
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
        "&:focus-within": {
          borderColor: "primary.main",
          boxShadow: `0 0 0 1px ${theme.palette.primary.main}`,
        },
      }}
    >
      {/* ── クイック装飾ツールバー ── */}
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          flexWrap: "wrap",
          px: 1,
          py: 0.5,
          gap: 0.5,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Tooltip title="見出し (H2: ## )">
          <span>
            <IconButton
              size="small"
              disabled={!editor}
              color={editor?.isActive("heading", { level: 2 }) ? "primary" : "default"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              aria-label="heading-2"
            >
              <TitleIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="太字 (**太字**)">
          <span>
            <IconButton
              size="small"
              disabled={!editor}
              color={editor?.isActive("bold") ? "primary" : "default"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              aria-label="bold"
            >
              <FormatBoldIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="斜体 (*斜体*)">
          <span>
            <IconButton
              size="small"
              disabled={!editor}
              color={editor?.isActive("italic") ? "primary" : "default"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              aria-label="italic"
            >
              <FormatItalicIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

        <Tooltip title="箇条書きリスト (- )">
          <span>
            <IconButton
              size="small"
              disabled={!editor}
              color={editor?.isActive("bulletList") ? "primary" : "default"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!editor) return;
                if (editor.isActive("taskItem")) {
                  editor.chain().focus().liftListItem("taskItem").wrapInList("bulletList").run();
                } else {
                  editor.chain().focus().toggleBulletList().run();
                }
              }}
              aria-label="bullet-list"
            >
              <FormatListBulletedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="番号付きリスト (1. )">
          <span>
            <IconButton
              size="small"
              disabled={!editor}
              color={editor?.isActive("orderedList") ? "primary" : "default"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!editor) return;
                if (editor.isActive("taskItem")) {
                  editor.chain().focus().liftListItem("taskItem").wrapInList("orderedList").run();
                } else {
                  editor.chain().focus().toggleOrderedList().run();
                }
              }}
              aria-label="ordered-list"
            >
              <FormatListNumberedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="チェックリスト (- [ ])">
          <span>
            <IconButton
              size="small"
              disabled={!editor}
              color={editor?.isActive("taskList") ? "primary" : "default"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!editor) return;
                if (editor.isActive("listItem")) {
                  editor.chain().focus().liftListItem("listItem").wrapInList("taskList").run();
                } else {
                  editor.chain().focus().toggleTaskList().run();
                }
              }}
              aria-label="task-list"
            >
              <CheckBoxOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

        <Tooltip title="引用 (> )">
          <span>
            <IconButton
              size="small"
              disabled={!editor}
              color={editor?.isActive("blockquote") ? "primary" : "default"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              aria-label="blockquote"
            >
              <FormatQuoteIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="コード (`コード`)">
          <span>
            <IconButton
              size="small"
              disabled={!editor}
              color={editor?.isActive("code") ? "primary" : "default"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().toggleCode().run()}
              aria-label="code"
            >
              <CodeIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title="元に戻す (Ctrl+Z)">
          <span>
            <IconButton
              size="small"
              disabled={!editor || !editor.can().undo()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().undo().run()}
              aria-label="undo"
            >
              <UndoIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="やり直し (Ctrl+Y)">
          <span>
            <IconButton
              size="small"
              disabled={!editor || !editor.can().redo()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().redo().run()}
              aria-label="redo"
            >
              <RedoIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* ── エディタ編集エリア ── */}
      <Box
        sx={{
          minHeight,
          maxHeight: isMobile ? 420 : 600,
          overflowY: "auto",
          p: { xs: 1.5, md: 2 },
          cursor: "text",
          "& .ProseMirror": {
            minHeight: `calc(${typeof minHeight === "number" ? `${minHeight}px` : minHeight} - 32px)`,
            outline: "none",
            fontSize: { xs: "0.9rem", md: "0.95rem" },
            lineHeight: 1.65,
            color: "text.primary",
            fontFamily: "inherit",
          },
          "& .ProseMirror p": {
            margin: "0 0 0.5rem 0",
          },
          "& .ProseMirror h1": {
            fontSize: "1.35rem",
            fontWeight: 800,
            margin: "1rem 0 0.5rem 0",
            lineHeight: 1.3,
          },
          "& .ProseMirror h2": {
            fontSize: "1.15rem",
            fontWeight: 700,
            margin: "0.85rem 0 0.4rem 0",
            lineHeight: 1.3,
          },
          "& .ProseMirror h3": {
            fontSize: "1.02rem",
            fontWeight: 700,
            margin: "0.7rem 0 0.35rem 0",
            lineHeight: 1.3,
          },
          "& .ProseMirror ul, & .ProseMirror ol": {
            paddingLeft: "1.35rem",
            margin: "0.25rem 0 0.5rem 0",
          },
          "& .ProseMirror li": {
            margin: "0.15rem 0",
          },
          // タスクリスト（チェックボックス）
          '& .ProseMirror ul[data-type="taskList"]': {
            listStyle: "none",
            paddingLeft: 0,
            margin: "0.25rem 0 0.5rem 0",
          },
          '& .ProseMirror ul[data-type="taskList"] li, & .ProseMirror li[data-type="taskItem"], & .ProseMirror li[data-checked]':
            {
              display: "flex",
              alignItems: "center",
              margin: "0.15rem 0",
              "& > label": {
                userSelect: "none",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: "1.65rem",
                mr: 1,
                flexShrink: 0,
              },
              '& > label input[type="checkbox"]': {
                cursor: "pointer",
                accentColor: theme.palette.primary.main,
                width: 16,
                height: 16,
                margin: 0,
              },
              "& > div": {
                flex: "1 1 auto",
                minWidth: 0,
                cursor: "text",
                "& > p": {
                  margin: 0,
                  lineHeight: 1.65,
                  width: "100%",
                },
              },
            },
          "& .ProseMirror blockquote": {
            borderLeft: `3px solid ${theme.palette.divider}`,
            paddingLeft: "0.85rem",
            margin: "0.5rem 0",
            color: "text.secondary",
            fontStyle: "italic",
          },
          "& .ProseMirror code": {
            bgcolor: "action.hover",
            borderRadius: 0.5,
            px: 0.5,
            py: 0.1,
            fontFamily: "monospace",
            fontSize: "0.85em",
          },
          "& .ProseMirror pre": {
            bgcolor: "background.paper",
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
          // プレースホルダーのスタイル
          "& .ProseMirror p.is-editor-empty:first-of-type::before": {
            content: "attr(data-placeholder)",
            float: "left",
            color: "text.disabled",
            pointerEvents: "none",
            height: 0,
          },
        }}
        onClick={(e) => {
          // エディタ外の余白部分をクリックした時のみ末尾にフォーカス
          if (e.target === e.currentTarget && editor) {
            editor.commands.focus("end");
          }
        }}
      >
        <EditorContent editor={editor} />
      </Box>

      {/* ── フッターヒント ── */}
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "center",
          px: 1.5,
          py: 0.5,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.72rem" }}>
          Markdown（# 見出し、- リスト、- [ ] タスク、**太字**）
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.72rem" }}>
          {`${(value ?? "").length} chars`}
        </Typography>
      </Stack>
    </Box>
  );
}
