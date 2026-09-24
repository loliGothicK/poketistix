"use client";

import {
  alpha,
  Box,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
  Stack,
  Chip,
  Tooltip,
  Tabs,
  Tab,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import Image from "next/image";
import { itemById, itemList } from "@/data/items";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useMemo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveTeam } from "@/hooks/useActiveTeam";
import { itemSprite } from "@/lib/image";
import { match } from "ts-pattern";
import { ShareButton } from "@/components/client/share/ShareButton";
import type { TrainedPokemon } from "@/store/team/team";
import { SurfaceCard } from "@/components/common/SurfaceCard";
import { flexRowCenter } from "@/theme/sx";
import { TeamNotesWorkspace } from "@/components/client/team-builder/TeamNotesWorkspace";
import { parseTeamNotes, hasTeamNotes } from "@/lib/team-notes";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── ソータブルなスロット行 ────────────────────────────────────────────────────

function SortableSlotItem({
  id,
  index,
  member,
  isActive,
  onNavigate,
}: {
  readonly id: string;
  readonly index: number;
  readonly member: TrainedPokemon | null;
  readonly isActive: boolean;
  readonly onNavigate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Grid component="div" size={12} ref={setNodeRef} style={style}>
      <Box
        sx={{
          width: "100%",
          borderRadius: 1,
          py: 1,
          px: 2,
          border: "1px solid",
          borderColor: isActive
            ? theme.palette.primary.main
            : member
              ? theme.palette.divider
              : "transparent",
          bgcolor: isActive
            ? alpha(theme.palette.primary.main, 0.08)
            : member
              ? "background.paper"
              : "transparent",
          position: "relative",
          ...flexRowCenter,
          transition: "all 0.2s ease-in-out",
          opacity: isDragging ? 0.4 : 1,
          boxShadow: isDragging
            ? `0 8px 24px ${alpha(theme.palette.common.black, 0.18)}`
            : member
              ? `0 4px 12px ${alpha(theme.palette.common.black, 0.05)}`
              : "none",
          "&:hover": {
            borderColor: theme.palette.primary.main,
            transform: member && !isDragging ? "translateY(-2px)" : "none",
            boxShadow:
              member && !isDragging
                ? `0 8px 20px ${alpha(theme.palette.primary.main, 0.15)}`
                : "none",
          },
        }}
      >
        {/* ドラッグハンドル */}
        <IconButton
          size="small"
          {...attributes}
          {...listeners}
          sx={{
            cursor: isDragging ? "grabbing" : "grab",
            color: "text.disabled",
            touchAction: "none",
            mr: 0.5,
            flexShrink: 0,
            "&:hover": { color: "text.secondary" },
          }}
          aria-label={t("teamBuilder.dragToReorder")}
          // ハンドル部分はナビゲーション伝播を防ぐ
          onClick={(e) => e.stopPropagation()}
        >
          <DragIndicatorRoundedIcon fontSize="small" />
        </IconButton>

        {/* スロット本体（クリックで育成ページへ） */}
        <Box
          onClick={onNavigate}
          sx={{
            ...flexRowCenter,
            flexGrow: 1,
            cursor: "pointer",
            minWidth: 0,
          }}
        >
          {member ? (
            <>
              {/* アイコン */}
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  minWidth: 64,
                  minHeight: 64,
                  maxHeight: 64,
                  borderRadius: 2,
                  overflow: "hidden",
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  ...flexRowCenter,
                  justifyContent: "center",
                  position: "relative",
                  flexShrink: 0,
                  alignSelf: "center",
                }}
              >
                <Image
                  src={`/pokemon/${member.identifier}.png`}
                  alt={member.identifier}
                  width={56}
                  height={56}
                  style={{ display: "block" }}
                />
                {member.item &&
                  (() => {
                    const item = itemList.find((i) => i.id === member.item);
                    return item ? (
                      <Box
                        sx={{
                          position: "absolute",
                          bottom: 0,
                          right: 0,
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          bgcolor: "background.paperTint",
                          boxShadow: 2,
                          ...flexRowCenter,
                          justifyContent: "center",
                        }}
                      >
                        <Image
                          src={itemSprite(item.identifier)}
                          alt={item.identifier}
                          width={20}
                          height={20}
                        />
                      </Box>
                    ) : null;
                  })()}
              </Box>

              {/* テキスト情報 */}
              <Box sx={{ ml: 2, flexGrow: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                    {t(`pokemon.${member.identifier}.name`)}
                  </Typography>
                  {member.description && (
                    <Tooltip title={member.description}>
                      <Chip
                        label="Note"
                        size="small"
                        color="info"
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.65rem", px: 0.25 }}
                      />
                    </Tooltip>
                  )}
                </Stack>
                {i18n.exists(`pokemon.${member.identifier}.formName`) && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      display: "block",
                      fontWeight: 400,
                      lineHeight: 1.2,
                    }}
                    noWrap
                  >
                    {t(`pokemon.${member.identifier}.formName`)}
                  </Typography>
                )}
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", display: "block" }}
                  noWrap
                >
                  {member.item
                    ? `@ ${t(`items.${itemById.get(member.item)?.identifier}.name`)}`
                    : t("teamBuilder.noItem")}
                </Typography>
              </Box>
            </>
          ) : (
            /* 空スロット */
            <Box
              sx={{
                py: 1,
                px: 2,
                border: "1px dashed",
                borderColor: theme.palette.dividerSoft,
                borderRadius: 2,
                width: "100%",
                textAlign: "center",
              }}
            >
              <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
                {t("teamBuilder.emptyMember", { index: index + 1 })}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Grid>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

export default function TeamOverview({
  activeSlot,
  onSelectSlot,
  onBack,
}: {
  readonly activeSlot?: number;
  readonly onSelectSlot?: (slot: number) => void;
  readonly onBack?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [team, _updateSlot, updateTeamName, reorderMembers, , , , , updateTeamDescription] =
    useActiveTeam();

  const name = useMemo(() => team?.name ?? "", [team]);

  const maxNameLength = useMemo(
    () =>
      match(i18n.resolvedLanguage)
        .with("en", () => 12)
        .with("ja", () => 8)
        .otherwise(() => 12),
    [i18n.resolvedLanguage],
  );

  // dnd-kit センサー（ポインター + キーボード）
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // 5px 動かさないとドラッグ開始しない → クリックと区別できる
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // 空スロット用の安定した一意キー。並び替え時にもスロットと一緒に移動させて dnd-kit の追跡破綻を防ぐ
  const [slotKeys, setSlotKeys] = useState<readonly string[]>([
    "empty-0",
    "empty-1",
    "empty-2",
    "empty-3",
    "empty-4",
    "empty-5",
  ]);
  const [prevTeamId, setPrevTeamId] = useState(team?.id);

  if (team && team.id !== prevTeamId) {
    setPrevTeamId(team.id);
    setSlotKeys(["empty-0", "empty-1", "empty-2", "empty-3", "empty-4", "empty-5"]);
  }

  // 各スロットに対して安定した ID を割り当てて追跡する
  // ポケモンの場合は一意な member.boxId、空スロットの場合は空スロット用の永続キー
  const sortableIds = useMemo(
    () => (team ? team.members.map((m, i) => m?.boxId ?? slotKeys[i] ?? `slot-${i}`) : []),
    [team, slotKeys],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = sortableIds.indexOf(String(active.id));
      const toIndex = sortableIds.indexOf(String(over.id));
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

      // activeSlot の追従先を事前に計算する
      let nextActiveSlot = activeSlot;
      if (typeof activeSlot === "number") {
        if (activeSlot === fromIndex) {
          nextActiveSlot = toIndex;
        } else if (fromIndex < toIndex) {
          if (activeSlot > fromIndex && activeSlot <= toIndex) {
            nextActiveSlot = activeSlot - 1;
          }
        } else if (fromIndex > toIndex) {
          if (activeSlot >= toIndex && activeSlot < fromIndex) {
            nextActiveSlot = activeSlot + 1;
          }
        }
      }

      // 空スロットキーも並び替えに合わせて同期移動
      setSlotKeys((prev) => {
        const next = [...prev];
        const [movedKey] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, movedKey);
        return next;
      });

      reorderMembers(fromIndex, toIndex);

      if (typeof nextActiveSlot === "number" && nextActiveSlot !== activeSlot) {
        if (onSelectSlot) {
          onSelectSlot(nextActiveSlot);
        } else {
          const locale = i18n.resolvedLanguage ?? "ja";
          const params = new URLSearchParams(window.location.search);
          params.set("slot", nextActiveSlot.toString());
          router.replace(`/${locale}/team-builder?${params.toString()}`);
        }
      }
    },
    [sortableIds, activeSlot, onSelectSlot, reorderMembers, router, i18n.resolvedLanguage],
  );

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileTab, setMobileTab] = useState(0);
  const notes = useMemo(() => parseTeamNotes(team?.description), [team?.description]);
  const hasNotes = useMemo(() => hasTeamNotes(notes), [notes]);

  if (!team) return null;

  return (
    <SurfaceCard
      raised
      sx={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: { xs: 0 },
        border: { xs: "none" },
        py: { xs: 1.5, md: 3 },
        px: { xs: 1, md: 3 },
      }}
    >
      {/* モバイル用ヘッダー */}
      {onBack && (
        <>
          <Box sx={{ ...flexRowCenter, mb: 1.5, mx: -1 }}>
            <IconButton
              onClick={onBack}
              edge="start"
              size="small"
              aria-label={t("teamBuilder.back")}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, ml: 0.5, flexGrow: 1 }}>
              {name || t("teamBuilder.teamOverviewTitle")}
            </Typography>
            <ShareButton />
          </Box>
          <Divider sx={{ mb: 2 }} />
        </>
      )}

      {/* モバイル表示時のタブ切り替え（メンバー / 戦略ノート） */}
      {isMobile && (
        <Tabs
          value={mobileTab}
          onChange={(_, v) => setMobileTab(v)}
          variant="fullWidth"
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab label={t("teamBuilder.tabMembers")} />
          <Tab
            icon={
              hasNotes ? (
                <Chip
                  size="small"
                  color="primary"
                  label="✓"
                  sx={{ height: 16, fontSize: "0.65rem", mr: 0.5 }}
                />
              ) : undefined
            }
            iconPosition="end"
            label={t("teamBuilder.tabTeamNotes")}
          />
        </Tabs>
      )}

      {isMobile && mobileTab === 1 ? (
        <TeamNotesWorkspace
          description={team.description}
          onUpdateDescription={updateTeamDescription}
          isMobile
        />
      ) : (
        <>
          <TextField
            id="title"
            label={t("teamBuilder.teamName")}
            variant="outlined"
            value={name}
            onChange={(event) => updateTeamName(event.target.value)}
            slotProps={{
              htmlInput: { maxLength: maxNameLength },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Typography variant="body2">{`${name.length} / ${maxNameLength}`}</Typography>
                  </InputAdornment>
                ),
              },
            }}
          />

          <Divider sx={{ my: 2 }} />

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <Grid container spacing={2}>
                {team.members.map((member, index) => {
                  const id = sortableIds[index] ?? String(index);
                  return (
                    <SortableSlotItem
                      key={id}
                      id={id}
                      index={index}
                      member={member}
                      isActive={activeSlot === index}
                      onNavigate={() => {
                        if (onSelectSlot) {
                          onSelectSlot(index);
                        } else {
                          const locale = i18n.resolvedLanguage ?? "ja";
                          const params = new URLSearchParams(window.location.search);
                          params.set("slot", index.toString());
                          router.push(`/${locale}/team-builder?${params.toString()}`);
                        }
                      }}
                    />
                  );
                })}
              </Grid>
            </SortableContext>
          </DndContext>
        </>
      )}

      <Box sx={{ height: 72, display: { xs: "block", md: "none" } }} />
    </SurfaceCard>
  );
}
