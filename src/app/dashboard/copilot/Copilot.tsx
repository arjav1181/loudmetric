"use client";

import { useRef, useState } from "react";
import { InteractiveBars as BarChart } from "../charts";
import type { AgentResult, AgentStep } from "@/lib/ai/agent";

/**
 * The copilot surface.
 *
 * The model chooses WHAT to ask the database and WHY, and this file decides how
 * the answer looks. That split is the whole idea: the LLM never emits markup,
 * never picks a colour, and never draws anything. It returns a row set and a
 * shape hint, and the app renders it with the same components the rest of the
 * dashboard uses — so an AI answer is visually indistinguishable from a built-in
 * panel, which is the point. A copilot that draws its own bespoke charts is a
 * copilot that will eventually draw an unreadable one.
 *
 * The grounding notice is deliberately prominent rather than hidden in a
 * tooltip. When the model states a number that is not in any result set, the
 * user is told, in place, before they act on it.
 */

type Msg = {
  role: "user" | "assistant";
  text: string;
  result?: AgentResult;
  provider?: string;
  pending?: boolean;
  error?: string;
};

const SUGGESTIONS = [
  "How is my site doing?",
  "Which pages are slowest?",
  "Where does my traffic come from?",
  "Compare the last 7 days to the 7 before",
  "Am I losing people on the homepage?",
];

