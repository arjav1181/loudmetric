import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getCurrentUser, allowedSiteIds } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operational detail, behind a session.
 *
 * Split from /api/health because liveness has to stay public for the healthcheck
 * to work, while event counts, site names and the age of the newest event must
 * not be. The split is the whole point: one endpoint could not be both.
 *
 * Scoped to the operator's own sites rather than the whole instance.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const allowed = await allowedSiteIds(user.id);
    const res = await getPool().query<{ site: string; newest: Date | null; events: number }>(
      `SELECT s.name AS site, max(e.occurred_at) AS newest, count(e.id)::int AS events
         FROM sites s
         LEFT JOIN events e ON e.site_id = s.id
        WHERE s.archived_at IS NULL AND s.id = ANY($1::uuid[])
        GROUP BY s.name
        ORDER BY s.name`,
      [allowed],
    );
    return NextResponse.json({
      ok: true,
      sites: res.rows.map((r) => ({
        site: r.site,
        events: r.events,
        newestEvent: r.newest ? r.newest.toISOString() : null,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "unknown", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
