import { getPool } from "@/lib/db";

/**
 * Every dashboard query, in one place.
 *
 * Three rules hold throughout:
 *
 * 1. NEVER SELECT visitor_hash into a result the UI sees. It exists to count
 *    uniques within a day, never to identify anyone. Returning it from a
 *    reporting query is how a privacy tool quietly becomes a surveillance one.
 *
 * 2. Time ranges are half-open [from, to) so consecutive ranges neither
 *    double-count the boundary instant nor drop it.
 *
 * 3. Period comparisons compare against the immediately preceding window of
 *    equal length, and are computed in the same pass where possible rather
 *    than by fetching everything and differencing in JavaScript.
 */

export type Range = "24h" | "7d" | "30d" | "90d";

const RANGE_MS: Record<Range, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

/** Visitor hashes cannot span a UTC day boundary, so an hourly grain breaks. */
const HOUR_GRAIN: Partial<Record<Range, true>> = { "24h": true };

export function rangeMs(r: Range): number {
  return RANGE_MS[r];
}

/**
 * Bounce rate from heartbeats.
 *
 * A "visit" is a session_id. Bounced = one heartbeat under 10s and no scroll
 * past 25% and no custom event. Using heartbeats rather than "one pageview"
 * means a single-page read that someone genuinely spent a minute on is not
 * counted as a bounce.
 */
const BOUNCE_SQL = `
  WITH sessions AS (
    SELECT
      session_id,
      count(*) FILTER (WHERE type = 'heartbeat')          AS heartbeats,
      max(value) FILTER (WHERE type = 'heartbeat')        AS last_ms,
      coalesce(max(value) FILTER (WHERE type = 'scroll'), 0) AS max_scroll,
      count(*) FILTER (WHERE type = 'event')              AS custom_events
    FROM events
    WHERE site_id = $1 AND occurred_at >= $2 AND occurred_at < $3
      AND type IN ('heartbeat', 'scroll', 'event')
    GROUP BY session_id
  )
  SELECT
    count(*)::int AS sessions,
    count(*) FILTER (WHERE heartbeats <= 1 AND max_scroll < 25 AND custom_events = 0)::int AS bounced,
    coalesce(avg(last_ms), 0)::bigint AS avg_dwell_ms
  FROM sessions
`;

export type Totals = {
  pageviews: number;
  visitors: number;
  sessions: number;
  bounces: number;
  bounceRate: number | null;
  avgDwellSeconds: number | null;
  events: number;
};

async function totals(siteId: string, from: Date, to: Date): Promise<Totals> {
  const pool = getPool();
  const [t, s] = await Promise.all([
    pool.query<{
      pageviews: number;
      visitors: number;
      events: number;
    }>(
      `SELECT
         count(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
         count(DISTINCT visitor_hash) FILTER (WHERE type = 'pageview')::int AS visitors,
         count(*) FILTER (WHERE type = 'event')::int AS events
       FROM events
       WHERE site_id = $1 AND occurred_at >= $2 AND occurred_at < $3`,
      [siteId, from, to],
    ),
    pool.query<{ sessions: number; bounced: number; avg_dwell_ms: number }>(
      BOUNCE_SQL,
      [siteId, from, to],
    ),
  ]);

  const row = t.rows[0];
  const sess = s.rows[0];
  const sessions = sess.sessions;
  return {
    pageviews: row.pageviews,
    visitors: row.visitors,
    sessions,
    bounces: sess.bounced,
    bounceRate: sessions > 0 ? Math.round((sess.bounced / sessions) * 1000) / 10 : null,
    avgDwellSeconds:
      sess.avg_dwell_ms > 0 ? Math.round(sess.avg_dwell_ms / 100) / 10 : null,
    events: row.events,
  };
}

