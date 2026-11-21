"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Card,
  CardContent,
  Grid,
  Paper,
  LinearProgress,
  IconButton,
  Alert,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { TsumeEngine } from "@/utils/tsumeEngine";
import { MDXContent } from "@content-collections/mdx/react";
import TwitterIcon from "@mui/icons-material/Twitter";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import CalculateIcon from "@mui/icons-material/Calculate";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import * as Sentry from "@sentry/nextjs";
import parse from "html-react-parser";
import { marked } from "marked";
import type { QuizQuestion, TsumePokemon } from "@/types/quiz";
import { LocalizedLink } from "@/components/client/LocalizedLink";
import { ChoicesFormat } from "./formats/ChoicesFormat";
import { OneWayFormat } from "./formats/OneWayFormat";
import { MultiSelectFormat } from "./formats/MultiSelectFormat";
import { OrderingFormat } from "./formats/OrderingFormat";
import { GroupingFormat } from "./formats/GroupingFormat";
import { TsumeActionFormat } from "./formats/TsumeActionFormat";

interface QuizAppProps {
  initialQuestions: QuizQuestion[];
  directPlay?: boolean;
  onReturnToMenu?: () => void;
}

type QuizMode = "menu" | "playing" | "results";
type UICategory = "academic" | "practical";
type Difficulty = "basics" | "advanced" | "expert" | "master";

type MenuStep = "category" | "difficulty";

