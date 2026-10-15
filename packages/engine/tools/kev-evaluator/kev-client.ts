import type { KevRequest, KevResponse } from "./types.js";

export interface KevClientOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export class KevClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: KevClientOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.KEV_BASE_URL || "http://127.0.0.1:8009").replace(
      /\/$/,
      "",
    );
    this.model = options.model || process.env.KEV_MODEL || "kev-latest";
    this.timeoutMs = options.timeoutMs ?? 120000;
  }

  private lastHealthCheck = 0;
  private isOnlineCache = false;

  /**
   * Checks if the Kev server is reachable.
   */
  async isHealthy(): Promise<boolean> {
    const now = Date.now();
    if (this.isOnlineCache && now - this.lastHealthCheck < 10000) {
      return true;
    }

    const controller = new AbortController();
    const id = setTimeout(() => {
      controller.abort();
    }, 3000);

    return fetch(`${this.baseUrl}/`, { signal: controller.signal })
      .then((res) => {
        clearTimeout(id);
        const ok = res.ok || res.status === 404;
        this.isOnlineCache = ok;
        this.lastHealthCheck = Date.now();
        return ok;
      })
      .catch(() => {
        clearTimeout(id);
        this.isOnlineCache = false;
        return false;
      });
  }

  /**
   * Sends decision questions to the local Kev System One API server.
   */
  async decide(request: KevRequest): Promise<KevResponse> {
    const payload = {
      model: request.model || this.model,
      state: request.state,
      questions: request.questions,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/v1/systemone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Kev server returned status ${response.status}: ${errorText}`);
      }

      const json: KevResponse = await response.json();
      return json;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
