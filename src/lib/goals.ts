import { getPool } from "@/lib/db";
import type { Range } from "./queries";

/**
 * Goals: whatever the operator decided to measure.
 *
 * Nothing here knows what a "play session" or a "newsletter signup" is. A goal
 * is a name, an optional unit, and the properties it carries; the queries below
 * are written entirely in terms of those declarations.
 *
 * This is the difference between a tool that suits one product and a tool
 * people can use. Shipping hardcoded event names is how an analytics product
 * ends up with a dashboard full of panels that are exactly right for its author
 * and meaningless to everyone else.
 */

export type Goal = {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  unit: string | null;
  created_at: Date;
};

export type GoalProperty = {
  id: string;
  goal_id: string;
  key: string;
  type: "number" | "string";
  agg: "sum" | "avg" | "count";
  unit: string | null;
};

export type GoalStats = {
  goal: Goal;
  properties: GoalProperty[];
  total: number;
  sessions: number;
  conversionRate: number | null;
  totalSessions: number;
  /** Aggregates per declared property, keyed by property key. */
  aggregates: Record<
    string,
    { key: string; agg: GoalProperty["agg"]; unit: string | null; value: number; count: number }
  >;
  /** Distribution over a numeric property, when one is declared. */
  histogram?: { key: string; unit: string | null; buckets: { label: string; n: number }[] };
};

export async function listGoals(siteId: string): Promise<Goal[]> {
  const res = await getPool().query<Goal>(
    "SELECT * FROM goals WHERE site_id = $1 ORDER BY created_at DESC",
    [siteId],
  );
  return res.rows;
}

export async function goalProperties(goalIds: string[]): Promise<GoalProperty[]> {
  if (!goalIds.length) return [];
  const res = await getPool().query<GoalProperty>(
    "SELECT * FROM goal_properties WHERE goal_id = ANY($1::uuid[])",
    [goalIds],
  );
  return res.rows;
}

/**
 * Default histogram edges.
 *
 * Chosen to be readable rather than statistically clever, and to grow fast at
 * the short end where most game and engagement durations sit. Declared goals
 * with wildly different units would want different edges, so this is a
 * starting point the dashboard labels rather than pretends is universal.
 */
export function histogramEdges(min: number, max: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [0, 1];
  const span = max - min;
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400];
  const step = candidates.find((c) => span / c <= 6) ?? span / 6;
  const edges: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step; v += step) edges.push(v);
  return edges.length > 1 ? edges : [min, max];
}

/**
 * Histogram edge label.
 *
 * The unit is appended exactly once. An earlier version did
 * `${edge / 60}m${unit}`, which turns 60 seconds with unit "s" into "1ms" — a
 * millisecond, which is off by a factor of a thousand and reads as one. For a
 * time unit the scale letter IS the unit, so adding the declared one on top is
 * wrong; for anything else the declared unit is the only suffix there is.
 */
function labelFor(edge: number, unit: string | null): string {
  const u = (unit ?? "").toLowerCase();
  const isTime = u === "s" || u === "sec" || u === "secs" || u === "seconds" || u === "";
  if (!isTime) return `${Math.round(edge)}${unit ?? ""}`;
  if (Math.abs(edge) < 60) return `${Math.round(edge)}s`;
  if (Math.abs(edge) < 3600) return `${Math.round(edge / 60)}m`;
  return `${(edge / 3600).toFixed(edge % 3600 === 0 ? 0 : 1)}h`;
}

/**
 * Stats for one goal.
 *
 * Every aggregate is computed by the database from the property declarations, so
 * adding a goal with a `revenue_cents` property gets a correct sum and average
 * with no code change anywhere in this repository.
 */
