"use client";

import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import QuizIcon from "@mui/icons-material/Quiz";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "react-i18next";
import { MDXContent } from "@content-collections/mdx/react";
import parse from "html-react-parser";
import { marked } from "marked";
import type { QuizDifficulty, QuizQuestion, QuizQuestionFormat } from "@/types/quiz";
import { LocalizedLink } from "@/components/client/LocalizedLink";
import { QuizApp } from "@/components/client/quiz/QuizApp";

const DIFFICULTIES: readonly { readonly id: QuizDifficulty; readonly color: string }[] = [
  { id: "basics", color: "#ff5252" },
  { id: "advanced", color: "#448aff" },
  { id: "expert", color: "#ffc107" },
  { id: "master", color: "#aa00ff" },
];

const DIFFICULTY_ORDER: Record<QuizDifficulty, number> = {
  basics: 0,
  advanced: 1,
  expert: 2,
  master: 3,
};

const DIFFICULTY_COLOR: Record<QuizDifficulty, string> = {
  basics: "#ff5252",
  advanced: "#448aff",
  expert: "#ffc107",
  master: "#aa00ff",
};

const FORMAT_ORDER: readonly QuizQuestionFormat[] = [
  "choices",
  "multi_select",
  "ordering",
  "grouping",
  "one_way",
  "input",
  "tsume_action",
];

function shuffleQuestionOptions(q: QuizQuestion): QuizQuestion {
  if (!q.options) return q;

  const mappedOptions = q.options.map((opt, index) => ({ opt, index }));
  for (let i = mappedOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = mappedOptions[i];
    mappedOptions[i] = mappedOptions[j];
    mappedOptions[j] = tmp;
  }

  const newOptions = mappedOptions.map((m) => m.opt);
  const newCorrectAnswerIndex =
    q.correctAnswerIndex !== undefined
      ? mappedOptions.findIndex((m) => m.index === q.correctAnswerIndex)
      : undefined;
  const newCorrectAnswerIndices = q.correctAnswerIndices?.map((oldIdx) =>
    mappedOptions.findIndex((m) => m.index === oldIdx),
  );
  const newCorrectOrderIndices = q.correctOrderIndices?.map((oldIdx) =>
    mappedOptions.findIndex((m) => m.index === oldIdx),
  );

  return {
    ...q,
    options: newOptions,
    correctAnswerIndex: newCorrectAnswerIndex,
    correctAnswerIndices: newCorrectAnswerIndices,
    correctOrderIndices: newCorrectOrderIndices,
  };
}

function isOptionCorrect(q: QuizQuestion, index: number): boolean {
  if (q.format === "choices" || q.format === "one_way") {
    return q.correctAnswerIndex === index;
  }
  if (q.format === "multi_select") {
    return q.correctAnswerIndices?.includes(index) ?? false;
  }
  return false;
}

interface QuizListProps {
  readonly questions: readonly QuizQuestion[];
}