export async function getOverview(siteId: string, range: Range) {
  const ms = RANGE_MS[range];
  const now = new Date();
  const from = new Date(now.getTime() - ms);
  const prevFrom = new Date(from.getTime() - ms);

  const [current, previous, series] = await Promise.all([
    totals(siteId, from, now),
    totals(siteId, prevFrom, from),
    getSeries(siteId, range),
  ]);

  const pct = (a: number, b: number): number | null => {
    if (!b) return a > 0 ? null : 0;
    return Math.round(((a - b) / b) * 1000) / 10;
  };

  return {
    totals: current,
    deltas: {
      pageviews: pct(current.pageviews, previous.pageviews),
      visitors: pct(current.visitors, previous.visitors),
      sessions: pct(current.sessions, previous.sessions),
      bounceRate:
        current.bounceRate !== null && previous.bounceRate !== null
          ? Math.round((current.bounceRate - previous.bounceRate) * 10) / 10
          : null,
      avgDwellSeconds:
        current.avgDwellSeconds !== null && previous.avgDwellSeconds !== null
          ? Math.round((current.avgDwellSeconds - previous.avgDwellSeconds) * 10) / 10
          : null,
    },
    series,
  };
}

export type SeriesPoint = { t: string; pageviews: number; visitors: number };

export async function getSeries(siteId: string, range: Range): Promise<SeriesPoint[]> {
  const ms = RANGE_MS[range];
  const from = new Date(Date.now() - ms);
  // Visitors rotate daily, so a "visitors" line that silently summed per-hour
  // uniques would count the same person up to 24 times. Each bucket is therefore
  // a per-day distinct count, and the dashboard labels the series "daily".
  const bucket = HOUR_GRAIN[range] ? "hour" : "day";

  const res = await getPool().query<{ t: Date; pageviews: number; visitors: number }>(
    `SELECT
       date_trunc('${bucket}', occurred_at) AS t,
       count(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
       count(DISTINCT visitor_hash) FILTER (WHERE type = 'pageview')::int AS visitors
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2
       AND type = 'pageview'
     GROUP BY 1
     ORDER BY 1`,
    [siteId, from],
  );

  return res.rows.map((r) => ({
    t: r.t.toISOString(),
    pageviews: r.pageviews,
    visitors: r.visitors,
  }));
}

export async function getPages(
  siteId: string,
  range: Range,
  limit = 50,
): Promise<{ path: string; title: string | null; views: number; visitors: number }[]> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query(
    `SELECT
       path,
       max(title) AS title,
       count(*)::int AS views,
       count(DISTINCT visitor_hash)::int AS visitors
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2 AND type = 'pageview' AND path IS NOT NULL
     GROUP BY path
     ORDER BY views DESC
     LIMIT $3`,
    [siteId, from, limit],
  );
  return res.rows;
}

export async function getReferrers(
  siteId: string,
  range: Range,
  limit = 25,
): Promise<{ referrer: string; views: number; visitors: number }[]> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query(
    `SELECT
       CASE
         WHEN referrer IS NULL OR referrer = '' THEN 'direct'
         WHEN referrer ~ '^https?://([^/]+)' THEN regexp_replace(referrer, '^https?://([^/]+).*', '\\1')
         ELSE referrer
       END AS referrer,
       count(*)::int AS views,
       count(DISTINCT visitor_hash)::int AS visitors
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2 AND type = 'pageview'
     GROUP BY 1
     ORDER BY views DESC
     LIMIT $3`,
    [siteId, from, limit],
  );
  return res.rows;
}

/**
 * Section engagement — the metric that makes this worth more than a pageview
 * counter.
 *
 * `name` is the `data-lm-section` value. `dwell_ms` is time the section was the
 * most-visible element, summed across sessions, then divided by distinct
 * sessions that saw it at all. Reporting the raw sum would make a page with
 * ten sections look busier than one with two; average dwell per session is the
 * number a writer actually wants.
 */
