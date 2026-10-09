import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness and readiness in one endpoint, because the Space healthcheck needs to
 * distinguish them.
 *
 * Reports the age of the newest event alongside the database state. On the
 * Hugging Face deployment that number is the honest signal that the dataset sync
 * is working — if it stops advancing while the Space is awake, the sync loop is
 * broken and nobody would otherwise notice until the next restart lost the data.
 */
export async function GET() {
  const started = Date.now();
  try {
    const res = await getPool().query<{ newest: Date | null; events: number }>(
      `SELECT max(occurred_at) AS newest, count(*)::int AS events FROM events`,
    );
    const row = res.rows[0];
    return NextResponse.json({
      ok: true,
      db: "up",
      events: row.events,
      newestEvent: row.newest ? row.newest.toISOString() : null,
      checkMs: Date.now() - started,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        error: err instanceof Error ? err.message : "unknown",
        checkMs: Date.now() - started,
      },
      { status: 503 },
    );
  }
}
