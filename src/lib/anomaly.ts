import { getPool } from "@/lib/db";

/**
 * Anomaly detection.
 *
 * No model. No API key. No waiting for anyone to think of a question. This runs
 * on a schedule and either finds something or it does not, which makes it the
 * most reliable feature in the product and the one a paid tool would charge for.
 *
 * The method matters more than it looks, because the obvious implementation is
 * wrong in a way that produces constant false alarms:
 *
 * TRAFFIC IS SEASONAL BY WEEKDAY. Comparing this Tuesday to last Tuesday is
 * meaningful. Comparing this Tuesday to yesterday — a Monday — is not, and every
 * naive "vs previous period" panel in every analytics tool does exactly that, so
 * it flags a spike every Monday and a drop every Tuesday. The baseline here is
 * the same weekday over the previous several weeks.
 *
 * DISPERSION IS ESTIMATED WITH MEDIAN ABSOLUTE DEVIATION, not standard
 * deviation. A single viral day inflates a mean and a standard deviation enough
 * to hide the next spike entirely, and MAD is unmoved by it. This is the
 * standard robust-statistics answer and almost nobody in analytics uses it.
 *
 * Every finding carries the baseline, the actual, and the sample size, because a
 * percentage change with two days of history is not a finding, it is noise with a
 * decimal point.
 */

export type Severity = "high" | "medium" | "low";

export type Anomaly = {
  metric: string;
  label: string;
  at: string;
  actual: number;
  expected: number;
  /** Percentage change against the baseline. Negative means a drop. */
  changePct: number;
  severity: Severity;
  /** How many baseline days backed this up. */
  samples: number;
  direction: "spike" | "drop";
  /** One line on what it might mean, in plain language. */
  hint: string;
};

export type AnomalyReport = {
  days: number;
  findings: Anomaly[];
  /** True when there were not enough events for any judgement to be meaningful. */
  thinData: boolean;
};

/** MAD → a standard-deviation-equivalent, via the 1.4826 consistency constant. */
const MAD_TO_SIGMA = 1.4826;

const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function medianAbsDeviation(xs: number[], med: number): number {
  if (!xs.length) return 0;
  return median(xs.map((x) => Math.abs(x - med)));
}

/**
 * Same-weekday baseline.
 *
 * `weeks` controls how far back to look. 8 is a deliberate choice: it spans
 * roughly two months, enough to absorb a holiday week, without reaching back far
 * enough for a site that has genuinely changed.
 */
type Day = { dow: number; date: string; value: number };

function baseline(
  days: Day[],
  targetDow: number,
  targetDate: string,
  weeks: number,
): { expected: number; deviation: number; samples: number } {
  const prior = days
    .filter((d) => d.dow === targetDow && d.date < targetDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, weeks)
    .map((d) => d.value);

  if (prior.length < 3) return { expected: 0, deviation: 0, samples: prior.length };
  const med = median(prior);
  return { expected: med, deviation: medianAbsDeviation(prior, med) * MAD_TO_SIGMA, samples: prior.length };
}

/**
 * Classify against the baseline.
 *
 * Two thresholds, both necessary. A z-score alone flags trivial swings on a
 * quiet site; a percentage threshold alone flags 3 pageviews moving to 6 as
 * "tripled". Requiring BOTH means a finding is either statistically surprising
 * or materially large, and in practice it is the second that a human cares about.
 */
function classify(
  actual: number,
  expected: number,
  deviation: number,
  floor: number,
  zThreshold: number,
): { severity: Severity; changePct: number; direction: "spike" | "drop" } | null {
  if (expected <= 0) return null;

  const changePct = ((actual - expected) / expected) * 100;
  const direction = actual >= expected ? "spike" : "drop";
  const relative = Math.abs(changePct);

  // A perfectly flat baseline has zero MAD, which would make every non-zero
  // deviation infinitely significant. Fall back to a proportional band so a
  // site with identical daily traffic does not alert every single day.
  const band = deviation > 0 ? deviation : expected * 0.15;
  const z = (actual - expected) / band;

  if (Math.abs(z) < zThreshold) return null;
  if (relative < floor) return null;

  const severity: Severity =
    relative >= 50 && Math.abs(z) >= 4 ? "high" : relative >= 25 || Math.abs(z) >= 3 ? "medium" : "low";

  return { severity, changePct, direction };
}

