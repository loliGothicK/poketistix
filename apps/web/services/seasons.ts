// services/seasons.ts (フロントエンドで実行される)
import type { Season, SeasonInput, SeasonUpdate } from "@/store/battle-record/battleRecord";
import { withSpan } from "@/lib/otel";
import * as Sentry from "@sentry/nextjs";

export const fetchSeasonsFromServer = async (): Promise<readonly Season[]> => {
  return withSpan("ui.seasons.fetchList", async (span) => {
    const res = await fetch("/api/seasons");
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      Sentry.captureException(new Error("Failed to fetch seasons"), {
        extra: { status: res.status, errorText },
      });
      throw new Error(`Failed to fetch seasons: ${errorText}`);
    }
    return res.json() as Promise<readonly Season[]>;
  });
};

const formatErrorMessage = (errorText: string, defaultMessage: string): string => {
  try {
    const parsed = JSON.parse(errorText);
    if (parsed.error) {
      if (Array.isArray(parsed.error)) {
        return parsed.error
          .map((issue: { path?: readonly (string | number)[]; message?: string }) => {
            const pathStr = issue.path && issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
            return `${pathStr}${issue.message ?? "Validation error"}`;
          })
          .join(", ");
      }
      if (typeof parsed.error === "string") {
        return parsed.error;
      }
      return JSON.stringify(parsed.error);
    }
  } catch {
    // ignore
  }
  return errorText.trim().length > 0 ? errorText : defaultMessage;
};

export const createSeasonOnServer = async (input: SeasonInput): Promise<Season> => {
  return withSpan("ui.seasons.create", async (span) => {
    const res = await fetch("/api/seasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      const errorMsg = formatErrorMessage(errorText, "Failed to create season");
      Sentry.captureException(new Error("Failed to create season"), {
        extra: { status: res.status, errorText, input },
      });
      throw new Error(errorMsg);
    }
    return res.json() as Promise<Season>;
  });
};

export const updateSeasonOnServer = async (id: string, input: SeasonUpdate): Promise<Season> => {
  return withSpan("ui.seasons.update", async (span) => {
    const res = await fetch(`/api/seasons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      const errorMsg = formatErrorMessage(errorText, "Failed to update season");
      Sentry.captureException(new Error("Failed to update season"), {
        extra: { status: res.status, errorText, id, input },
      });
      throw new Error(errorMsg);
    }
    return res.json() as Promise<Season>;
  });
};

export const deleteSeasonFromServer = async (id: string): Promise<void> => {
  return withSpan("ui.seasons.delete", async (span) => {
    const res = await fetch(`/api/seasons/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      Sentry.captureException(new Error("Failed to delete season"), {
        extra: { status: res.status, errorText, id },
      });
      throw new Error(`Failed to delete season: ${errorText}`);
    }
  });
};
