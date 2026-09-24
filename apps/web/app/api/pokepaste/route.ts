import { NextRequest, NextResponse } from "next/server";
import { withSpan } from "@/lib/otel";
import * as Sentry from "@sentry/nextjs";
import { extractPokepasteId } from "@/lib/pokepaste";

export async function GET(req: NextRequest) {
  return withSpan("api.pokepaste.fetch", async (span) => {
    const rawId = req.nextUrl.searchParams.get("id") ?? "";
    const id = extractPokepasteId(rawId);

    if (!id) {
      span.setAttribute("error", true);
      span.setAttribute("pokepaste.invalid_input", rawId);
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    span.setAttribute("pokepaste.id", id);

    try {
      const res = await fetch(`https://pokepast.es/${id}/raw`, {
        headers: {
          "User-Agent": "Poketistix/1.0 (+https://poketistix.mitama.io)",
        },
        cache: "no-store",
      });

      if (res.status === 404) {
        span.setAttribute("pokepaste.not_found", true);
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }

      if (!res.ok) {
        const errorText = await res.text();
        span.setAttribute("error", true);
        span.setAttribute("upstream.status", res.status);
        Sentry.captureException(new Error("Pokepaste upstream error"), {
          extra: { id, status: res.status, errorText },
        });
        return NextResponse.json({ error: "upstream_error", status: res.status }, { status: 502 });
      }

      const paste = await res.text();
      return NextResponse.json({ paste });
    } catch (err) {
      span.setAttribute("error", true);
      Sentry.captureException(err, { extra: { id } });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  });
}
