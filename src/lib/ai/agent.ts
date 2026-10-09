import { getOverview, getPages, getVitals } from "@/lib/queries";
import { runGuarded, SCHEMA_HINT } from "@/lib/sql-guard";
import { getProvider, type Message, type Provider, type ToolDef, type ToolCall } from "./provider";

/**
 * The copilot.
 *
 * One rule governs everything below: THE MODEL NEVER COMPUTES YOUR NUMBERS.
 *
 * It chooses which query to run, writes the SQL, reads the rows Postgres
 * returned, and explains them. Every figure in every answer originates in a
 * result set, never in the model's arithmetic. That is the whole difference
 * between an analytics assistant you can trust and one that confidently
 * tells you 47% of your traffic came from Twitter.
 *
 * `verifyGrounding` at the bottom enforces that promise rather than assuming it.
 */

const MAX_STEPS = 6;

const SYSTEM = `You are the analyst inside LoudMetric, a self-hosted cookieless analytics tool.

You answer questions about one website's traffic by writing SQL and explaining the
results. You do not have the numbers in your head — you go and get them. If you did
not run a query, you do not know the answer, and you must say so.

## Rules

1. NEVER state a number you did not receive from a tool result. This is absolute.
2. Prefer the semantic tools (overview, pages, vitals) over raw SQL. They are
   tested; your SQL is not.
3. When you do write SQL: always filter site_id = $1 AND occurred_at >= now() - interval '<n> days'.
   $1 is bound for you. Never inline a site id. Always end with LIMIT.
4. If a query fails, read the Postgres error and fix the query. Do not give up, and
   do not apologise at length — one line about what you tried is plenty.
5. Interpret, do not just transcribe. "Homepage has 60% of traffic and the worst LCP
   on the site" is useful. A table of raw counts is not.
6. Say what the data CANNOT tell you. This tool has no persistent visitor id, so
   cross-day journeys, returning-user rates and cohort retention are unknowable. If
   a question needs one of those, say so plainly instead of approximating.

## Schema

${SCHEMA_HINT}

## Today

${new Date().toISOString().slice(0, 10)} (UTC).

## Voice

Direct. Lead with the answer, then the evidence. No filler, no "great question",
no restating the question back. If the answer is "this went down 12% because
Saturday", say that in one sentence.`;

const TOOLS: ToolDef[] = [
  {
    name: "overview",
    description:
      "Traffic summary for a window: pageviews, unique visitors, sessions, bounce rate, average dwell, custom events, plus a daily series and deltas against the previous window. Use this for any general 'how is my site doing' question.",
    parameters: {
      type: "object",
      properties: {
        range: { type: "string", enum: ["24h", "7d", "30d", "90d"], description: "Time window. Default 30d." },
      },
    },
  },
  {
    name: "pages",
    description: "Top pages by views with per-page visitor counts. Use for 'what are my most popular pages'.",
    parameters: {
      type: "object",
      properties: {
        range: { type: "string", enum: ["24h", "7d", "30d", "90d"] },
        limit: { type: "number", description: "Default 25, max 100." },
      },
    },
  },
  {
    name: "vitals",
    description: "Real Core Web Vitals (LCP, CLS, INP) p75 measured from actual visitors. Use for anything about speed, performance, or Core Web Vitals.",
    parameters: {
      type: "object",
      properties: { range: { type: "string", enum: ["24h", "7d", "30d", "90d"] } },
    },
  },
  {
    name: "query",
    description:
      "Run a read-only SQL query against the events table for an escape hatch the other tools do not cover — referrers, funnels, custom breakdowns, cohorts within a single day. The query is executed inside a READ ONLY transaction and cannot write anything.",
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description:
            "A single SELECT. Must filter on site_id = $1 and a time range, must not select visitor_hash or session_id, must end with LIMIT (max 200).",
        },
        why: { type: "string", description: "One line on what this answers. Shown to the user." },
      },
      required: ["sql"],
    },
  },
];

/** What the UI renders. The model picks a shape; the app draws it. */
export type Render = { kind: "line" | "bars" | "table" | "stat" | "funnel"; label: string };

export type AgentStep = {
  tool: string;
  args: Record<string, unknown>;
  render: Render;
  /** Present only for `query`, so the user can see and audit the SQL. */
  sql?: string;
  error?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  /**
   * Every number the model was actually shown, flattened.
   *
   * Grounding must be checked against this and not against `rows` alone: the
   * tool result handed to the model contains totals and deltas that are not in
   * the rendered rows, so a model correctly quoting "bounce rate 56.7%" from
   * that payload would otherwise be flagged as hallucinating.
   */
  numericContext: string[];
};

export type AgentResult = {
  answer: string;
  steps: AgentStep[];
  /** Numbers in `answer` that do not appear in any result set. */
  ungrounded: number[];
  truncated: boolean;
};

