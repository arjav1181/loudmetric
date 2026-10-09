import { NextResponse } from "next/server";
import { getCurrentUser, allowedSiteIds } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { runAgent, type AgentResult } from "@/lib/ai/agent";
import { aiProviderName } from "@/lib/ai/provider";
import type { Message } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The copilot endpoint.
 *
 * Three things happen here that the agent deliberately does not do for itself:
 *
 *   1. AUTHENTICATION AND SITE AUTHORISATION. The site id arrives from the
 *      browser, so it is checked against the caller's allowed sites before the
 *      agent ever sees it. Without this, any authenticated user could point the
 *      copilot at another tenant's data by editing a query parameter.
 *
 *   2. RATE LIMITING. This endpoint spends an operator's own API credits or
 *      their own CPU running a local model. An unmetered version is a way for
 *      one client to burn both.
 *
 *   3. PROVIDER FAILURE CONTAINMENT. If Ollama is not running, the user gets a
 *      sentence they can act on rather than a stack trace from an unreachable
 *      port.
 */
function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const g = globalThis as unknown as { lmCopilot?: Map<string, number[]> };
  if (!g.lmCopilot) g.lmCopilot = new Map();
  const now = Date.now();
  const hits = (g.lmCopilot.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    g.lmCopilot.set(key, hits);
    return false;
  }
  hits.push(now);
  g.lmCopilot.set(key, hits);
  // Opportunistic cleanup so the map cannot grow without bound.
  if (g.lmCopilot.size > 5000) {
    for (const [k, v] of g.lmCopilot) {
      if (v.every((t) => now - t >= windowMs)) g.lmCopilot.delete(k);
    }
  }
  return true;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { siteId?: string; question?: string; history?: Message[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const question = (body.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "empty question" }, { status: 400 });
  if (question.length > 2000) return NextResponse.json({ error: "question too long" }, { status: 400 });

  // Authorisation happens before anything expensive or model-facing.
  const allowed = await allowedSiteIds(user.id);
  if (!body.siteId || !allowed.includes(body.siteId)) {
    return NextResponse.json({ error: "forbidden", message: "You do not have access to that site." }, { status: 403 });
  }

  if (!rateLimit(`copilot:${user.id}`, 30, 60_000)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Slow down — 30 questions a minute is the limit." },
      { status: 429 },
    );
  }

  const siteRes = await getPool().query<{ name: string }>("SELECT name FROM sites WHERE id = $1", [body.siteId]);
  const siteName = siteRes.rows[0]?.name ?? "your site";

  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());

  const stream = new ReadableStream({
    async start(controllerStream) {
      const send = (event: string, data: unknown) => {
        try {
          controllerStream.enqueue(
            new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* client went away */
        }
      };

      try {
        send("meta", { provider: aiProviderName(), siteName });
        const result: AgentResult = await runAgent(
          question,
          body.siteId!,
          siteName,
          Array.isArray(body.history) ? body.history.slice(-8) : [],
          controller.signal,
        );
        send("result", result);
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        // Ollama not running is the single most likely failure and the least
        // useful raw error, so it gets a real message.
        if (/fetch failed|ECONNREFUSED|ollama/i.test(raw)) {
          send("error", {
            message:
              "Could not reach the model. If you are using Ollama, start it with `ollama serve` and pull a model, e.g. `ollama pull qwen2.5-coder:7b`.",
          });
        } else {
          send("error", { message: raw.slice(0, 300) });
        }
      } finally {
        try {
          controllerStream.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}