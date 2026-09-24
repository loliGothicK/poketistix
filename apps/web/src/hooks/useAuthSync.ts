"use client";

import { useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { isAuthenticatedAtom } from "@/store/auth";
import { localTeamsAtom, type Team, type TrainedPokemon } from "@/store/team/team";
import { fetchTeamsFromServer, saveTeamsToServer } from "@services/teams";
import { teamSchema } from "@/lib/validator/team";

export type SlotResolution = "local" | "server" | "none";

export type TeamMergeConflict = {
  readonly teamId: string;
  readonly name: string;
  readonly localTeam: Team | null;
  readonly serverTeam: Team | null;
  readonly slotResolutions: SlotResolution[];
};

type AuthSyncResult = {
  readonly isMergeOpen: boolean;
  readonly conflicts: TeamMergeConflict[];
  readonly setConflicts: React.Dispatch<React.SetStateAction<TeamMergeConflict[]>>;
  readonly onMergeCommit: () => Promise<void>;
  readonly onMergeCancel: () => void;
};

export const useAuthSync = (): AuthSyncResult => {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const [localTeams, setLocalTeams] = useAtom(localTeamsAtom);
  const queryClient = useQueryClient();

  const prevIsAuthenticated = useRef(isAuthenticated);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [conflicts, setConflicts] = useState<TeamMergeConflict[]>([]);

  useEffect(() => {
    const wasLoggedOut = prevIsAuthenticated.current === false;
    const isNowLoggedIn = isAuthenticated === true;

    if (wasLoggedOut && isNowLoggedIn && localTeams.length > 0) {
      void (async () => {
        const serverTeams = await queryClient.query({
          queryKey: ["teams"],
          queryFn: fetchTeamsFromServer,
        });

        if (serverTeams.length === 0) {
          await saveTeamsToServer(localTeams);
          await queryClient.invalidateQueries({ queryKey: ["teams"] });
          setLocalTeams([]);
        } else {
          const teamIds = new Set<string>([
            ...localTeams.map((t) => t.id),
            ...serverTeams.map((t) => t.id),
          ]);

          const newConflicts: TeamMergeConflict[] = Array.from(teamIds).map((teamId) => {
            const localTeam = localTeams.find((t) => t.id === teamId) || null;
            const serverTeam = serverTeams.find((t) => t.id === teamId) || null;

            const name = localTeam?.name || serverTeam?.name || "";

            const slotResolutions: SlotResolution[] = [];
            for (let i = 0; i < 6; i++) {
              const localMem = localTeam?.members[i] || null;
              const serverMem = serverTeam?.members[i] || null;

              if (localMem && !serverMem) {
                slotResolutions.push("local");
              } else if (!localMem && serverMem) {
                slotResolutions.push("server");
              } else if (localMem && serverMem) {
                // デフォルトはサーバー優先
                slotResolutions.push("server");
              } else {
                slotResolutions.push("none");
              }
            }

            return { teamId, name, localTeam, serverTeam, slotResolutions };
          });

          setConflicts(newConflicts);
          setIsMergeOpen(true);
        }
      })();
    }

    prevIsAuthenticated.current = isAuthenticated;
  }, [isAuthenticated, queryClient, localTeams.length, setLocalTeams, localTeams]);

  const onMergeCommit = async () => {
    const mergedTeams: Team[] = conflicts.map((conflict) => {
      const members: (TrainedPokemon | null)[] = [];
      for (let i = 0; i < 6; i++) {
        const res = conflict.slotResolutions[i];
        if (res === "local") {
          members.push(conflict.localTeam?.members[i] || null);
        } else if (res === "server") {
          members.push(conflict.serverTeam?.members[i] || null);
        } else {
          members.push(null);
        }
      }
      return {
        id: conflict.teamId,
        name: conflict.name,
        description: conflict.localTeam?.description || conflict.serverTeam?.description,
        members,
      };
    });

    const validTeams: Team[] = [];
    const invalidTeams: Team[] = [];

    for (const t of mergedTeams) {
      const hasMember = t.members.some((m) => m !== null);
      if (!hasMember) continue;

      if (teamSchema.safeParse(t).success) {
        validTeams.push(t);
      } else {
        invalidTeams.push(t);
      }
    }

    await saveTeamsToServer(validTeams);
    await queryClient.invalidateQueries({ queryKey: ["teams"] });

    // Invalid teams are kept in local storage so the user can fix them later.
    setLocalTeams(invalidTeams);
    setIsMergeOpen(false);
    setConflicts([]);
  };

  const onMergeCancel = () => {
    setIsMergeOpen(false);
    setConflicts([]);
  };

  return { isMergeOpen, conflicts, setConflicts, onMergeCommit, onMergeCancel };
};
