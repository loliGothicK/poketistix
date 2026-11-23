import type { Kifu, KifuInput } from "@/store/kifu/kifu";
import { withSpan } from "@/lib/otel";
import * as Sentry from "@sentry/nextjs";

export const fetchKifuByBattleRecordFromServer = async (
  battleRecordId: string,
): Promise<Kifu | null> => {
  return withSpan("ui.kifus.fetchByBattleRecord", async (span) => {
    const params = new URLSearchParams({ battleRecordId });
    const res = await fetch(`/api/kifus?${params.toString()}`);
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      Sentry.captureException(new Error("Failed to fetch kifu"), {
        extra: { status: res.status, errorText, battleRecordId },
      });
      throw new Error(`Failed to fetch kifu: ${errorText}`);
    }
    const list = (await res.json()) as readonly Kifu[];
    return list[0] ?? null;
  });
};

export const saveKifuOnServer = async (input: KifuInput): Promise<Kifu> => {
  return withSpan("ui.kifus.save", async (span) => {
    const res = await fetch("/api/kifus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      Sentry.captureException(new Error("Failed to save kifu"), {
        extra: {
          status: res.status,
          errorText,
          battleRecordId: input.battleRecordId,
          pbnLength: input.pbn.length,
        },
      });
      throw new Error(`Failed to save kifu: ${errorText}`);
    }
    return (await res.json()) as Promise<Kifu>;
  });
};

export const deleteKifuFromServer = async (id: string): Promise<void> => {
  return withSpan("ui.kifus.delete", async (span) => {
    const res = await fetch(`/api/kifus/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const errorText = await res.text();
      span.setAttribute("error", true);
      Sentry.captureException(new Error("Failed to delete kifu"), {
        extra: { status: res.status, errorText, id },
      });
      throw new Error(`Failed to delete kifu: ${errorText}`);
    }
  });
};