export async function goalStats(siteId: string, range: Range, goal: Goal): Promise<GoalStats> {
  const pool = getPool();
  const ms: Record<Range, number> = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000, "90d": 7_776_000_000 };
  const from = new Date(Date.now() - ms[range]);

  const props = await goalProperties([goal.id]);
  const numeric = props.filter((p) => p.type === "number");

  type Bounds = { min: number | null; max: number | null };
  const [head, _sessions, all] = await Promise.all([
    pool.query<{ total: number; sessions: number }>(
      `SELECT count(*)::int AS total, count(DISTINCT session_id)::int AS sessions
       FROM events
       WHERE site_id = $1 AND occurred_at >= $2 AND type = 'event' AND name = $3`,
      [siteId, from, goal.name],
    ),
    pool.query<{ total: number }>(
      `SELECT count(DISTINCT session_id)::int AS total FROM events
       WHERE site_id = $1 AND occurred_at >= $2 AND type IN ('pageview','event')`,
      [siteId, from],
    ),
    // Only the first numeric property drives the histogram. Two distributions in
    // one panel would compete, and the panel's job is the shape of the dominant
    // measure; the rest are numbers.
    numeric.length
      ? pool.query<Bounds>(
          `SELECT min((properties->>$2)::numeric)::float8 AS min,
                  max((properties->>$2)::numeric)::float8 AS max
           FROM events
           WHERE site_id = $1 AND occurred_at >= $3 AND type = 'event' AND name = $4
             AND properties->>$2 IS NOT NULL AND (properties->>$2) ~ '^[0-9.]+$'`,
          [siteId, numeric[0].key, from, goal.name],
        )
      : Promise.resolve({ rows: [] as Bounds[] } as { rows: Bounds[] }),
  ]);

  const totalSessions = _sessions.rows[0]?.total ?? 0;
  const total = head.rows[0]?.total ?? 0;
  const sessions = head.rows[0]?.sessions ?? 0;

  // One query for every declared property, so a goal with five properties is
  // still a single round trip rather than five.
  const aggregates: GoalStats["aggregates"] = {};
  if (numeric.length) {
    const selects = numeric
      .map((p, i) => {
        const v = `(properties->>$${i + 3})::numeric`;
        return p.agg === "avg"
          ? `avg(${v})::float8 AS a_${i}, count(${v})::int AS c_${i}`
          : `sum(${v})::float8 AS a_${i}, count(${v})::int AS c_${i}`;
      })
      .join(", ");
    const aggRes = await pool.query<Record<string, number>>(
      `SELECT ${selects}
       FROM events
       WHERE site_id = $1 AND occurred_at >= $2 AND type = 'event' AND name = $4`,
      [siteId, from, ...numeric.map((p) => p.key), goal.name],
    );
    const row = aggRes.rows[0] ?? {};
    numeric.forEach((p, i) => {
      const raw = Number(row[`a_${i}`] ?? 0);
      const cnt = Number(row[`c_${i}`] ?? 0);
      aggregates[p.key] = {
        key: p.key,
        agg: p.agg,
        unit: p.unit,
        value: p.agg === "avg" ? Math.round(raw * 10) / 10 : Math.round(raw),
        count: cnt,
      };
    });
  }

  // Histogram over the first declared numeric property.
  let histogram: GoalStats["histogram"];
  const primary = numeric[0];
  const bounds = all.rows[0];
  if (primary && bounds && bounds.min !== null && bounds.max !== null) {
    const edges = histogramEdges(Number(bounds.min), Number(bounds.max));
    const cases = edges
      .map((e, i) =>
        i === 0
          ? `WHEN (properties->>$2)::numeric < ${e + 1} THEN 0`
          : `WHEN (properties->>$2)::numeric < ${e + 1} THEN ${i}`,
      )
      .join(" ");
    const hist = await pool.query<{ b: number; n: number }>(
      `SELECT CASE ${cases} ELSE ${edges.length - 1} END AS b, count(*)::int AS n
       FROM events
       WHERE site_id = $1 AND occurred_at >= $3 AND type = 'event' AND name = $4
         AND properties->>$2 IS NOT NULL AND (properties->>$2) ~ '^[0-9.]+$'
       GROUP BY 1`,
      [siteId, primary.key, from, goal.name],
    );
    const counts = new Map(hist.rows.map((r) => [Number(r.b), r.n]));
    histogram = {
      key: primary.key,
      unit: primary.unit,
      buckets: edges.slice(0, -1).map((e, i) => ({
        label: `${labelFor(e, primary.unit)}–${labelFor(edges[i + 1], primary.unit)}`,
        n: counts.get(i) ?? 0,
      })),
    };
  }

  return {
    goal,
    properties: props,
    total,
    sessions,
    totalSessions,
    conversionRate: totalSessions > 0 ? Math.round((sessions / totalSessions) * 1000) / 10 : null,
    aggregates,
    histogram,
  };
}

export async function statsForAllGoals(siteId: string, range: Range): Promise<GoalStats[]> {
  const goals = await listGoals(siteId);
  return Promise.all(goals.map((g) => goalStats(siteId, range, g)));
}

/** Create a goal and its declared properties in one call. */
export async function createGoal(
  siteId: string,
  input: {
    name: string;
    description?: string;
    unit?: string;
    properties?: { key: string; type?: "number" | "string"; agg?: "sum" | "avg" | "count"; unit?: string }[];
  },
): Promise<{ goal: Goal } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "A goal needs a name." };
  if (!/^[a-z0-9_.-]{1,64}$/i.test(name)) {
    return { error: "Use letters, numbers, underscore, dot or dash. No spaces." };
  }
  const pool = getPool();
  const existing = await pool.query("SELECT 1 FROM goals WHERE site_id = $1 AND name = $2", [siteId, name]);
  if (existing.rowCount) return { error: `"${name}" already exists on this site.` };

  const g = await pool.query<Goal>(
    `INSERT INTO goals (site_id, name, description, unit) VALUES ($1,$2,$3,$4) RETURNING *`,
    [siteId, name, input.description?.trim() || null, input.unit?.trim() || null],
  );
  for (const p of input.properties ?? []) {
    const key = p.key.trim();
    if (!key) continue;
    if (!/^[a-z0-9_.-]{1,64}$/i.test(key)) {
      return { error: `Property "${key}" has an invalid name.` };
    }
    await pool.query(
      `INSERT INTO goal_properties (goal_id, key, type, agg, unit) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (goal_id, key) DO NOTHING`,
      [g.rows[0].id, key, p.type ?? "number", p.agg ?? "sum", p.unit?.trim() || null],
    );
  }
  return { goal: g.rows[0] };
}

export async function deleteGoal(siteId: string, goalId: string): Promise<boolean> {
  const res = await getPool().query(
    "DELETE FROM goals WHERE id = $1 AND site_id = $2 RETURNING id",
    [goalId, siteId],
  );
  return (res.rowCount ?? 0) > 0;
}