export default function Copilot({ siteId }: { siteId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    setInput("");
    setBusy(true);
    setMessages((m) => [
      ...m,
      { role: "user", text: q },
      { role: "assistant", text: "", pending: true },
    ]);

    const controller = new AbortController();
    abort.current = controller;

    const history = messages
      .filter((m) => !m.pending && !m.error)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text }));

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, question: q, history }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        throw new Error(err.message ?? err.error ?? "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let provider = "";

      const patch = (fn: (m: Msg) => Msg) =>
        setMessages((all) => {
          const next = [...all];
          const i = next.length - 1;
          next[i] = fn(next[i]);
          return next;
        });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; partial frames are kept.
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";

        for (const frame of frames) {
          const evLine = frame.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!evLine || !dataLine) continue;
          const event = evLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6));

          if (event === "meta") provider = data.provider;
          if (event === "result") {
            patch((m) => ({ ...m, text: data.answer, result: data as AgentResult, pending: false, provider }));
          }
          if (event === "error") {
            patch((m) => ({ ...m, pending: false, error: data.message, provider }));
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages((all) => {
          const next = [...all];
          const i = next.length - 1;
          next[i] = { ...next[i], pending: false, error: (e as Error).message };
          return next;
        });
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-1px)] flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-5 sm:p-7">
        {messages.length === 0 ? (
          <div className="pt-8">
            <p className="text-[13px] leading-relaxed text-white/40">
              Ask a question about your traffic. The model writes SQL, Postgres runs it, and you get
              the real numbers — it never does the counting itself.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-md border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-left text-[12px] text-white/55 transition-colors hover:border-white/25 hover:text-white/85"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i}>
            {m.role === "user" ? (
              <p className="font-mono text-[12px] text-white/45">{m.text}</p>
            ) : (
              <div className="space-y-3">
                {m.pending ? (
                  <p className="font-mono text-[12px] text-white/30">reading the database…</p>
                ) : m.error ? (
                  <p className="rounded-md border border-red-400/20 bg-red-400/[0.04] p-3 text-[13px] text-red-200/90">
                    {m.error}
                  </p>
                ) : (
                  <>
                    {/* Charts first: the model chose the query, the app draws it. */}
                    {m.result?.steps.filter((s) => !s.error && s.rows?.length).map((s, si) => (
                      <StepCard key={si} step={s} />
                    ))}

                    {m.text ? (
                      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-white/85">
                        {m.text}
                      </p>
                    ) : null}

                    {m.result && m.result.ungrounded.length > 0 ? (
                      <div className="rounded-md border border-amber-400/25 bg-amber-400/[0.04] p-3">
                        <p className="text-[12px] font-medium text-amber-200/90">
                          {m.result.ungrounded.length} figure
                          {m.result.ungrounded.length === 1 ? "" : "s"} above could not be found in
                          any query result
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-amber-200/60">
                          {m.result.ungrounded.join(", ")}
                        </p>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-200/50">
                          The model may have computed these instead of reading them. Check them
                          against the panels above before acting on them.
                        </p>
                      </div>
                    ) : null}

                    {m.result?.truncated ? (
                      <p className="font-mono text-[11px] text-white/25">
                        stopped after 6 tool calls — ask something narrower
                      </p>
                    ) : null}

                    {m.provider ? (
                      <p className="font-mono text-[10px] text-white/15">model: {m.provider}</p>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 border-t border-white/[0.06] bg-black/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl gap-2 p-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="Ask about your traffic…"
            maxLength={2000}
            className="flex-1 rounded-md border border-white/[0.1] bg-white/[0.02] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-white/30"
            disabled={busy}
          />
          {busy ? (
            <button
              onClick={() => abort.current?.abort()}
              className="rounded-md border border-white/15 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-white/60 hover:border-white/40"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => ask(input)}
              disabled={!input.trim()}
              className="rounded-md border border-white/15 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-white/70 transition-colors hover:border-white/40 disabled:opacity-30"
            >
              Ask
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders one tool result. The `render.kind` came from the model, but the
 * drawing is ours — same components, same typography, same numbers in the
 * tooltip as everywhere else in the dashboard.
 */
function StepCard({ step }: { step: AgentStep }) {
  const rows = step.rows ?? [];
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <p className="truncate text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">
          {step.render.label}
        </p>
        {step.sql ? (
          <details className="shrink-0">
            <summary className="cursor-pointer font-mono text-[10px] text-white/30 hover:text-white/60">
              SQL
            </summary>
            <pre className="mt-2 max-w-lg overflow-x-auto rounded border border-white/[0.08] bg-black/50 p-2 font-mono text-[10px] leading-relaxed text-white/50">
              {step.sql}
            </pre>
          </details>
        ) : null}
      </div>

      <div className="p-3">
        {step.render.kind === "line" || step.render.kind === "bars" ? (
          <BarChart
            points={rows.map((r) => ({
              label: String(r.label ?? ""),
              value: Number(r.value) || 0,
              secondary: r.secondary === undefined ? undefined : Number(r.secondary) || 0,
            }))}
            primary={step.render.kind === "line" ? "Pageviews" : "Views"}
            secondary={r2(rows) ? "Visitors" : undefined}
            height={120}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-[12px]">
              <thead>
                <tr>
                  {(step.columns?.length ? step.columns : Object.keys(rows[0] ?? {})).map((c) => (
                    <th
                      key={c}
                      className="border-b border-white/[0.06] pb-1.5 text-left font-mono text-[10px] font-medium tracking-[0.14em] text-white/30 uppercase"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-white/[0.04] last:border-0">
                    {Object.entries(r).map(([k, v], ci) => (
                      <td
                        key={k}
                        className={`py-1.5 font-mono tabular-nums ${
                          ci === 0 ? "text-white/75" : "text-white/50"
                        }`}
                      >
                        {typeof v === "number"
                          ? ci === 0
                            ? v.toLocaleString()
                            : v.toLocaleString()
                          : String(v).slice(0, 60)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rows.length > 20 ? (
        <p className="border-t border-white/[0.05] px-3 py-1.5 font-mono text-[10px] text-white/25">
          showing 20 of {rows.length} rows
        </p>
      ) : null}
      <span className="sr-only">{max}</span>
    </div>
  );
}

function r2(rows: Record<string, unknown>[]): boolean {
  return rows.some((r) => r.secondary !== undefined);
}