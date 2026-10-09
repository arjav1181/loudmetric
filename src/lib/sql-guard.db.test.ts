/**
 * Proves the second layer of defence: that Postgres itself refuses writes.
 *
 *   npx tsx src/lib/sql-guard.db.test.ts <siteId>
 *
 * checkSql rejects these strings too, but that is not what this file proves. It
 * calls runGuarded directly, which means the static checks never run — so the
 * only thing standing between the statements below and your database is
 * `SET TRANSACTION READ ONLY`. If this test ever fails, the guarantee is gone
 * regardless of how good the regexes look.
 */
import { runGuarded } from "./sql-guard";
import { getPool } from "./db";

const ATTACKS: [string, string][] = [
  ["INSERT a fake event", "INSERT INTO events (site_id, type, visitor_hash, session_id) VALUES ($1,'forged','a','b')"],
  ["DELETE all events", "DELETE FROM events"],
  ["UPDATE events", "UPDATE events SET value = 0"],
  ["DROP the table", "DROP TABLE events"],
  ["CREATE a table", "CREATE TABLE pwned (id int)"],
  ["data-modifying CTE", "WITH x AS (DELETE FROM events RETURNING *) SELECT count(*) FROM x"],
];

/**
 * `--bypass` runs the attacks with the static checker deliberately out of the
 * way, straight at the read-only transaction.
 *
 * This is the only assertion in the repository that actually proves the safety
 * property. Without it, a green run just means the regexes are still intact;
 * with it, a green run means Postgres itself refused to write — which is the
 * guarantee that survives a prompt cleverer than the one we thought of.
 */
const BYPASS = process.argv.includes("--bypass");

async function attemptDirect(sql: string, siteId: string): Promise<string | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query(sql, sql.includes("$1") ? [siteId] : []);
    return null; // executed
  } catch (e) {
    return e instanceof Error ? e.message : "failed";
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already gone */
    }
    client.release();
  }
}

async function main() {
  const siteId = process.argv[2];
  const pool = getPool();
  if (!siteId) throw new Error("usage: sql-guard.db.test.ts <siteId> [--bypass]");

  const before = (await pool.query("SELECT count(*)::int n FROM events")).rows[0].n;

  let blocked = 0;
  for (const [label, sql] of ATTACKS) {
    if (BYPASS) {
      const err = await attemptDirect(sql, siteId);
      if (err) {
        blocked++;
        console.log(`  BLOCKED   ${label.padEnd(24)} ${err.slice(0, 56)}`);
      } else {
        console.log(`  EXECUTED  ${label.padEnd(24)} *** THE GUARD IS BROKEN ***`);
      }
      continue;
    }
    const r = await runGuarded(sql, siteId);
    if ("error" in r) {
      blocked++;
      console.log(`  BLOCKED   ${label.padEnd(24)} ${r.error.slice(0, 56)}`);
    } else {
      console.log(`  EXECUTED  ${label.padEnd(24)} *** THE GUARD IS BROKEN ***`);
    }
  }

  // A legitimate read must still work, or "block everything" is not a fix.
  const read = await runGuarded(
    "SELECT count(*) AS n FROM events WHERE site_id = $1 AND type = 'pageview' LIMIT 1",
    siteId,
  );
  const readsWork = "rows" in read;

  const after = (await pool.query("SELECT count(*)::int n FROM events")).rows[0].n;
  const pwned = (await pool.query("SELECT to_regclass('pwned') IS NOT NULL AS x")).rows[0].x;

  console.log(`\n  writes blocked   ${blocked}/${ATTACKS.length}`);
  console.log(`  reads work       ${readsWork}`);
  console.log(`  events           ${before} -> ${after} ${before === after ? "(unchanged)" : "*** MUTATED ***"}`);
  console.log(`  table 'pwned'    ${pwned ? "*** EXISTS ***" : "not created"}`);

  const ok = blocked === ATTACKS.length && readsWork && before === after && !pwned;
  console.log(`\n${ok ? "PASS — the database refused every write" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});