export function QuizList({ questions }: QuizListProps) {
  const { t } = useTranslation();

  const [selectedDifficulty, setSelectedDifficulty] = useState<QuizDifficulty | "all">("all");
  const [selectedFormat, setSelectedFormat] = useState<QuizQuestionFormat | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [practiceQuestion, setPracticeQuestion] = useState<QuizQuestion | null>(null);

  const sortedQuestions = useMemo(() => {
    return [...questions].sort((a, b) => {
      const diffDelta = DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty];
      if (diffDelta !== 0) return diffDelta;
      return a.id.localeCompare(b.id);
    });
  }, [questions]);

  const difficultyCounts = useMemo(() => {
    const counts: Record<QuizDifficulty, number> = {
      basics: 0,
      advanced: 0,
      expert: 0,
      master: 0,
    };
    for (const q of sortedQuestions) {
      counts[q.difficulty] += 1;
    }
    return counts;
  }, [sortedQuestions]);

  const availableFormats = useMemo(() => {
    const set = new Set<QuizQuestionFormat>();
    for (const q of sortedQuestions) {
      set.add(q.format);
    }
    return FORMAT_ORDER.filter((f) => set.has(f));
  }, [sortedQuestions]);

  const filteredQuestions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return sortedQuestions.filter((q) => {
      if (selectedDifficulty !== "all" && q.difficulty !== selectedDifficulty) {
        return false;
      }
      if (selectedFormat !== "all" && q.format !== selectedFormat) {
        return false;
      }
      if (!normalizedQuery) return true;

      if (q.question.toLowerCase().includes(normalizedQuery)) return true;
      if (q.options?.some((opt) => opt.toLowerCase().includes(normalizedQuery))) return true;
      if (q.content?.toLowerCase().includes(normalizedQuery)) return true;
      if (q.correctGroups) {
        for (const [groupName, items] of Object.entries(q.correctGroups)) {
          if (groupName.toLowerCase().includes(normalizedQuery)) return true;
          if (items.some((item) => item.toLowerCase().includes(normalizedQuery))) return true;
        }
      }
      return false;
    });
  }, [sortedQuestions, selectedDifficulty, selectedFormat, searchQuery]);

  const allFilteredRevealed = useMemo(() => {
    if (filteredQuestions.length === 0) return false;
    return filteredQuestions.every((q) => revealedIds.has(q.id));
  }, [filteredQuestions, revealedIds]);

  const handleToggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleRevealAll = () => {
    if (allFilteredRevealed) {
      setRevealedIds((prev) => {
        const next = new Set(prev);
        for (const q of filteredQuestions) {
          next.delete(q.id);
        }
        return next;
      });
    } else {
      setRevealedIds((prev) => {
        const next = new Set(prev);
        for (const q of filteredQuestions) {
          next.add(q.id);
        }
        return next;
      });
    }
  };

  const handleResetFilters = () => {
    setSelectedDifficulty("all");
    setSelectedFormat("all");
    setSearchQuery("");
  };

  const handleOpenPractice = (q: QuizQuestion) => {
    setPracticeQuestion(shuffleQuestionOptions(q));
  };

  return (
    <Box sx={{ maxWidth: 960, mx: "auto", p: { xs: 1.5, sm: 2, md: 4 } }}>
      {/* Header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          mb: 2,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 900,
              background: "linear-gradient(to right, #4facfe 0%, #00f2fe 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontSize: { xs: "1.5rem", sm: "2rem" },
            }}
          >
            {t("quiz.list.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("quiz.list.subtitle")}
          </Typography>
        </Box>

        <Button
          component={LocalizedLink}
          href="/quiz"
          variant="contained"
          startIcon={<QuizIcon />}
          sx={{
            borderRadius: 2,
            fontWeight: "bold",
            flexShrink: 0,
            alignSelf: { xs: "flex-start", sm: "center" },
          }}
        >
          {t("quiz.list.backToQuiz")}
        </Button>
      </Stack>

      <Alert
        severity="info"
        sx={{
          mb: 3,
          borderRadius: 2,
          "& .MuiAlert-message": { width: "100%" },
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: "medium" }}>
          {t("quiz.championsNotice")}
        </Typography>
      </Alert>

      {/* Filter Panel */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, sm: 2.5 },
          mb: 3,
          borderRadius: 3,
          bgcolor: "background.paper",
        }}
      >
        <Stack spacing={2}>
          {/* Search Input */}
          <TextField
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("quiz.list.searchPlaceholder")}
            size="small"
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setSearchQuery("")}
                      aria-label={t("common.close")}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />

          {/* Difficulty Filter Chips */}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
            <Chip
              label={`${t("quiz.list.allDifficulties")} (${sortedQuestions.length})`}
              onClick={() => setSelectedDifficulty("all")}
              variant={selectedDifficulty === "all" ? "filled" : "outlined"}
              color={selectedDifficulty === "all" ? "primary" : "default"}
              sx={{ fontWeight: "bold" }}
            />
            {DIFFICULTIES.map((diff) => {
              const isSelected = selectedDifficulty === diff.id;
              return (
                <Chip
                  key={diff.id}
                  label={`${t(`quiz.difficulty.${diff.id}`)} (${difficultyCounts[diff.id]})`}
                  onClick={() => setSelectedDifficulty(diff.id)}
                  variant={isSelected ? "filled" : "outlined"}
                  sx={{
                    fontWeight: "bold",
                    borderColor: diff.color,
                    color: isSelected ? "#fff" : diff.color,
                    bgcolor: isSelected ? diff.color : "transparent",
                    "&:hover": {
                      bgcolor: isSelected ? diff.color : `${diff.color}1a`,
                    },
                  }}
                />
              );
            })}
          </Stack>

          {/* Format Filter Chips */}
          {availableFormats.length > 1 && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <Chip
                size="small"
                label={t("quiz.list.allFormats")}
                onClick={() => setSelectedFormat("all")}
                variant={selectedFormat === "all" ? "filled" : "outlined"}
                color={selectedFormat === "all" ? "secondary" : "default"}
              />
              {availableFormats.map((fmt) => (
                <Chip
                  key={fmt}
                  size="small"
                  label={t(`quiz.format.${fmt}`)}
                  onClick={() => setSelectedFormat(fmt)}
                  variant={selectedFormat === fmt ? "filled" : "outlined"}
                  color={selectedFormat === fmt ? "secondary" : "default"}
                />
              ))}
            </Stack>
          )}

          <Divider />

          {/* Result Count & Bulk Toggle */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: "bold" }}>
              {t("quiz.list.showingCount", {
                shown: filteredQuestions.length,
                total: sortedQuestions.length,
              })}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={allFilteredRevealed ? <VisibilityOffIcon /> : <VisibilityIcon />}
              onClick={handleToggleRevealAll}
              disabled={filteredQuestions.length === 0}
              sx={{ borderRadius: 2 }}
            >
              {allFilteredRevealed ? t("quiz.list.collapseAll") : t("quiz.list.expandAll")}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Question Cards */}
      {filteredQuestions.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            p: 5,
            textAlign: "center",
            borderRadius: 3,
          }}
        >
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {t("quiz.list.noMatches")}
          </Typography>
          <Button variant="outlined" onClick={handleResetFilters} sx={{ borderRadius: 2 }}>
            {t("quiz.list.resetFilters")}
          </Button>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {filteredQuestions.map((q, idx) => {
            const isRevealed = revealedIds.has(q.id);
            const diffColor = DIFFICULTY_COLOR[q.difficulty];

            return (
              <Card
                key={q.id}
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  borderColor: isRevealed ? `${diffColor}88` : "divider",
                  transition: "border-color 0.2s ease",
                }}
              >
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  {/* Badges & Index */}
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      rowGap: 1,
                      mb: 1.5,
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}
                    >
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontWeight: "bold", fontFamily: "monospace" }}
                      >
                        #{idx + 1}
                      </Typography>
                      <Chip
                        size="small"
                        label={t(`quiz.difficulty.${q.difficulty}`)}
                        sx={{
                          fontWeight: "bold",
                          bgcolor: `${diffColor}22`,
                          color: diffColor,
                          border: `1px solid ${diffColor}55`,
                        }}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={t(`quiz.format.${q.format}`)}
                        sx={{ fontSize: "0.75rem" }}
                      />
                    </Stack>

                    <Button
                      size="small"
                      variant="text"
                      startIcon={<PlayArrowIcon />}
                      onClick={() => handleOpenPractice(q)}
                      sx={{ borderRadius: 2, fontWeight: "bold" }}
                    >
                      {t("quiz.list.practiceQuestion")}
                    </Button>
                  </Stack>

                  {/* Question Text */}
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: "bold",
                      lineHeight: 1.5,
                      whiteSpace: "pre-line",
                      fontSize: { xs: "1rem", sm: "1.125rem" },
                      mb: 2,
                      "& code": {
                        bgcolor: "rgba(127, 127, 127, 0.2)",
                        px: 0.5,
                        py: 0.2,
                        borderRadius: 1,
                        fontFamily: "monospace",
                      },
                      "& strong": {
                        color: "primary.main",
                      },
                    }}
                  >
                    {parse(marked.parseInline(q.question) as string)}
                  </Typography>

                  {/* Options Preview (neutral when hidden, highlighted when revealed for choice formats) */}
                  {q.format === "grouping" && q.correctGroups ? (
                    <Box sx={{ mb: 2 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontWeight: "bold", display: "block", mb: 0.75 }}
                      >
                        {t("quiz.list.groups")}: {Object.keys(q.correctGroups).join(" / ")}
                      </Typography>
                      {q.options && q.options.length > 0 && (
                        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                          {q.options.map((opt) => (
                            <Chip key={opt} label={opt} size="small" variant="outlined" />
                          ))}
                        </Stack>
                      )}
                    </Box>
                  ) : (
                    q.options &&
                    q.options.length > 0 && (
                      <Stack spacing={1} sx={{ mb: 2 }}>
                        {q.options.map((opt, optIdx) => {
                          const correct = isRevealed && isOptionCorrect(q, optIdx);
                          return (
                            <Paper
                              key={`${q.id}-opt-${optIdx}`}
                              variant="outlined"
                              sx={{
                                px: 1.5,
                                py: 1,
                                borderRadius: 2,
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                borderColor: correct ? "success.main" : "divider",
                                bgcolor: correct ? "rgba(46, 125, 50, 0.12)" : "transparent",
                              }}
                            >
                              {correct ? (
                                <CheckCircleIcon
                                  color="success"
                                  fontSize="small"
                                  sx={{ flexShrink: 0 }}
                                />
                              ) : (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{
                                    fontWeight: "bold",
                                    minWidth: 20,
                                    textAlign: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  {optIdx + 1}.
                                </Typography>
                              )}
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: correct ? "bold" : "normal",
                                  color: correct ? "success.main" : "text.primary",
                                }}
                              >
                                {opt}
                              </Typography>
                            </Paper>
                          );
                        })}
                      </Stack>
                    )
                  )}

                  {/* Toggle Answer / Explanation Button */}
                  <Button
                    size="small"
                    variant={isRevealed ? "outlined" : "contained"}
                    color={isRevealed ? "inherit" : "primary"}
                    endIcon={isRevealed ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => handleToggleReveal(q.id)}
                    sx={{ borderRadius: 2, fontWeight: "bold" }}
                  >
                    {isRevealed ? t("quiz.list.hideAnswer") : t("quiz.list.showAnswer")}
                  </Button>

                  {/* Revealed Answer & Explanation */}
                  <Collapse in={isRevealed} unmountOnExit>
                    <Box
                      sx={{
                        mt: 2,
                        pt: 2,
                        borderTop: "1px dashed",
                        borderColor: "divider",
                      }}
                    >
                      {/* Format-specific Correct Answer Summary */}
                      {q.format === "ordering" && q.correctOrderIndices && q.options && (
                        <Box
                          sx={{
                            mb: 2,
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: "rgba(46, 125, 50, 0.08)",
                            border: "1px solid",
                            borderColor: "success.main",
                          }}
                        >
                          <Typography
                            variant="subtitle2"
                            color="success.main"
                            sx={{ fontWeight: "bold", mb: 1 }}
                          >
                            {t("quiz.list.correctOrder")}
                          </Typography>
                          <Stack spacing={0.5}>
                            {q.correctOrderIndices.map((origIdx, orderPos) => (
                              <Typography key={`${q.id}-ord-${orderPos}`} variant="body2">
                                <strong>{orderPos + 1}.</strong> {q.options?.[origIdx]}
                              </Typography>
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {q.format === "grouping" && q.correctGroups && (
                        <Box
                          sx={{
                            mb: 2,
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: "rgba(46, 125, 50, 0.08)",
                            border: "1px solid",
                            borderColor: "success.main",
                          }}
                        >
                          <Typography
                            variant="subtitle2"
                            color="success.main"
                            sx={{ fontWeight: "bold", mb: 1 }}
                          >
                            {t("quiz.list.correctGrouping")}
                          </Typography>
                          <Stack spacing={1}>
                            {Object.entries(q.correctGroups).map(([groupName, items]) => (
                              <Box key={groupName}>
                                <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                                  {groupName}
                                </Typography>
                                <Stack
                                  direction="row"
                                  spacing={0.75}
                                  sx={{ flexWrap: "wrap", rowGap: 0.75, mt: 0.5 }}
                                >
                                  {items.map((item) => (
                                    <Chip
                                      key={item}
                                      label={item}
                                      size="small"
                                      color="success"
                                      variant="outlined"
                                    />
                                  ))}
                                </Stack>
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {q.format === "input" && q.correctAnswer && (
                        <Box
                          sx={{
                            mb: 2,
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: "rgba(46, 125, 50, 0.08)",
                            border: "1px solid",
                            borderColor: "success.main",
                          }}
                        >
                          <Typography
                            variant="subtitle2"
                            color="success.main"
                            sx={{ fontWeight: "bold" }}
                          >
                            {t("quiz.list.correctAnswer")}: {q.correctAnswer}
                          </Typography>
                        </Box>
                      )}

                      {/* MDX Explanation */}
                      {q.mdx && (
                        <Box
                          sx={{
                            "& p": { lineHeight: 1.75, my: 1 },
                            "& ul, & ol": { pl: 2.5, my: 1 },
                            "& li": { lineHeight: 1.7, mb: 0.5 },
                          }}
                        >
                          <MDXContent code={q.mdx} />
                        </Box>
                      )}
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Single-Question Practice Dialog */}
      <Dialog
        open={practiceQuestion !== null}
        onClose={() => setPracticeQuestion(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pb: 1,
          }}
        >
          <Typography component="span" variant="h6" sx={{ fontWeight: "bold" }}>
            {t("quiz.list.practiceDialogTitle")}
          </Typography>
          <IconButton
            onClick={() => setPracticeQuestion(null)}
            size="small"
            aria-label={t("common.close")}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1, sm: 2 } }}>
          {practiceQuestion && (
            <QuizApp
              key={practiceQuestion.id}
              initialQuestions={[practiceQuestion]}
              directPlay={true}
              onReturnToMenu={() => setPracticeQuestion(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