export async function getSections(
  siteId: string,
  range: Range,
  limit = 40,
): Promise<{ name: string; views: number; avg_dwell_ms: number }[]> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query(
    `SELECT
       name,
       count(DISTINCT session_id)::int AS views,
       coalesce(avg(value), 0)::bigint AS avg_dwell_ms
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2 AND type = 'section' AND name IS NOT NULL
     GROUP BY name
     ORDER BY avg_dwell_ms DESC
     LIMIT $3`,
    [siteId, from, limit],
  );
  return res.rows;
}

/**
 * Scroll depth distribution as a funnel: how many sessions reached 25/50/75/90/100.
 *
 * Monotonic by construction, because it counts sessions that ever *reached* a
 * threshold rather than sessions whose last event was exactly that depth.
 */
export async function getScrollFunnel(
  siteId: string,
  range: Range,
): Promise<{ depth: number; sessions: number }[]> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query<{ sessions: number; s25: number; s50: number; s75: number; s90: number; s100: number }>(
    `SELECT
       count(DISTINCT session_id)::int AS sessions,
       count(DISTINCT session_id) FILTER (WHERE value >= 25)::int AS s25,
       count(DISTINCT session_id) FILTER (WHERE value >= 50)::int AS s50,
       count(DISTINCT session_id) FILTER (WHERE value >= 75)::int AS s75,
       count(DISTINCT session_id) FILTER (WHERE value >= 90)::int AS s90,
       count(DISTINCT session_id) FILTER (WHERE value >= 100)::int AS s100
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2 AND type = 'scroll'`,
    [siteId, from],
  );
  const r = res.rows[0];
  return [
    { depth: 25, sessions: r.s25 },
    { depth: 50, sessions: r.s50 },
    { depth: 75, sessions: r.s75 },
    { depth: 90, sessions: r.s90 },
    { depth: 100, sessions: r.s100 },
  ];
}

export type VitalPoint = { t: Date; lcp: number | null; cls: number | null; inp: number | null };

/**
 * Field Core Web Vitals, bucketed per day, with the p75 of each day.
 *
 * p75 is the metric Google publishes and the one to judge by — the median hides
 * the slow experience that makes people leave. Bucketing per day and averaging
 * the p75s afterwards is an approximation of a rolling p75, and is called out
 * in the UI rather than presented as an exact field metric.
 */
export async function getVitals(
  siteId: string,
  range: Range,
): Promise<{ p75: { lcp: number | null; cls: number | null; inp: number | null }; series: { t: string; lcp: number | null; cls: number | null; inp: number | null }[] }> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query<{ t: Date; lcp: number | null; cls: number | null; inp: number | null }>(
    `SELECT
       date_trunc('day', occurred_at) AS t,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE name = 'lcp') AS lcp,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE name = 'cls') AS cls,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE name = 'inp') AS inp
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2 AND type = 'vital'
     GROUP BY 1
     ORDER BY 1`,
    [siteId, from],
  );

  const avg = (k: "lcp" | "cls" | "inp") => {
    const vals = res.rows.map((r) => r[k]).filter((v): v is number => v !== null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1000) / 1000;
  };

  return {
    p75: { lcp: avg("lcp"), cls: avg("cls"), inp: avg("inp") },
    series: res.rows.map((r) => ({
      t: r.t.toISOString(),
      lcp: r.lcp === null ? null : Math.round(r.lcp),
      cls: r.cls === null ? null : Math.round(r.cls * 1000) / 1000,
      inp: r.inp === null ? null : Math.round(r.inp),
    })),
  };
}

export type WebVitals = { lcp: number | null; cls: number | null; inp: number | null };

/** Google thresholds, current as of 2024. Good = under, poor = over. */
export function vitalGrade(v: number | null, metric: "lcp" | "cls" | "inp"): "good" | "ni" | "poor" | "unknown" {
  if (v === null) return "unknown";
  const good = metric === "cls" ? 0.1 : metric === "lcp" ? 2500 : 200;
  const poor = metric === "cls" ? 0.25 : metric === "lcp" ? 4000 : 500;
  if (v <= good) return "good";
  if (v <= poor) return "ni";
  return "poor";
}

