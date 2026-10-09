import { getPool } from "@/lib/db";

/**
 * Guard for model-generated SQL.
 *
 * There are two layers, and the order matters:
 *
 *   1. STATIC CHECKS (here) — reject obviously bad input before it reaches the
 *      database. Cheap, and gives the model a useful error it can retry from.
 *
 *   2. READ-ONLY TRANSACTION (`runGuarded`) — the real guarantee. Even if every
 *      regex below were bypassed by a clever prompt, the database refuses to
 *      write. The static checks exist to produce good error messages and to
 *      stop obvious nonsense; they are not the thing standing between a hostile
 *      prompt and your data. That is Postgres.
 *
 * Why this matters more than usual here: the copilot sits behind a natural
 * language interface, so "run this query" is reachable by anyone who can type.
 * A prompt-injected analytics assistant that can DELETE is a much worse outcome
 * than an assistant that can only count.
 */

/** Columns the model must never select, at any nesting depth. */
const FORBIDDEN_COLUMNS = [
  "visitor_hash",
  "session_id",
  "password_hash",
  "write_key",
];

const FORBIDDEN_KEYWORDS = [
  "insert", "update", "delete", "drop", "alter", "create", "truncate",
  "grant", "revoke", "copy", "comment", "vacuum", "reindex", "call",
  "do", "execute", "listen", "notify", "reset", "set", "begin", "commit",
  "rollback", "lock", "refresh", "import", "security",
];

const FORBIDDEN_OBJECTS = [
  "pg_", "information_schema", "pg_catalog", "pg_shadow", "pg_user",
  "dblink", "lo_import", "lo_export", "pg_read_file", "pg_ls_dir",
  "pg_stat", "pg_authid",
];

/**
 * Functions that read server state rather than your analytics.
 *
 * `current_setting` is the interesting one: it is the standard way to learn
 * whether a connection is superuser, and more generally it is how a model
 * discovers configuration it has no business seeing. `set_config` is the write
 * half of the same door.
 */
const FORBIDDEN_FUNCTIONS = [
  "current_setting", "set_config", "pg_backend_pid", "inet_server_addr",
  "inet_server_port", "pg_read_binary_file", "pg_stat_file", "pg_ls_dir",
];

/**
 * Single-statement, no comments, no semicolons.
 *
 * Comment stripping matters more than it looks: `SELECT 1 -- ; DROP TABLE x` is
 * a stacked query hidden behind a comment, and any downstream tool that
 * re-splits on `;` would execute both halves.
 */
export type Check = { ok: true } | { ok: false; reason: string };

export function checkSql(sql: string): Check {
  const trimmed = sql.trim();
  if (!trimmed) return { ok: false, reason: "empty query" };
  if (trimmed.length > 20_000) return { ok: false, reason: "query too long" };

  if (/--|\/\*|\*\//.test(trimmed)) {
    return { ok: false, reason: "comments are not allowed" };
  }

  // Allow exactly one trailing semicolon; anything else is a second statement.
  const withoutTrailing = trimmed.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    return { ok: false, reason: "only a single statement is allowed" };
  }

  const lower = withoutTrailing.toLowerCase();

  // Keywords are matched as whole words so `deleted_at` is not read as DELETE.
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`(^|[^a-z0-9_])${kw}([^a-z0-9_]|$)`).test(lower)) {
      return { ok: false, reason: `'${kw}' is not allowed in a read-only query` };
    }
  }

  for (const obj of FORBIDDEN_OBJECTS) {
    if (lower.includes(obj)) {
      return { ok: false, reason: `access to '${obj}' is not allowed` };
    }
  }

  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (lower.includes(`${fn}(`)) {
      return { ok: false, reason: `'${fn}' is not available to analytics queries` };
    }
  }

  // A bare star projection would hand back every column of `events`, including
  // the pseudonymous ones this whole file exists to protect. Only a star inside
  // an aggregate is allowed, because count(*) returns a number and leaks
  // nothing. The three patterns are exactly the ways a projection star appears:
  // as the whole select list, after a comma, or qualified by a table alias.
  if (/\bselect\s+\*/i.test(withoutTrailing) || /,\s*\*/.test(withoutTrailing) || /\w\.\s*\*/.test(withoutTrailing)) {
    return { ok: false, reason: "select the columns you need explicitly; '*' is not allowed" };
  }

  if (!/^\s*select\b/.test(lower)) {
    return { ok: false, reason: "query must start with SELECT" };
  }

  // A UNION can smuggle a second SELECT, which is fine, but INTO is not.
  if (/\binto\b/.test(lower)) {
    return { ok: false, reason: "INTO is not allowed" };
  }

  // Forbidden columns anywhere, including inside an aggregate or a subquery.
  for (const col of FORBIDDEN_COLUMNS) {
    if (new RegExp(`(^|[^a-z0-9_])${col}([^a-z0-9_]|$)`, "i").test(withoutTrailing)) {
      return { ok: false, reason: `'${col}' is a pseudonymous identifier and cannot be queried` };
    }
  }

  return { ok: true };
}