function parseRange(v: unknown): "24h" | "7d" | "30d" | "90d" {
  return v === "24h" || v === "7d" || v === "90d" ? v : "30d";
}

async function execute(
  call: ToolCall,
  siteId: string,
): Promise<{ result: string; step: AgentStep }> {
  const a = call.arguments ?? {};
  /** Collect the numbers in a tool result so grounding can verify them later. */
  const context = (payload: unknown): string[] => {
    const out: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "number") out.push(String(v));
      else if (typeof v === "string") return; // dates, labels: not numbers
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(payload);
    return out;
  };

  if (call.name === "overview") {
    const range = parseRange(a.range);
    const o = await getOverview(siteId, range);
    const payload = {
      range,
      pageviews: o.totals.pageviews,
      visitors: o.totals.visitors,
      sessions: o.totals.sessions,
      bounceRate: o.totals.bounceRate,
      avgDwellSeconds: o.totals.avgDwellSeconds,
      customEvents: o.totals.events,
      deltasPercent: o.deltas,
      daily: o.series,
    };
    // A time series for the chart: the model explains, the app draws.
    return {
      step: {
        tool: "overview",
        args: { range },
        numericContext: context(payload),
        render: { kind: "line", label: "Pageviews per day" },
        rows: o.series.map((p) => ({ label: p.t.slice(5, 10), value: p.pageviews, secondary: p.visitors })),
        columns: ["label", "value", "secondary"],
      },
      result: JSON.stringify(payload),
    };
  }

  if (call.name === "pages") {
    const range = parseRange(a.range);
    const limit = Math.min(Number(a.limit) || 25, 100);
    const pages = await getPages(siteId, range, limit);
    const payload = { range, pages };
    return {
      step: {
        numericContext: context(payload),
        tool: "pages",
        args: { range, limit },
        render: { kind: "bars", label: "Pageviews by path" },
        rows: pages.map((p) => ({ label: p.path, value: p.views, hint: `${p.visitors} visitors` })),
        columns: ["label", "value", "hint"],
      },
      result: JSON.stringify(payload),
    };
  }

  if (call.name === "vitals") {
    const range = parseRange(a.range);
    const v = await getVitals(siteId, range);
    const payload = { range, ...v };
    return {
      step: {
        numericContext: context(payload),
        tool: "vitals",
        args: { range },
        render: { kind: "table", label: "Core Web Vitals (p75)" },
        columns: ["metric", "value", "rating"],
        rows: [
          { label: "LCP", value: v.p75.lcp, hint: v.p75.lcp === null ? "no samples" : v.p75.lcp <= 2500 ? "good" : v.p75.lcp <= 4000 ? "needs work" : "poor" },
          { label: "CLS", value: v.p75.cls, hint: v.p75.cls === null ? "no samples" : v.p75.cls <= 0.1 ? "good" : v.p75.cls <= 0.25 ? "needs work" : "poor" },
          { label: "INP", value: v.p75.inp, hint: v.p75.inp === null ? "no samples" : v.p75.inp <= 200 ? "good" : v.p75.inp <= 500 ? "needs work" : "poor" },
        ],
      },
      result: JSON.stringify(payload),
    };
  }

  if (call.name === "query") {
    const sql = String(a.sql ?? "");
    const out = await runGuarded(sql, siteId);
    if ("error" in out) {
      return {
        step: {
          tool: "query", args: {}, sql, numericContext: [],
          render: { kind: "table", label: "Query" }, error: out.error,
        },
        result: JSON.stringify({ error: out.error, hint: "Fix the SQL and call query again." }),
      };
    }
    const payload = { columns: out.columns, rows: out.rows };
    const step: AgentStep = {
      tool: "query",
      args: a,
      sql,
      numericContext: context(payload),
      render: { kind: "table", label: String(a.why ?? "Query result") },
      columns: out.columns,
      rows: out.rows,
    };
    return { step, result: JSON.stringify(payload) };
  }

  return {
    step: { tool: call.name, args: a, numericContext: [], render: { kind: "table", label: call.name }, error: "unknown tool" },
    result: JSON.stringify({ error: `unknown tool '${call.name}'` }),
  };
}

/**
 * Grounding check.
 *
 * Extracts every number from the model's prose and verifies each one appears in
 * something Postgres actually returned. A figure the model invented — a 47% it
 * did not read from a result set — is reported so the UI can say so instead of
 * quietly presenting it as fact.
 *
 * This is deliberately forgiving about formatting: "1,234" matches 1234, "4.0k"
 * matches 4000, "12%" matches 12. It errs toward flagging rather than missing,
 * because a false alarm is a note in the corner and a missed hallucination is a
 * wrong number in a decision.
 */