/**
 * Funnels: ordered steps, strict order, same visitor within a window.
 *
 * `window_ms` is a session cap rather than a user cap — cross-day identity does
 * not exist here, so the honest unit is "the same visit", and a funnel that
 * implied otherwise would be quietly lying.
 */
export type Funnel = { name: string; steps: string[]; windowMs: number };

export async function getFunnel(
  siteId: string,
  range: Range,
  funnel: Funnel,
): Promise<{ steps: { name: string; entered: number; converted: number; rate: number }[]; dropoffs: string[] }> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query<{ path: string; session_id: string; t: Date }>(
    `SELECT path, session_id, occurred_at AS t
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2 AND type = 'pageview' AND path IS NOT NULL
     ORDER BY occurred_at`,
    [siteId, from],
  );

  const bySession = new Map<string, { path: string; t: number }[]>();
  for (const row of res.rows) {
    const arr = bySession.get(row.session_id) ?? [];
    arr.push({ path: row.path, t: row.t.getTime() });
    bySession.set(row.session_id, arr);
  }

  const out: { steps: { name: string; entered: number; converted: number; rate: number }[]; dropoffs: string[] } = { steps: [], dropoffs: [] };

  // Walk each session's pageviews in time order, matching funnel steps strictly
  // in order. A session that hits step 3 and then step 1 again has not gone
  // backwards through the funnel, so the cursor only ever moves forward.
  const firstSeen: number[] = [];

  for (const views of bySession.values()) {
    let stepIdx = 0;
    let anchorT = -Infinity;
    for (const v of views) {
      if (stepIdx >= funnel.steps.length) break;
      if (v.path === funnel.steps[stepIdx] && v.t > anchorT && v.t - anchorT <= funnel.windowMs) {
        anchorT = v.t;
        stepIdx++;
      }
    }
    if (stepIdx > 0) {
      for (let i = 0; i < stepIdx; i++) firstSeen[i] = (firstSeen[i] ?? 0) + 1;
    }
  }

  for (let i = 0; i < funnel.steps.length; i++) {
    const entered = firstSeen[i] ?? 0;
    out.steps.push({ name: funnel.steps[i], entered, converted: 0, rate: 0 });
  }

  const first = out.steps[0]?.entered ?? 0;
  out.steps.forEach((s) => {
    s.converted = s.entered;
    s.rate = first > 0 ? Math.round((s.entered / first) * 1000) / 10 : 0;
  });
  for (let i = 1; i < out.steps.length; i++) {
    if (out.steps[i].entered < out.steps[i - 1].entered) {
      out.dropoffs.push(`${out.steps[i - 1].name} → ${out.steps[i].name}`);
    }
  }
  return out;
}

export async function getEvents(
  siteId: string,
  range: Range,
  limit = 50,
): Promise<{ name: string; count: number; sessions: number }[]> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query(
    `SELECT
       name,
       count(*)::int AS count,
       count(DISTINCT session_id)::int AS sessions
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2 AND type = 'event' AND name IS NOT NULL
     GROUP BY name
     ORDER BY count DESC
     LIMIT $3`,
    [siteId, from, limit],
  );
  return res.rows;
}

/**
 * Device split, from the coarse class computed at ingest.
 *
 * The raw user agent is never stored, so there is no UA sniffing fallback here
 * and pretending otherwise would be dead code describing behaviour that does not
 * happen. Three buckets is what this table can honestly support.
 */
export async function getDevices(siteId: string, range: Range) {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query<{ kind: string; n: number }>(
    `SELECT
       coalesce(properties->>'device', 'unknown') AS kind,
       count(*)::int AS n
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2 AND type = 'pageview'
     GROUP BY 1
     ORDER BY n DESC`,
    [siteId, from],
  );
  return res.rows;
}

export async function getLiveVisitors(siteId: string, windowMinutes = 5) {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const res = await getPool().query<{ active: number; pages: number }>(
    `SELECT
       count(DISTINCT visitor_hash)::int AS active,
       count(DISTINCT path)::int AS pages
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2`,
    [siteId, since],
  );
  return res.rows[0] ?? { active: 0, pages: 0 };
}