/**
 * The authoritative gate: validate, then execute inside a transaction Postgres
 * itself marks read-only.
 *
 * `SET TRANSACTION READ ONLY` is checked by the server against the current
 * transaction, so it cannot be turned off later in the same transaction — unlike
 * `SET default_transaction_read_only`, which a later statement could reset.
 * Every statement is issued on one dedicated client, and the transaction is
 * always rolled back, so a query cannot commit even if it somehow could write.
 */
export async function runGuarded(
  sql: string,
  siteId: string,
): Promise<{ columns: string[]; rows: Record<string, unknown>[] } | { error: string }> {
  const check = checkSql(sql);
  if (!check.ok) return { error: check.reason };

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");

    const res = await client.query(sql, [siteId]);

    // Hard ceiling: a model that returns 50,000 rows has misunderstood the
    // question, and streaming that into a chat bubble is a denial of service
    // against your own browser.
    const LIMIT = 500;
    const truncated = res.rows.length > LIMIT;
    const rows = (truncated ? res.rows.slice(0, LIMIT) : res.rows) as Record<string, unknown>[];

    await client.query("ROLLBACK");
    return {
      columns: res.fields.map((f) => f.name),
      rows: truncated ? [...rows, { __truncated: true, __shown: LIMIT, __total: res.rows.length }] : rows,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already dead */
    }
    // Postgres error text is passed through deliberately: it is the model's best
    // chance to correct itself, and it reveals nothing the model does not already
    // know about the schema.
    return { error: err instanceof Error ? err.message : "query failed" };
  } finally {
    client.release();
  }
}

/**
 * Schema description for the model.
 *
 * Kept small and explicit on purpose. Dumping pg_catalog into a prompt wastes
 * context and invites the model to reach for tables this product does not have.
 * It gets exactly the columns it is allowed to use, which is also a security
 * property: a column absent from this list is a column the model has no reason
 * to ask for.
 */
export const SCHEMA_HINT = `
sites(id uuid, name text, domain text, created_at timestamptz)
events(site_id uuid, occurred_at timestamptz, type text, path text, title text,
      referrer text, name text, value double precision, properties jsonb)

Events are partitioned by month. Always filter:
    WHERE site_id = $1 AND occurred_at >= now() - interval '30 days'

$1 is bound to the site id — do NOT inline a site id.

type is one of: 'pageview', 'scroll', 'section', 'vital', 'heartbeat', 'event', 'bot_blocked'

Useful expressions:
  unique visitors   count(DISTINCT visitor_hash) -- daily only, salt rotates daily
  bounce            sessions with one heartbeat under 10s, no scroll past 25, no event
  dwell             max(value) FILTER (WHERE type='heartbeat')
  page views        count(*) FILTER (WHERE type='pageview')
  referrer host     regexp_replace(referrer, '^https?://([^/]+).*', '\\1')
  section dwell     avg(value) FILTER (WHERE type='section')
  vitals            name='lcp'|'cls'|'inp', p75 via percentile_cont(0.75) WITHIN GROUP (ORDER BY value)
  scroll depth      value for type='scroll'

Every query MUST end with a LIMIT of at most 200 rows.
`.trim();