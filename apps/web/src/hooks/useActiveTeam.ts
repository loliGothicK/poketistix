import { useAtom, useAtomValue } from "jotai";
import { atom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useCallback } from "react";
import { isAuthenticatedAtom } from "@/store/auth";
import { localTeamsAtom, activeTeamIdAtom, Team, TrainedPokemon } from "@/store/team/team";
import { fetchTeamsFromServer } from "@services/teams";

const HISTORY_LIMIT = 50;
const DEBOUNCE_MS = 500;

interface HistoryEntry {
  readonly past: readonly Team[];
  readonly future: readonly Team[];
}

export const teamHistoryAtom = atom<Map<string, HistoryEntry>>(new Map());

export const useActiveTeam = () => {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const [localTeams, setLocalTeams] = useAtom(localTeamsAtom);
  const storedActiveId = useAtomValue(activeTeamIdAtom);
  const queryClient = useQueryClient();
  const [historyMap, setHistoryMap] = useAtom(teamHistoryAtom);

  const lastEditTimeRef = useRef<number>(0);

  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: fetchTeamsFromServer,
    enabled: isAuthenticated === true,
    staleTime: 1000 * 60 * 5, // 5分キャッシュ保持
    gcTime: 1000 * 60 * 30, // 30分保持
  });
  const serverTeams = teamsQuery.data ?? queryClient.getQueryData<readonly Team[]>(["teams"]) ?? [];
  const teams =
    isAuthenticated === null
      ? []
      : isAuthenticated
        ? [
            ...serverTeams.map((st) => localTeams.find((lt) => lt.id === st.id) ?? st),
            ...localTeams.filter((lt) => !serverTeams.some((st) => st.id === lt.id)),
          ]
        : localTeams;

  // 有効な保存済み選択がなければ先頭チームにフォールバックする (レンダー時導出。effect による書き戻しはしない)
  const activeId =
    storedActiveId && teams.some((t) => t.id === storedActiveId)
      ? storedActiveId
      : (teams[0]?.id ?? null);

  const team = activeId ? teams.find(({ id }) => id === activeId) : undefined;

  const getHistoryEntry = useCallback(
    (id: string): HistoryEntry => historyMap.get(id) ?? { past: [], future: [] },
    [historyMap],
  );

  const setHistoryEntry = useCallback(
    (id: string, entry: HistoryEntry) => {
      setHistoryMap((prev) => {
        const next = new Map(prev);
        next.set(id, entry);
        return next;
      });
    },
    [setHistoryMap],
  );

  const applyLocalUpdate = useCallback(
    (updater: (team: Team) => Team, skipHistory = false) => {
      if (!activeId) return;

      setLocalTeams((prevLocal) => {
        const cachedServerTeams = queryClient.getQueryData<readonly Team[]>(["teams"]) ?? [];
        const localTeam = prevLocal.find((t) => t.id === activeId);
        const serverTeam = cachedServerTeams.find((t) => t.id === activeId);
        const baseTeam = localTeam ?? serverTeam;
        if (!baseTeam) return prevLocal;

        if (!skipHistory) {
          const now = Date.now();
          const entry = getHistoryEntry(activeId);
          if (now - lastEditTimeRef.current > DEBOUNCE_MS) {
            const newPast = [...entry.past, structuredClone(baseTeam)].slice(-HISTORY_LIMIT);
            setHistoryEntry(activeId, { past: newPast, future: [] });
          }
          lastEditTimeRef.current = now;
        }

        const updated = updater(baseTeam);
        const nextLocal = prevLocal.some((t) => t.id === activeId)
          ? prevLocal.map((t) => (t.id === activeId ? updated : t))
          : [...prevLocal, updated];

        return nextLocal;
      });
    },
    [activeId, setLocalTeams, queryClient, getHistoryEntry, setHistoryEntry],
  );

  const updateSlot = useCallback(
    (slotIndex: number, trained: TrainedPokemon | null) => {
      applyLocalUpdate((t) => ({
        ...t,
        members: t.members.map((m, i) => (i === slotIndex ? trained : m)),
      }));
    },
    [applyLocalUpdate],
  );

  const updateTeamName = useCallback(
    (name: string) => {
      applyLocalUpdate((t) => ({ ...t, name }));
    },
    [applyLocalUpdate],
  );

  const reorderMembers = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      applyLocalUpdate((t) => {
        const next = [...t.members];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return { ...t, members: next };
      });
    },
    [applyLocalUpdate],
  );

  const undo = useCallback(() => {
    if (!activeId) return;
    const entry = getHistoryEntry(activeId);
    if (entry.past.length === 0) return;

    const currentLocal = localTeams.find((t) => t.id === activeId);
    const cachedServerTeams = queryClient.getQueryData<readonly Team[]>(["teams"]) ?? [];
    const current = currentLocal ?? cachedServerTeams.find((t) => t.id === activeId);
    if (!current) return;

    const newPast = [...entry.past];
    const target = newPast.pop()!;
    const newFuture = [structuredClone(current), ...entry.future].slice(0, HISTORY_LIMIT);

    lastEditTimeRef.current = 0;
    setHistoryEntry(activeId, { past: newPast, future: newFuture });
    applyLocalUpdate(() => target, true);
  }, [activeId, getHistoryEntry, setHistoryEntry, localTeams, queryClient, applyLocalUpdate]);

  const redo = useCallback(() => {
    if (!activeId) return;
    const entry = getHistoryEntry(activeId);
    if (entry.future.length === 0) return;

    const currentLocal = localTeams.find((t) => t.id === activeId);
    const cachedServerTeams = queryClient.getQueryData<readonly Team[]>(["teams"]) ?? [];
    const current = currentLocal ?? cachedServerTeams.find((t) => t.id === activeId);
    if (!current) return;

    const newFuture = [...entry.future];
    const target = newFuture.shift()!;
    const newPast = [...entry.past, structuredClone(current)].slice(-HISTORY_LIMIT);

    lastEditTimeRef.current = 0;
    setHistoryEntry(activeId, { past: newPast, future: newFuture });
    applyLocalUpdate(() => target, true);
  }, [activeId, getHistoryEntry, setHistoryEntry, localTeams, queryClient, applyLocalUpdate]);

  const canUndo = activeId ? getHistoryEntry(activeId).past.length > 0 : false;
  const canRedo = activeId ? getHistoryEntry(activeId).future.length > 0 : false;

  return [team, updateSlot, updateTeamName, reorderMembers, undo, redo, canUndo, canRedo] as const;
};