export async function getBotStats(siteId: string, range: Range) {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query<{ filtered: number; total: number }>(
    `SELECT
       coalesce(sum((properties->>'filtered')::int), 0)::int AS filtered,
       count(*)::int AS total
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2 AND type = 'bot_blocked'`,
    [siteId, from],
  );
  return res.rows[0] ?? { filtered: 0, total: 0 };
}

export async function getList<T extends Record<string, unknown>>(
  siteId: string,
  range: Range,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query<T>(sql, [siteId, from, ...params]);
  return res.rows;
}

/**
 * Custom event with a numeric property, summed.
 *
 * The property is read as JSONB rather than a column, so this is not indexed and
 * is only ever run over a single event name. That is a deliberate trade: making
 * every arbitrary property indexable would mean a column per event type, which
 * defeats the point of an open event schema.
 */
export async function getEventWithNumber(
  siteId: string,
  range: Range,
  name: string,
  prop: string,
): Promise<{ total: number; count: number; avg: number | null }> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query<{ total: number; count: number }>(
    `SELECT
       coalesce(sum((properties->>$2)::numeric), 0)::bigint AS total,
       count(*) FILTER (WHERE properties->>$2 IS NOT NULL)::int AS count
     FROM events
     WHERE site_id = $1 AND occurred_at >= $3
       AND type = 'event' AND name = $4`,
    [siteId, prop, from, name],
  );
  const row = res.rows[0];
  return {
    total: Number(row?.total ?? 0),
    count: row?.count ?? 0,
    avg: row?.count ? Math.round((Number(row.total) / row.count) * 10) / 10 : null,
  };
}

/** Count of sessions in which a custom event fired at least once. */
export async function getEventSessions(
  siteId: string,
  range: Range,
  name: string,
): Promise<number> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query<{ n: number }>(
    `SELECT count(DISTINCT session_id)::int AS n
     FROM events
     WHERE site_id = $1 AND occurred_at >= $2 AND type = 'event' AND name = $3`,
    [siteId, from, name],
  );
  return res.rows[0]?.n ?? 0;
}

/**
 * Distribution of a bucketed property, for a funnel-shaped "how long do people
 * play" view rather than a single average.
 */
export async function getEventBuckets(
  siteId: string,
  range: Range,
  name: string,
  prop: string,
  order: string[],
): Promise<{ band: string; n: number }[]> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query<{ band: string; n: number }>(
    `SELECT properties->>$2 AS band, count(*)::int AS n
     FROM events
     WHERE site_id = $1 AND occurred_at >= $3
       AND type = 'event' AND name = $4
       AND properties->>$2 IS NOT NULL
     GROUP BY 1`,
    [siteId, prop, from, name],
  );
  const map = new Map(res.rows.map((r) => [r.band, r.n]));
  return order.map((b) => ({ band: b, n: map.get(b) ?? 0 }));
}

/** Conversion: sessions with the event, against all sessions. */
export async function getEventConversion(
  siteId: string,
  range: Range,
  name: string,
): Promise<{ sessions: number; withEvent: number; rate: number | null }> {
  const from = new Date(Date.now() - RANGE_MS[range]);
  const res = await getPool().query<{ sessions: number; with_event: number }>(
    `WITH s AS (
       SELECT DISTINCT session_id, name
       FROM events
       WHERE site_id = $1 AND occurred_at >= $2 AND type IN ('pageview', 'event')
     )
     SELECT count(DISTINCT session_id)::int AS sessions,
            count(DISTINCT session_id) FILTER (WHERE name = $3)::int AS with_event
     FROM s`,
    [siteId, from, name],
  );
  const row = res.rows[0];
  return {
    sessions: row?.sessions ?? 0,
    withEvent: row?.with_event ?? 0,
    rate: row?.sessions ? Math.round((row.with_event / row.sessions) * 1000) / 10 : null,
  };
}
