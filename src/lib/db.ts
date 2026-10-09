import { Pool } from "pg";

/**
 * One pool per process.
 *
 * `pg` pools keep connections open; creating one per request exhausts the
 * database's connection limit under any real traffic, so it is memoised on
 * globalThis to survive Next's dev-mode module reloading.
 */
const g = globalThis as unknown as { lmPool?: Pool };

export function getPool(): Pool {
  if (!g.lmPool) {
    g.lmPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    g.lmPool.on("error", (err) => {
      // An idle client dropping is normal on serverless; log and let the pool
      // replace it rather than crashing the process.
      console.error("[loudmetric] postgres pool error", err.message);
    });
  }
  return g.lmPool;
}

export type Site = {
  id: string;
  name: string;
  domain: string | null;
  write_key: string;
  created_at: Date;
};

export async function resolveSiteByWriteKey(writeKey: string): Promise<Site | null> {
  const res = await getPool().query<Site>(
    "SELECT id, name, domain, write_key, created_at FROM sites WHERE write_key = $1 AND archived_at IS NULL LIMIT 1",
    [writeKey],
  );
  return res.rows[0] ?? null;
}
