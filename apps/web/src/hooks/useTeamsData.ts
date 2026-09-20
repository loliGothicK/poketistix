import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { isAuthenticatedAtom } from "@/store/auth";
import { fetchTeamsFromServer, deleteTeamFromServer } from "@services/teams";
import { localTeamsAtom, Team } from "@/store/team/team";

export const useTeamsData = () => {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const [localTeams, setLocalTeams] = useAtom(localTeamsAtom);
  const queryClient = useQueryClient();

  // 取得用Query：ログイン時のみ有効化
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: fetchTeamsFromServer,
    enabled: isAuthenticated === true,
    staleTime: 1000 * 60 * 5, // 5分キャッシュ保持
    gcTime: 1000 * 60 * 30, // 30分保持
  });

  // 削除用Mutation
  const deleteTeamMutation = useMutation({
    mutationFn: deleteTeamFromServer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const serverTeams = teamsQuery.data ?? queryClient.getQueryData<readonly Team[]>(["teams"]) ?? [];

  // データソースの切り替え: 認証確認中は空、ログイン時はサーバー優先マージ、未ログイン時はローカルデータ
  const teams =
    isAuthenticated === null
      ? []
      : isAuthenticated
        ? [
            ...serverTeams.map((st) => localTeams.find((lt) => lt.id === st.id) ?? st),
            ...localTeams.filter((lt) => !serverTeams.some((st) => st.id === lt.id)),
          ]
        : localTeams;

  // 新規チーム追加ロジック: ローカルストレージに追加し、ログイン中ならクエリキャッシュにも即座にマージ
  const addTeam = (newTeam: Team) => {
    setLocalTeams((prev) => [...prev.filter((t) => t.id !== newTeam.id), newTeam]);
    if (isAuthenticated) {
      queryClient.setQueryData<readonly Team[]>(["teams"], (old = []) => [
        ...old.filter((t) => t.id !== newTeam.id),
        newTeam,
      ]);
    }
  };

  // 更新ロジック: ローカルストレージに即時反映（未保存変更として保持）
  const updateTeams = (newTeams: readonly Team[]) => {
    setLocalTeams(newTeams);
  };

  // 削除ロジック: ローカルストレージとクエリキャッシュの両方から即座に除去
  const removeTeam = (teamId: string) => {
    setLocalTeams((prev) => prev.filter((t) => t.id !== teamId));

    if (isAuthenticated) {
      queryClient.setQueryData<readonly Team[]>(["teams"], (old = []) =>
        old.filter((t) => t.id !== teamId),
      );
      deleteTeamMutation.mutate(teamId);
    }
  };

  const isLoading = isAuthenticated === null || (isAuthenticated === true && teamsQuery.isLoading);

  return {
    teams,
    isLoading,
    isError: isAuthenticated === true ? teamsQuery.isError : false,
    addTeam,
    updateTeams,
    removeTeam,
  };
};