export function QuizApp({ initialQuestions, directPlay, onReturnToMenu }: QuizAppProps) {
  const { t, i18n } = useTranslation();

  const [mode, setMode] = useState<QuizMode>(directPlay ? "playing" : "menu");
  const [menuStep, setMenuStep] = useState<MenuStep>("difficulty");
  const [selectedCategory, setSelectedCategory] = useState<UICategory | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null);

  const [sessionQuestions, setSessionQuestions] = useState<QuizQuestion[]>(
    directPlay ? initialQuestions : [],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [tsumeActions, setTsumeActions] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [isLoading] = useState(false);

  // States for different quiz formats
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [orderedOptions, setOrderedOptions] = useState<string[]>([]);
  const [groupedItems, setGroupedItems] = useState<Record<string, string[]>>({});

  const explanationRef = useRef<HTMLDivElement>(null);
  const handleReportFeedback = async () => {
    const feedback = Sentry.getFeedback();
    if (!feedback) return;
    const form = await feedback.createForm({
      formTitle: t("quiz.reportError"),
    });
    form.appendToDom();
    form.open();
    // Clean up after form is closed
    const observer = new MutationObserver(() => {
      if (!document.contains(form.el as Node)) {
        observer.disconnect();
      }
    });
  };

  useEffect(() => {
    if (showExplanation && explanationRef.current) {
      setTimeout(() => {
        explanationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [showExplanation]);

  // Filter questions by current language
  const currentLang = i18n.language.startsWith("en") ? "en" : "ja";

  const localizedQuestions = useMemo(() => {
    return initialQuestions.filter((q) => q.locale === currentLang);
  }, [initialQuestions, currentLang]);

  // Restart if language changes during play (only if not in direct play)
  const [prevLang, setPrevLang] = useState(currentLang);
  if (prevLang !== currentLang) {
    setPrevLang(currentLang);
    if (!directPlay) {
      setMode("menu");
      setMenuStep("difficulty");
    }
  }

  const categories: {
    id: UICategory;
    icon: React.ReactNode;
    color: string;
    disabled?: boolean;
  }[] = [
    { id: "academic", icon: <MenuBookIcon sx={{ fontSize: 60 }} />, color: "#4facfe" },
    {
      id: "practical",
      icon: <CalculateIcon sx={{ fontSize: 60 }} />,
      color: "#f093fb",
      disabled: true,
    },
  ];

  const difficulties: { id: Difficulty; color: string }[] = [
    { id: "basics", color: "#ff5252" }, // Poke Ball (Red)
    { id: "advanced", color: "#448aff" }, // Great Ball (Blue)
    { id: "expert", color: "#ffc107" }, // Ultra Ball (Yellow/Gold)
    { id: "master", color: "#aa00ff" }, // Master Ball (Purple)
  ];

  const handleSelectDifficulty = (diff: Difficulty) => {
    setSelectedDifficulty(diff);
    setMenuStep("category");
    history.pushState({ quizStep: "category" }, "");
  };

  const handleStartQuiz = async (cat: UICategory) => {
    setSelectedCategory(cat);
    // reserved for future practical server-side fetching if needed
    let questionsForDiff: QuizQuestion[] = localizedQuestions.filter((q) => {
      if (q.difficulty !== selectedDifficulty) return false;
      if (cat === "academic") return q.category === "academic";
      if (cat === "practical") {
        if (selectedDifficulty === "basics" || selectedDifficulty === "advanced") {
          return q.category === "damage_calc";
        } else {
          return q.category === "damage_calc" || q.category === "tsume";
        }
      }
      return false;
    });

    // Shuffle and pick up to 10, also shuffle the options for each question
    const shuffled = [...questionsForDiff].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 10).map((q) => {
      let newOptions = q.options;
      let newCorrectAnswerIndex = q.correctAnswerIndex;
      let newCorrectAnswerIndices = q.correctAnswerIndices;
      let newCorrectOrderIndices = q.correctOrderIndices;

      if (q.options) {
        const mappedOptions = q.options.map((opt, index) => ({ opt, index }));
        mappedOptions.sort(() => 0.5 - Math.random());
        newOptions = mappedOptions.map((m) => m.opt);

        if (q.correctAnswerIndex !== undefined) {
          newCorrectAnswerIndex = mappedOptions.findIndex((m) => m.index === q.correctAnswerIndex);
        }
        if (q.correctAnswerIndices) {
          newCorrectAnswerIndices = q.correctAnswerIndices.map((oldIdx) =>
            mappedOptions.findIndex((m) => m.index === oldIdx),
          );
        }
        if (q.correctOrderIndices) {
          newCorrectOrderIndices = q.correctOrderIndices.map((oldIdx) =>
            mappedOptions.findIndex((m) => m.index === oldIdx),
          );
        }
      }

      return {
        ...q,
        options: newOptions,
        correctAnswerIndex: newCorrectAnswerIndex,
        correctAnswerIndices: newCorrectAnswerIndices,
        correctOrderIndices: newCorrectOrderIndices,
      };
    });

    if (selected.length === 0) {
      alert(t("quiz.noQuestions"));
      return;
    }

    setSelectedCategory(cat);
    setSessionQuestions(selected);
    setCurrentIndex(0);
    setScore(0);
    setSelectedOption(null);
    setSelectedOptions([]);
    setOrderedOptions([]);
    setGroupedItems({});
    setTsumeActions([]);
    setShowExplanation(false);
    setMode("playing");
    history.pushState({ quizStep: "playing" }, "");
  };

  const activeQuestion = sessionQuestions[currentIndex];

  useEffect(() => {
    if (activeQuestion) {
      Sentry.setTag("quiz_id", activeQuestion.id);
    }
  }, [activeQuestion]);

  const [prevActiveQuestion, setPrevActiveQuestion] = useState(activeQuestion);
  if (prevActiveQuestion !== activeQuestion) {
    setPrevActiveQuestion(activeQuestion);
    if (activeQuestion) {
      if (activeQuestion.format === "ordering" && activeQuestion.options) {
        setOrderedOptions([...activeQuestion.options]);
      } else if (
        activeQuestion.format === "grouping" &&
        activeQuestion.options &&
        activeQuestion.correctGroups
      ) {
        const groups = Object.keys(activeQuestion.correctGroups);
        const initialGroups: Record<string, string[]> = {};
        groups.forEach((g, index) => {
          initialGroups[g] = index === 0 ? [...activeQuestion.options!] : [];
        });
        setGroupedItems(initialGroups);
      }
    }
  }

  const isSubmitDisabled = () => {
    if (!activeQuestion) return true;
    if (activeQuestion.format === "choices") return selectedOption === null;
    if (activeQuestion.format === "one_way") return selectedOption === null;
    if (activeQuestion.format === "multi_select") return selectedOptions.length === 0;
    if (activeQuestion.format === "ordering") return orderedOptions.length === 0;
    if (activeQuestion.format === "grouping") return false;
    if (activeQuestion.format === "tsume_action") {
      // Need at least as many actions as correctMoves to not be disabled
      return tsumeActions.length === 0;
    }
    return false;
  };

  const handleSubmit = () => {
    if (!activeQuestion) return;

    let isCorrect = false;

    if (activeQuestion.format === "choices" || activeQuestion.format === "one_way") {
      isCorrect =
        selectedOption !== null &&
        activeQuestion.options?.indexOf(selectedOption) === activeQuestion.correctAnswerIndex;
    } else if (activeQuestion.format === "multi_select") {
      const correctIndices = activeQuestion.correctAnswerIndices || [];
      const selectedIndices = selectedOptions.map(
        (opt) => activeQuestion.options?.indexOf(opt) ?? -1,
      );
      isCorrect =
        correctIndices.length === selectedIndices.length &&
        correctIndices.every((idx) => selectedIndices.includes(idx));
    } else if (activeQuestion.format === "ordering") {
      const correctIndices = activeQuestion.correctOrderIndices || [];
      const selectedIndices = orderedOptions.map(
        (opt) => activeQuestion.options?.indexOf(opt) ?? -1,
      );
      isCorrect =
        correctIndices.length === selectedIndices.length &&
        correctIndices.every((ans, i) => selectedIndices[i] === ans);
    } else if (activeQuestion.format === "grouping") {
      const correct = activeQuestion.correctGroups || {};
      isCorrect = true;
      for (const group of Object.keys(correct)) {
        const expected = correct[group] || [];
        const actual = groupedItems[group] || [];
        if (expected.length !== actual.length || !expected.every((ans) => actual.includes(ans))) {
          isCorrect = false;
          break;
        }
      }
    } else if (activeQuestion.format === "tsume_action") {
      const correct = activeQuestion.tsumeData?.correctMoves || [];
      isCorrect =
        correct.length === tsumeActions.length &&
        correct.every((ans) => tsumeActions.includes(ans));
    }

    if (isCorrect) {
      setScore((s) => s + 1);
    }
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (currentIndex < sessionQuestions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setSelectedOptions([]);
      setOrderedOptions([]);
      setGroupedItems({});
      setTsumeActions([]);
      setShowExplanation(false);
      window.scrollTo(0, 0);
    } else {
      setMode("results");
      window.scrollTo(0, 0);
    }
  };

  const handleBackToMenu = () => {
    if (onReturnToMenu) {
      onReturnToMenu();
      return;
    }
    setMode("menu");
    setMenuStep("category");
  };

  // Browser back button support
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const step = e.state?.quizStep as string | undefined;
      if (step === "playing") {
        // back from results or mid-quiz → back to category menu
        setMode("menu");
        setMenuStep("category");
      } else if (step === "category") {
        // back from category → back to difficulty
        setMenuStep("difficulty");
        setMode("menu");
      } else {
        // back from difficulty or no state → let browser navigate normally
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const getRankKey = (s: number, total: number) => {
    const ratio = total > 0 ? s / total : 0;
    if (ratio === 1) return "champion";
    if (ratio >= 0.7) return "veteran";
    if (ratio >= 0.4) return "aceTrainer";
    return "youngster";
  };

  const getPokemonName = (speciesId: string) => {
    if (!speciesId) return "";
    const id = speciesId.toLowerCase();
    const nameKey = `pokemon.${id}.name`;
    const formKey = `pokemon.${id}.formName`;
    if (!i18n.exists(nameKey)) {
      return speciesId;
    }
    const name = t(nameKey);
    if (i18n.exists(formKey)) {
      const formName = t(formKey);

      const megaSuffixMatch = formName.match(/^(Mega|メガ)\s?([XY])$/i);
      if (megaSuffixMatch) {
        const prefix = megaSuffixMatch[1];
        const suffix = megaSuffixMatch[2].toUpperCase();
        return currentLang === "ja" ? `${prefix}${name}${suffix}` : `${prefix} ${name} ${suffix}`;
      }

      return currentLang === "ja" ? `${formName}${name}` : `${formName} ${name}`;
    }
    return name;
  };

  const handleShareTwitter = () => {
    const difficultyName = t(`quiz.difficulty.${selectedDifficulty}`);
    const categoryName = t(`quiz.category.${selectedCategory}`);
    const rankKey = getRankKey(score, sessionQuestions.length);
    const rankName = t(`quiz.rank.${rankKey}`);

    const text =
      currentLang === "ja"
        ? `ポケモンバトル検定（${categoryName} - ${difficultyName}）で ${score}/${sessionQuestions.length} 点を獲得し、「${rankName}」に認定されました！\n#Pokétistix\n`
        : `I scored ${score}/${sessionQuestions.length} in the Pokémon Battle Proficiency Test (${categoryName} - ${difficultyName}) and achieved the rank of "${rankName}"!\n#Pokétistix\n`;

    const url =
      typeof window !== "undefined" ? window.location.href : "https://poketistix.mitama.io/quiz";

    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(shareUrl, "_blank");
  };

  const renderPlayingMode = () => {
    if (!activeQuestion) return null;

    const progress = (currentIndex / sessionQuestions.length) * 100;

    // Compute correctness from current answer state (mirrors handleSubmit logic)
    let isCorrect = false;
    if (activeQuestion.format === "choices" || activeQuestion.format === "one_way") {
      isCorrect =
        selectedOption !== null &&
        activeQuestion.options?.indexOf(selectedOption) === activeQuestion.correctAnswerIndex;
    } else if (activeQuestion.format === "multi_select") {
      const correctIndices = activeQuestion.correctAnswerIndices || [];
      const selectedIndices = selectedOptions.map(
        (opt) => activeQuestion.options?.indexOf(opt) ?? -1,
      );
      isCorrect =
        correctIndices.length === selectedIndices.length &&
        correctIndices.every((idx) => selectedIndices.includes(idx));
    } else if (activeQuestion.format === "ordering") {
      const correctIndices = activeQuestion.correctOrderIndices || [];
      const selectedIndices = orderedOptions.map(
        (opt) => activeQuestion.options?.indexOf(opt) ?? -1,
      );
      isCorrect =
        correctIndices.length === selectedIndices.length &&
        correctIndices.every((ans, i) => selectedIndices[i] === ans);
    } else if (activeQuestion.format === "grouping") {
      const correct = activeQuestion.correctGroups || {};
      isCorrect = true;
      for (const group of Object.keys(correct)) {
        const expected = correct[group] || [];
        const actual = groupedItems[group] || [];
        if (expected.length !== actual.length || !expected.every((ans) => actual.includes(ans))) {
          isCorrect = false;
          break;
        }
      }
    } else if (activeQuestion.format === "tsume_action") {
      if (tsumeActions.length > 0) {
        try {
          const engine = new TsumeEngine(activeQuestion.tsumeData!);
          let didWin = false;
          const historyKey: string[] = [];
          for (const action of tsumeActions) {
            // Extract the base move name (e.g. "encore (Target: ...)" -> "encore")
            const moveId = action.split(" ")[0];
            const p1Choice = `move ${moveId}`;
            historyKey.push(p1Choice);
            const oppChoice = engine.getOpponentHeuristicChoice(historyKey.join(","));
            const ended = engine.simulateTurn(p1Choice, oppChoice);
            if (ended) {
              didWin = engine.getP2ActiveHP() <= 0 && engine.getP1ActiveHP() > 0;
              break;
            }
          }
          isCorrect = didWin;
        } catch (e) {
          console.error("Tsume simulation failed", e);
          // Fallback to static check if sim fails
          const correct = activeQuestion.tsumeData?.correctMoves || [];
          isCorrect =
            correct.length === tsumeActions.length &&
            correct.every((ans) => tsumeActions.includes(ans));
        }
      } else {
        isCorrect = false;
      }
    }

    return (
      <Box
        sx={{
          maxWidth: 800,
          mx: "auto",
          p: { xs: 1, sm: 2 },
          pb: { xs: showExplanation ? 2 : 10, sm: 2 },
        }}
      >
        <Box
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            bgcolor: "background.default",
            pt: 1,
            pb: 0.75,
            mb: 1.5,
          }}
        >
          <Box
            sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}
          >
            <Button
              onClick={handleBackToMenu}
              color="inherit"
              startIcon={<ArrowBackIcon />}
              size="small"
              sx={{ minWidth: 0, px: 1 }}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                {t("common.back")}
              </Box>
            </Button>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }} color="text.secondary">
              {currentIndex + 1} / {sessionQuestions.length}
            </Typography>
            <IconButton
              onClick={handleReportFeedback}
              size="small"
              color="inherit"
              sx={{ opacity: 0.5, "&:hover": { opacity: 1 } }}
              title={t("quiz.reportError")}
            >
              <ReportProblemIcon fontSize="small" />
            </IconButton>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 6, borderRadius: 4 }}
          />
        </Box>

        <Card
          variant="outlined"
          sx={{ mb: 2, borderRadius: 3, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", border: "none" }}
        >
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            {activeQuestion.practicalData && (
              <Box
                sx={{
                  mb: 4,
                  p: 3,
                  bgcolor: "background.default",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography
                  variant="subtitle2"
                  color="primary"
                  gutterBottom
                  sx={{ fontWeight: "bold" }}
                >
                  {t("quiz.scenarioData")}
                </Typography>
                <Stack spacing={1.5}>
                  <Typography variant="body2">
                    <strong>{t("quiz.attacker")}:</strong>{" "}
                    {getPokemonName(activeQuestion.practicalData.attacker.species)} (
                    {activeQuestion.practicalData.attacker.evs},{" "}
                    {activeQuestion.practicalData.attacker.item},{" "}
                    {activeQuestion.practicalData.attacker.nature})
                  </Typography>
                  {activeQuestion.practicalData.ally && (
                    <Typography variant="body2" color="text.secondary">
                      <strong>{t("quiz.ally")}:</strong>{" "}
                      {getPokemonName(activeQuestion.practicalData.ally.species)}{" "}
                      {activeQuestion.practicalData.ally.item &&
                        `(${activeQuestion.practicalData.ally.item})`}
                    </Typography>
                  )}
                  <Typography variant="body2">
                    <strong>{t("quiz.defender")}:</strong>{" "}
                    {getPokemonName(activeQuestion.practicalData.defender.species)} (
                    {activeQuestion.practicalData.defender.evs},{" "}
                    {activeQuestion.practicalData.defender.item},{" "}
                    {activeQuestion.practicalData.defender.nature})
                  </Typography>
                  {activeQuestion.practicalData.opponentAlly && (
                    <Typography variant="body2" color="text.secondary">
                      <strong>{t("quiz.opponentAlly")}:</strong>{" "}
                      {getPokemonName(activeQuestion.practicalData.opponentAlly.species)}{" "}
                      {activeQuestion.practicalData.opponentAlly.item &&
                        `(${activeQuestion.practicalData.opponentAlly.item})`}
                    </Typography>
                  )}
                  <Typography variant="body2">
                    <strong>{t("quiz.move")}:</strong> {activeQuestion.practicalData.move}
                  </Typography>
                </Stack>
              </Box>
            )}

            {activeQuestion.tsumeData && (
              <Box
                sx={{
                  mb: 4,
                  p: 3,
                  bgcolor: "background.default",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography
                  variant="subtitle2"
                  color="primary"
                  gutterBottom
                  sx={{ fontWeight: "bold", display: "flex", justifyContent: "space-between" }}
                >
                  <span>{t("quiz.boardState")}</span>
                </Typography>
                <Stack
                  spacing={3}
                  direction={{ xs: "column", sm: "row" }}
                  sx={{ justifyContent: "space-between" }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="primary" sx={{ fontWeight: "bold", mb: 1 }}>
                      {t("quiz.yourActive")}
                    </Typography>
                    {activeQuestion.tsumeData.playerSide.active.map(
                      (poke: TsumePokemon, i: number) => (
                        <Box
                          key={i}
                          sx={{
                            mb: 2,
                            p: 1.5,
                            bgcolor: "background.paper",
                            borderRadius: 1,
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        >
                          <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                            {getPokemonName(poke.species)}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ display: "block", color: "text.secondary" }}
                          >
                            HP: {poke.hpCurrent} / {poke.hpMax}
                          </Typography>
                          {poke.item && (
                            <Typography
                              variant="caption"
                              sx={{ display: "block", color: "text.secondary" }}
                            >
                              {t("quiz.item")}: {poke.item}
                            </Typography>
                          )}
                          {poke.ability && (
                            <Typography
                              variant="caption"
                              sx={{ display: "block", color: "text.secondary" }}
                            >
                              Ability: {poke.ability}
                            </Typography>
                          )}
                          {poke.stats?.spe && (
                            <Typography
                              variant="caption"
                              sx={{ display: "block", color: "text.secondary" }}
                            >
                              Speed: {poke.stats.spe}
                            </Typography>
                          )}
                          {poke.status && (
                            <Typography
                              variant="caption"
                              color="error"
                              sx={{ display: "block", fontWeight: "bold" }}
                            >
                              {poke.status.toUpperCase()}
                            </Typography>
                          )}
                          {poke.volatiles && poke.volatiles.length > 0 && (
                            <Typography
                              variant="caption"
                              color="info.main"
                              sx={{ display: "block" }}
                            >
                              {poke.volatiles.join(", ")}
                            </Typography>
                          )}
                        </Box>
                      ),
                    )}
                    {activeQuestion.tsumeData.playerSide.bench &&
                      activeQuestion.tsumeData.playerSide.bench.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography
                            variant="body2"
                            color="primary"
                            sx={{ fontWeight: "bold", mb: 1, opacity: 0.8 }}
                          >
                            Bench
                          </Typography>
                          {activeQuestion.tsumeData.playerSide.bench.map(
                            (poke: TsumePokemon, i: number) => (
                              <Box
                                key={i}
                                sx={{
                                  mb: 1,
                                  p: 1,
                                  bgcolor: "background.paper",
                                  borderRadius: 1,
                                  border: "1px dashed",
                                  borderColor: "divider",
                                  opacity: 0.8,
                                }}
                              >
                                <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                                  {getPokemonName(poke.species)}
                                </Typography>
                                {poke.hpCurrent !== undefined && poke.hpMax !== undefined && (
                                  <Typography
                                    variant="caption"
                                    sx={{ display: "block", color: "text.secondary" }}
                                  >
                                    HP: {poke.hpCurrent} / {poke.hpMax}
                                  </Typography>
                                )}
                              </Box>
                            ),
                          )}
                        </Box>
                      )}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="error" sx={{ fontWeight: "bold", mb: 1 }}>
                      {t("quiz.opponentActive")}
                    </Typography>
                    {activeQuestion.tsumeData.opponentSide.active.map(
                      (poke: TsumePokemon, i: number) => (
                        <Box
                          key={i}
                          sx={{
                            mb: 2,
                            p: 1.5,
                            bgcolor: "background.paper",
                            borderRadius: 1,
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        >
                          <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                            {getPokemonName(poke.species)}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ display: "block", color: "text.secondary" }}
                          >
                            HP: {poke.hpCurrent} / {poke.hpMax}
                          </Typography>
                          {poke.item && (
                            <Typography
                              variant="caption"
                              sx={{ display: "block", color: "text.secondary" }}
                            >
                              {t("quiz.item")}: {poke.item}
                            </Typography>
                          )}
                          {poke.ability && (
                            <Typography
                              variant="caption"
                              sx={{ display: "block", color: "text.secondary" }}
                            >
                              Ability: {poke.ability}
                            </Typography>
                          )}
                          {poke.stats?.spe && (
                            <Typography
                              variant="caption"
                              sx={{ display: "block", color: "text.secondary" }}
                            >
                              Speed: {poke.stats.spe}
                            </Typography>
                          )}
                          {poke.status && (
                            <Typography
                              variant="caption"
                              color="error"
                              sx={{ display: "block", fontWeight: "bold" }}
                            >
                              {poke.status.toUpperCase()}
                            </Typography>
                          )}
                          {poke.volatiles && poke.volatiles.length > 0 && (
                            <Typography
                              variant="caption"
                              color="info.main"
                              sx={{ display: "block" }}
                            >
                              {poke.volatiles.join(", ")}
                            </Typography>
                          )}
                        </Box>
                      ),
                    )}
                    {activeQuestion.tsumeData.opponentSide.bench &&
                      activeQuestion.tsumeData.opponentSide.bench.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography
                            variant="body2"
                            color="error"
                            sx={{ fontWeight: "bold", mb: 1, opacity: 0.8 }}
                          >
                            Bench
                          </Typography>
                          {activeQuestion.tsumeData.opponentSide.bench.map(
                            (poke: TsumePokemon, i: number) => (
                              <Box
                                key={i}
                                sx={{
                                  mb: 1,
                                  p: 1,
                                  bgcolor: "background.paper",
                                  borderRadius: 1,
                                  border: "1px dashed",
                                  borderColor: "divider",
                                  opacity: 0.8,
                                }}
                              >
                                <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                                  {getPokemonName(poke.species)}
                                </Typography>
                                {poke.hpCurrent !== undefined && poke.hpMax !== undefined && (
                                  <Typography
                                    variant="caption"
                                    sx={{ display: "block", color: "text.secondary" }}
                                  >
                                    HP: {poke.hpCurrent} / {poke.hpMax}
                                  </Typography>
                                )}
                              </Box>
                            ),
                          )}
                        </Box>
                      )}
                  </Box>
                </Stack>
                {activeQuestion.tsumeData.field && (
                  <Box sx={{ mt: 2, pt: 2, borderTop: "1px dashed", borderColor: "divider" }}>
                    <Typography variant="caption" color="text.secondary">
                      <strong>{t("quiz.field")}:</strong>{" "}
                      {activeQuestion.tsumeData.field.terrain || "None"} /{" "}
                      {activeQuestion.tsumeData.field.weather || "None"}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            <Typography
              variant="h5"
              gutterBottom
              sx={{
                fontWeight: "bold",
                lineHeight: 1.4,
                whiteSpace: "pre-line",
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
              {parse(marked.parseInline(activeQuestion.question) as string)}
            </Typography>
            {activeQuestion.format === "choices" && (
              <ChoicesFormat
                options={activeQuestion.options || []}
                selectedOption={selectedOption}
                onOptionSelect={setSelectedOption}
                showExplanation={showExplanation}
                correctAnswerIndex={activeQuestion.correctAnswerIndex}
              />
            )}

            {activeQuestion.format === "one_way" && (
              <OneWayFormat
                options={activeQuestion.options || []}
                selectedOption={selectedOption}
                onOptionSelect={setSelectedOption}
                onSubmit={handleSubmit}
                showExplanation={showExplanation}
                correctAnswerIndex={activeQuestion.correctAnswerIndex}
              />
            )}

            {activeQuestion.format === "multi_select" && (
              <MultiSelectFormat
                options={activeQuestion.options || []}
                selectedOptions={selectedOptions}
                onOptionToggle={(opt) =>
                  setSelectedOptions((prev) =>
                    prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
                  )
                }
                showExplanation={showExplanation}
                correctAnswerIndices={activeQuestion.correctAnswerIndices}
              />
            )}

            {activeQuestion.format === "ordering" && (
              <OrderingFormat
                options={activeQuestion.options || []}
                orderedOptions={orderedOptions}
                onOrderChange={setOrderedOptions}
                showExplanation={showExplanation}
                correctOrderIndices={activeQuestion.correctOrderIndices}
              />
            )}

            {activeQuestion.format === "grouping" && (
              <GroupingFormat
                groups={Object.keys(activeQuestion.correctGroups || {})}
                groupedItems={groupedItems}
                onGroupChange={setGroupedItems}
                showExplanation={showExplanation}
                correctGroups={activeQuestion.correctGroups}
              />
            )}

            {activeQuestion.format === "tsume_action" && activeQuestion.tsumeData && (
              <TsumeActionFormat
                tsumeData={activeQuestion.tsumeData}
                selectedActions={tsumeActions}
                onActionsChange={setTsumeActions}
                onSubmit={handleSubmit}
                showExplanation={showExplanation}
                correctMoves={activeQuestion.tsumeData.correctMoves}
              />
            )}

            {!showExplanation &&
              activeQuestion.format !== "one_way" &&
              activeQuestion.format !== "tsume_action" && (
                <>
                  {/* Desktop: inline submit button */}
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSubmit}
                    disabled={isSubmitDisabled()}
                    sx={{
                      display: { xs: "none", sm: "flex" },
                      mt: 3,
                      width: "100%",
                      py: 1.5,
                      borderRadius: 2,
                      fontWeight: "bold",
                      fontSize: "1.1rem",
                    }}
                  >
                    {t("common.submit")}
                  </Button>
                  {/* Mobile: sticky bottom bar */}
                  <Box
                    sx={{
                      display: { xs: "block", sm: "none" },
                      position: "fixed",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      zIndex: 20,
                      p: 1.5,
                      bgcolor: "background.paper",
                      borderTop: "1px solid",
                      borderColor: "divider",
                      boxShadow: "0 -4px 16px rgba(0,0,0,0.1)",
                    }}
                  >
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleSubmit}
                      disabled={isSubmitDisabled()}
                      fullWidth
                      sx={{ py: 1.5, borderRadius: 2, fontWeight: "bold", fontSize: "1rem" }}
                    >
                      {t("common.submit")}
                    </Button>
                  </Box>
                </>
              )}
          </CardContent>
        </Card>

        {showExplanation && (
          <Card
            ref={explanationRef}
            variant="outlined"
            sx={{
              borderColor: isCorrect ? "success.main" : "error.main",
              borderRadius: 3,
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              scrollMarginTop: "80px",
            }}
          >
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 2,
                  gap: 1,
                }}
              >
                <Typography
                  variant="h6"
                  color={isCorrect ? "success.main" : "error.main"}
                  sx={{ fontWeight: "bold" }}
                >
                  {isCorrect ? t("quiz.correct") : t("quiz.incorrect")}
                </Typography>
                <Button
                  variant="contained"
                  onClick={handleNext}
                  sx={{
                    borderRadius: 2,
                    fontWeight: "bold",
                    minWidth: { xs: 90, sm: 120 },
                    flexShrink: 0,
                    fontSize: { xs: "0.85rem", sm: "0.875rem" },
                  }}
                >
                  {currentIndex < sessionQuestions.length - 1
                    ? t("common.next")
                    : t("quiz.viewResults")}
                </Button>
              </Box>
              <Box sx={{ mt: 1.5, "& p": { lineHeight: 1.7 } }}>
                {activeQuestion.mdx && <MDXContent code={activeQuestion.mdx} />}
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>
    );
  };

  const handleReturnMenu = () => {
    if (onReturnToMenu) {
      onReturnToMenu();
    } else {
      setMode("menu");
      setMenuStep("difficulty");
      setSelectedCategory(null);
      setSelectedDifficulty(null);
    }
  };

  if (mode === "playing") {
    return renderPlayingMode();
  }

  if (mode === "results") {
    const rankKey = getRankKey(score, sessionQuestions.length);

    return (
      <Box sx={{ maxWidth: 600, mx: "auto", p: 4, textAlign: "center" }}>
        <Paper
          elevation={6}
          sx={{
            p: { xs: 4, md: 6 },
            borderRadius: 4,
            background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)",
            color: "#fff",
          }}
        >
          <Typography
            variant="h3"
            gutterBottom
            sx={{ fontWeight: "900", textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
          >
            {t("quiz.results")}
          </Typography>
          <Typography variant="h6" sx={{ opacity: 0.8 }} gutterBottom>
            {selectedCategory && t(`quiz.category.${selectedCategory}`)} -{" "}
            {selectedDifficulty && t(`quiz.difficulty.${selectedDifficulty}`)}
          </Typography>

          <Box sx={{ my: 4, position: "relative" }}>
            <Typography
              variant="h1"
              sx={{
                fontWeight: "900",
                color: "#4facfe",
                textShadow: "0 0 20px rgba(79, 172, 254, 0.4)",
              }}
            >
              {score}{" "}
              <Typography component="span" variant="h3" sx={{ color: "#fff", opacity: 0.5 }}>
                / {sessionQuestions.length}
              </Typography>
            </Typography>
          </Box>

          <Box sx={{ mb: 6 }}>
            <Typography
              variant="subtitle1"
              sx={{ color: "#aaa", textTransform: "uppercase", letterSpacing: 2 }}
            >
              {t("quiz.rankLabel")}
            </Typography>
            <Typography
              variant="h4"
              sx={{
                fontWeight: "bold",
                color: "#f093fb",
                textShadow: "0 0 10px rgba(240, 147, 251, 0.5)",
              }}
            >
              {t(`quiz.rank.${rankKey}`)}
            </Typography>
          </Box>

          <Button
            variant="contained"
            size="large"
            startIcon={<TwitterIcon />}
            onClick={handleShareTwitter}
            sx={{
              bgcolor: "#1DA1F2",
              "&:hover": { bgcolor: "#1a91da", transform: "scale(1.02)" },
              mb: 3,
              px: 4,
              py: 2,
              borderRadius: 50,
              textTransform: "none",
              fontWeight: "bold",
              fontSize: "1.1rem",
              boxShadow: "0 4px 14px 0 rgba(29, 161, 242, 0.39)",
              transition: "all 0.2s ease-in-out",
            }}
          >
            {t("quiz.shareOnTwitter")}
          </Button>

          <Stack
            direction="row"
            spacing={2}
            sx={{ mt: 2, justifyContent: "center", flexWrap: "wrap" }}
          >
            <Button
              variant="text"
              onClick={handleReturnMenu}
              sx={{ color: "#fff", opacity: 0.7, "&:hover": { opacity: 1 } }}
            >
              {t("quiz.backToMenu")}
            </Button>
            {!directPlay && (
              <Button
                component={LocalizedLink}
                href="/quiz/list"
                variant="outlined"
                startIcon={<FormatListBulletedIcon />}
                sx={{
                  color: "#fff",
                  borderColor: "rgba(255,255,255,0.3)",
                  "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,0.08)" },
                }}
              >
                {t("quiz.list.openList")}
              </Button>
            )}
          </Stack>
        </Paper>
      </Box>
    );
  }

  // Menu Mode
  return (
    <Box sx={{ maxWidth: 900, mx: "auto", p: { xs: 1.5, sm: 2, md: 4 } }}>
      <Typography
        variant="h4"
        gutterBottom
        sx={{
          fontWeight: "900",
          textAlign: "center",
          mb: { xs: 2, sm: 4 },
          background: "linear-gradient(to right, #4facfe 0%, #00f2fe 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontSize: { xs: "1.6rem", sm: "2rem", md: "2.125rem" },
        }}
      >
        {t("quiz.title")}
      </Typography>

      <Alert
        severity="info"
        sx={{
          mb: { xs: 2, sm: 3 },
          borderRadius: 2,
          "& .MuiAlert-message": { width: "100%", textAlign: "center" },
        }}
      >
        <Typography variant="body1" sx={{ fontWeight: "medium" }}>
          {t("quiz.championsNotice")}
        </Typography>
      </Alert>

      {menuStep === "difficulty" && (
        <Box>
          <Typography
            variant="subtitle1"
            sx={{
              textAlign: "center",
              mb: { xs: 2, sm: 3 },
              fontWeight: "bold",
              color: "text.secondary",
            }}
          >
            {t("quiz.selectDifficulty", { defaultValue: "Select Difficulty" })}
          </Typography>
          <Grid container spacing={2} sx={{ justifyContent: "center" }}>
            {difficulties.map((diff) => (
              <Grid size={{ xs: 6, sm: 6 }} key={diff.id}>
                <Card
                  sx={{
                    cursor: "pointer",
                    borderRadius: 3,
                    background: `linear-gradient(135deg, ${diff.color}22 0%, ${diff.color}11 100%)`,
                    border: "1px solid",
                    borderColor: `${diff.color}44`,
                    transition: "all 0.2s ease",
                    "&:active": { transform: "scale(0.97)" },
                    "&:hover": {
                      transform: "translateY(-3px)",
                      boxShadow: `0 6px 14px ${diff.color}33`,
                      borderColor: diff.color,
                    },
                  }}
                  onClick={() => handleSelectDifficulty(diff.id)}
                >
                  <CardContent sx={{ textAlign: "center", py: { xs: 2.5, sm: 3 } }}>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: "bold",
                        color: diff.color,
                        fontSize: { xs: "1rem", sm: "1.25rem" },
                      }}
                    >
                      {t(`quiz.difficulty.${diff.id}`)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {menuStep === "category" && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", mb: { xs: 2, sm: 3 } }}>
            <IconButton onClick={() => setMenuStep("difficulty")} sx={{ mr: 1 }} size="small">
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="subtitle1" sx={{ fontWeight: "bold", color: "text.secondary" }}>
              {selectedDifficulty ? t(`quiz.difficulty.${selectedDifficulty}`) : ""}
              {" — "}
              {t("quiz.selectCategory", { defaultValue: "Select Category" })}
            </Typography>
          </Box>

          <Grid container spacing={2} sx={{ justifyContent: "center" }}>
            {categories.map((cat) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={cat.id}>
                <Card
                  sx={{
                    cursor: isLoading || cat.disabled ? "not-allowed" : "pointer",
                    borderRadius: 3,
                    height: "100%",
                    background: `linear-gradient(135deg, ${cat.color}22 0%, ${cat.color}11 100%)`,
                    border: "1px solid",
                    borderColor: `${cat.color}44`,
                    transition: "all 0.2s ease",
                    opacity: isLoading || cat.disabled ? 0.5 : 1,
                    pointerEvents: isLoading || cat.disabled ? "none" : "auto",
                    "&:active": { transform: "scale(0.98)" },
                    "&:hover": {
                      transform: cat.disabled ? "none" : "translateY(-4px)",
                      boxShadow: cat.disabled ? "none" : `0 8px 20px ${cat.color}33`,
                      borderColor: cat.color,
                    },
                  }}
                  onClick={() => !cat.disabled && handleStartQuiz(cat.id)}
                >
                  <CardContent
                    sx={{
                      py: { xs: 2.5, sm: 4 },
                      px: { xs: 2, sm: 3 },
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Box
                      sx={{
                        color: cat.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: { xs: 52, sm: 64 },
                        width: { xs: 52, sm: 64 },
                        borderRadius: "50%",
                        background: `${cat.color}15`,
                        flexShrink: 0,
                        "& svg": { fontSize: { xs: 32, sm: 40 } },
                      }}
                    >
                      {cat.icon}
                    </Box>
                    <Box sx={{ textAlign: "left" }}>
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: "bold", fontSize: { xs: "1rem", sm: "1.25rem" } }}
                      >
                        {t(`quiz.category.${cat.id}`)}
                      </Typography>
                      {cat.disabled && (
                        <Typography
                          variant="caption"
                          sx={{ color: "text.secondary", fontWeight: 600 }}
                        >
                          Coming Soon...
                        </Typography>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <Box sx={{ mt: { xs: 3, sm: 4 }, textAlign: "center" }}>
        <Button
          component={LocalizedLink}
          href="/quiz/list"
          variant="outlined"
          size="large"
          startIcon={<FormatListBulletedIcon />}
          sx={{
            borderRadius: 3,
            px: 3,
            py: 1.25,
            fontWeight: "bold",
          }}
        >
          {t("quiz.list.openList")}
        </Button>
      </Box>
    </Box>
  );
}
