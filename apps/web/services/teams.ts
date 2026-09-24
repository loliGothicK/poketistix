// services/teams.ts (フロントエンドで実行される)
import { Team } from "@/store/team/team";
import { withSpan } from "@/lib/otel";
import * as Sentry from "@sentry/nextjs";

export const fetchTeamsFromServer = async (): Promise<readonly Team[]> => {
  return withSpan("ui.teams.fetch", async (span) => {
    const res = await fetch("/api/teams", { cache: "no-store" });
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      Sentry.captureException(new Error("Failed to fetch teams"), {
        extra: { status: res.status, errorText },
      });
      throw new Error(`Failed to fetch teams: ${errorText}`);
    }
    return res.json() as Promise<readonly Team[]>;
  });
};

export const saveTeamsToServer = async (teams: readonly Team[]): Promise<void> => {
  return withSpan("ui.teams.save", async (span) => {
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teams),
    });
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      let errorMsg = errorText;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error && Array.isArray(parsed.error)) {
          errorMsg = parsed.error.map((e: { message: string }) => e.message).join(", ");
        }
      } catch {
        // ignore
      }
      Sentry.captureException(new Error("Failed to save teams"), {
        extra: { status: res.status, errorText },
      });
      throw new Error(errorMsg);
    }
  });
};

export const deleteTeamFromServer = async (teamId: string): Promise<void> => {
  return withSpan("ui.teams.delete", async (span) => {
    const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      Sentry.captureException(new Error("Failed to delete team"), {
        extra: { status: res.status, errorText, teamId },
      });
      throw new Error(`Failed to delete team: ${errorText}`);
    }
  });
};

import type { TeamDiff, TeamSnapshot } from "@/lib/team-diff";

export interface TeamRevisionData {
  readonly id: string;
  readonly teamId: string;
  readonly diff: TeamDiff;
  readonly snapshot: TeamSnapshot;
  readonly createdAt: string;
}

export const fetchTeamRevisions = async (teamId: string): Promise<readonly TeamRevisionData[]> => {
  return withSpan("ui.teams.fetchRevisions", async (span) => {
    span.setAttribute("teamId", teamId);
    const res = await fetch(`/api/teams/${teamId}/revisions`, { cache: "no-store" });
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      Sentry.captureException(new Error("Failed to fetch team revisions"), {
        extra: { status: res.status, errorText, teamId },
      });
      throw new Error(`Failed to fetch team revisions: ${errorText}`);
    }
    return res.json() as Promise<readonly TeamRevisionData[]>;
  });
};