export function verifyGrounding(answer: string, steps: AgentStep[]): number[] {
  // Everything the model was shown: the rendered rows AND the full tool payload.
  // Checking only `rows` would flag correct quotes of totals that never appear
  // in the chart data.
  const corpus = steps
    .flatMap((s) => s.numericContext)
    .concat(steps.flatMap((s) => (s.rows ?? []).flatMap((r) => Object.values(r).map(String))))
    .concat(steps.flatMap((s) => (s.error ? [s.error] : [])))
    .join(" ");

  const known = new Set<string>();
  for (const raw of corpus.split(/[^0-9.,kKmM%-]+/)) {
    const t = raw.trim();
    if (!t) continue;
    known.add(t.replace(/,/g, ""));
    const m = /^([0-9.]+)([kKmM])$/.exec(t);
    if (m) {
      const n = Number(m[1]) * (m[2].toLowerCase() === "k" ? 1000 : 1_000_000);
      known.add(String(n));
      known.add(String(Math.round(n)));
    }
    const n = Number(t.replace(/,/g, ""));
    if (Number.isFinite(n)) {
      known.add(String(n));
      known.add(n.toFixed(1));
      known.add(String(Math.round(n * 1000) / 1000));
    }
  }

  const suspicious: number[] = [];

  /**
   * Tokens are number + optional magnitude suffix, so "4.2M" is compared as
   * 4_200_000 rather than as the literal 4.2. Without this, every abbreviated
   * figure a model writes looks like a hallucination.
   */
  const found = answer.match(/(?<![\w$])\$?\d[\d,]*(?:\.\d+)?\s*[kKmM%]?[a-z]{0,2}(?![\w-])/g) ?? [];

  for (const tokenRaw of found) {
    const token = tokenRaw.replace(/\$/g, "").trim();
    const mag = /[kKmM]$/.exec(token)?.[0]?.toLowerCase();
    // Strip the unit entirely ("3100ms" -> 3100) so a duration written with a
    // unit compares equal to the bare number stored in the result set.
    const base = Number(token.replace(/[^0-9.,]/g, "").replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;

    const scaled = mag === "k" ? base * 1000 : mag === "m" ? base * 1_000_000 : base;

    // A model saying "fell 12.4%" is quoting a stored -12.4, so the negation
    // counts as a match. Percentage and currency decorations are ignored:
    // the unit is a formatting choice, not a different quantity.
    const candidates = [base, -base, scaled, -scaled];
    const hits = candidates.some((c) =>
      known.has(String(c)) ||
      known.has(c.toFixed(1)) ||
      known.has(String(Math.round(c))),
    );
    if (!hits) suspicious.push(Number(scaled.toFixed(6)));
  }

  return [...new Set(suspicious)];
}

export async function runAgent(
  question: string,
  siteId: string,
  siteName: string,
  history: Message[],
  signal?: AbortSignal,
  /**
   * Injectable so tests can drive the whole loop with a scripted model. The
   * default is the real configured provider; nothing in production passes this.
   */
  providerOverride?: Provider,
): Promise<AgentResult> {
  const provider = providerOverride ?? getProvider();

  const messages: Message[] = [
    { role: "system", content: `${SYSTEM}\n\nYou are looking at the site "${siteName}".` },
    ...history,
    { role: "user", content: question },
  ];

  const steps: AgentStep[] = [];

  for (let turn = 0; turn < MAX_STEPS; turn++) {
    const chunks = await provider.chat(messages, TOOLS, signal);

    const toolCalls = chunks.filter((c) => c.type === "tool_call").map((c) => (c as { call: ToolCall }).call);
    const text = chunks
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("")
      .trim();

    if (!toolCalls.length) {
      return { answer: text, steps, ungrounded: verifyGrounding(text, steps), truncated: false };
    }

    messages.push({ role: "assistant", content: text, toolCalls });

    for (const call of toolCalls) {
      const { result, step } = await execute(call, siteId);
      steps.push(step);
      messages.push({
        role: "tool",
        content: result.slice(0, 12_000),
        toolCallId: call.id,
        name: call.name,
      });
    }
  }

  // Out of steps. Ask for a plain answer with whatever we gathered, rather than
  // returning nothing — an incomplete answer beats an empty box.
  const summary = steps
    .map((s) => `${s.tool}: ${s.error ? `failed (${s.error})` : `${s.rows?.length ?? 0} rows`}`)
    .join("; ");
  const chunks = await provider.chat(
    [
      ...messages,
      { role: "user", content: `Summarise what you found in one short paragraph. Tools used: ${summary}. Do not call any more tools.` },
    ],
    [],
    signal,
  );
  const answer = chunks
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("")
    .trim();

  return { answer, steps, ungrounded: verifyGrounding(answer, steps), truncated: true };
}