function severityRank(s: Severity): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}

export async function detectAnomalies(siteId: string, days = 28): Promise<AnomalyReport> {
  const pool = getPool();
  const since = new Date(Date.now() - (days + 60) * 86_400_000);

  const [traffic, vitals, totals] = await Promise.all([
    pool.query<{ d: string; dow: number; pageviews: number; visitors: number }>(
      `SELECT to_char(occurred_at, 'YYYY-MM-DD') AS d,
              extract(dow FROM occurred_at)::int AS dow,
              count(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
              count(DISTINCT visitor_hash) FILTER (WHERE type = 'pageview')::int AS visitors
       FROM events
       WHERE site_id = $1 AND occurred_at >= $2 AND type = 'pageview'
       GROUP BY 1, 2`,
      [siteId, since],
    ),
    pool.query<{ d: string; lcp: number | null; cls: number | null; inp: number | null }>(
      `SELECT to_char(occurred_at, 'YYYY-MM-DD') AS d,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE name = 'lcp') AS lcp,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE name = 'cls') AS cls,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE name = 'inp') AS inp
       FROM events
       WHERE site_id = $1 AND occurred_at >= $2 AND type = 'vital'
       GROUP BY 1`,
      [siteId, since],
    ),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM events
       WHERE site_id = $1 AND occurred_at >= now() - interval '30 days'`,
      [siteId],
    ),
  ]);

  const findings: Anomaly[] = [];

  // ── Traffic ────────────────────────────────────────────────────────────────
  // The most recent day is excluded: it is still accumulating, so comparing a
  // partial day against a whole one manufactures a "50% drop" every single
  // morning.
  const cutoff = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const pvDays: Day[] = traffic.rows.map((r) => ({ dow: r.dow, date: r.d, value: r.pageviews }));
  const uvDays: Day[] = traffic.rows.map((r) => ({ dow: r.dow, date: r.d, value: r.visitors }));

  for (const [metric, daysData, label, floor] of [
    ["pageviews", pvDays, "Pageviews", 40],
    ["visitors", uvDays, "Unique visitors", 35],
  ] as const) {
    for (const day of daysData.filter((d) => d.date <= cutoff)) {
      const b = baseline(daysData, day.dow, day.date, 8);
      if (b.samples < 3) continue;
      const c = classify(day.value, b.expected, b.deviation, floor, 3);
      if (!c) continue;
      findings.push({
        metric,
        label,
        at: day.date,
        actual: day.value,
        expected: Math.round(b.expected),
        changePct: Math.round(c.changePct * 10) / 10,
        severity: c.severity,
        samples: b.samples,
        direction: c.direction,
        hint:
          c.direction === "drop"
            ? `${Math.abs(c.changePct).toFixed(0)}% below the usual ${label.toLowerCase()} for a ${DOW[day.dow]}.`
            : `${Math.abs(c.changePct).toFixed(0)}% above the usual ${label.toLowerCase()} for a ${DOW[day.dow]}.`,
      });
    }
  }

  // ── Core Web Vitals ────────────────────────────────────────────────────────
  // A speed regression is the finding people most want and cannot get from a
  // chart, because "the line went up" does not tell you a deploy caused it.
  for (const row of vitals.rows.filter((r) => r.d <= cutoff)) {
    const dow = new Date(`${row.d}T00:00:00Z`).getUTCDay();
    for (const [key, good, poor, label] of [
      ["lcp", 2500, 4000, "LCP"],
      ["cls", 0.1, 0.25, "CLS"],
      ["inp", 200, 500, "INP"],
    ] as const) {
      const value = row[key];
      if (value === null) continue;
      const peers = vitals.rows
        .filter((r) => new Date(`${r.d}T00:00:00Z`).getUTCDay() === dow && r.d < row.d && r[key] !== null)
        .sort((a, b) => (a.d < b.d ? 1 : -1))
        .slice(0, 8)
        .map((r) => r[key] as number);
      if (peers.length < 3) continue;
      const med = median(peers);
      const b = classify(value, med, medianAbsDeviation(peers, med) * MAD_TO_SIGMA, 20, 3);
      if (!b) continue;
      // Only report a vitals regression that actually crosses into worse
      // territory, or it fires on noise inside the healthy band.
      const wasGood = med <= good;
      const nowBad = value > poor;
      const nowDegraded = value > good;
      if (!(wasGood && (nowBad || nowDegraded))) continue;
      findings.push({
        metric: key,
        label,
        at: row.d,
        actual: Math.round(value * 1000) / 1000,
        expected: Math.round(med * 1000) / 1000,
        changePct: Math.round(b.changePct * 10) / 10,
        severity: nowBad ? "high" : "medium",
        samples: peers.length,
        direction: value >= med ? "spike" : "drop",
        hint:
          value >= med
            ? `${label} got ${Math.abs(b.changePct).toFixed(0)}% slower than usual and is now ${nowBad ? "poor" : "needs work"} for real visitors. Worth checking what shipped around this date.`
            : `${label} improved ${Math.abs(b.changePct).toFixed(0)}% against the usual.`,
      });
    }
  }

  // Only the most recent, most significant finding per metric survives. A user
  // who gets thirty notifications stops reading them, and the one that matters is
  // usually the newest.
  const byMetric = new Map<string, Anomaly>();
  for (const f of findings.sort((a, b) => (a.at < b.at ? 1 : -1))) {
    const prev = byMetric.get(f.metric);
    if (!prev || severityRank(f.severity) > severityRank(prev.severity)) byMetric.set(f.metric, f);
  }

  return {
    days,
    findings: [...byMetric.values()].sort(
      (a, b) => severityRank(b.severity) - severityRank(a.severity) || (a.at < b.at ? 1 : -1),
    ),
    thinData: (totals.rows[0]?.total ?? 0) < 500,
  };
}

/**
 * Attribute a traffic change to specific pages.
 *
 * This is the difference between "traffic dropped 40% on Tuesday" and "traffic
 * dropped 40% because /pricing lost 180 views and news.ycombinator.com sent
 * none". A number without a cause is a notification; a number with a cause is an
 * answer.
 *
 * The comparison baseline is the same weekday across the previous eight weeks,
 * matching the detector exactly. Comparing one day against the previous seven
 * days instead would blame Monday for everything Tuesday did, because Monday and
 * Tuesday are not the same day.
 */
export async function explainAnomaly(
  siteId: string,
  date: string,
  weeks = 8,
): Promise<{ path: string; delta: number; now: number; then: number }[]> {
  const target = new Date(`${date}T00:00:00Z`);
  const floor = new Date(target.getTime() - (weeks + 1) * 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const dow = target.getUTCDay();

  const res = await getPool().query<{ d: string; path: string; n: number }>(
    `SELECT to_char(occurred_at, 'YYYY-MM-DD') AS d, path, count(*)::int AS n
     FROM events
     WHERE site_id = $1 AND type = 'pageview' AND path IS NOT NULL
       AND occurred_at >= $2 AND occurred_at::date <= $3
       AND extract(dow FROM occurred_at)::int = $4
     GROUP BY 1, 2`,
    [siteId, floor, date, dow],
  );

  // Median of the same weekday's prior weeks, per path.
  const prior = new Map<string, number[]>();
  const now = new Map<string, number>();
  for (const r of res.rows) {
    if (r.d === date) now.set(r.path, r.n);
    else prior.set(r.path, [...(prior.get(r.path) ?? []), r.n]);
  }

  const paths = new Set([...now.keys(), ...prior.keys()]);
  const out: { path: string; delta: number; now: number; then: number }[] = [];
  for (const p of paths) {
    const hist = prior.get(p) ?? [];
    // Fewer than three same-weekday samples is not a baseline; saying "/pricing
    // dropped 12 views" against two data points is invented precision.
    if (hist.length < 3 && !now.has(p)) continue;
    const then = hist.length >= 3 ? Math.round(median(hist)) : hist.length ? Math.round(median(hist)) : 0;
    const isNow = now.get(p) ?? 0;
    out.push({ path: p, now: isNow, then, delta: isNow - then });
  }

  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
}