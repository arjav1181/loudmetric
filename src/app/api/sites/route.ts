import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getCurrentUser, allowedSiteIds } from "@/lib/auth";

/**
 * POST /api/sites — create a site, return its write key.
 * GET  /api/sites — list sites.
 *
 * Open by design in the self-hosted case: the operator runs this, and adding an
 * email gate to a single-tenant self-hosted tool is friction for no benefit.
 * If you expose this to the internet, put it behind a reverse proxy that
 * requires auth. That is called out in the README rather than assumed.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * This endpoint returns WRITE KEYS. Leaking it means letting anyone mint events
 * against someone's analytics, so it is behind a session and scoped to the
 * sites that operator may actually read — not merely to any logged-in user.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const allowed = await allowedSiteIds(user.id);
    if (!allowed.length) return NextResponse.json({ sites: [] });
    const res = await getPool().query(
      `SELECT s.id, s.name, s.domain, s.created_at, s.write_key,
              (SELECT count(*) FROM events e WHERE e.site_id = s.id) AS events
         FROM sites s
        WHERE s.archived_at IS NULL AND s.id = ANY($1::uuid[])
        ORDER BY s.created_at DESC
        LIMIT 200`,
      [allowed],
    );
    return NextResponse.json({ sites: res.rows });
  } catch (err) {
    return NextResponse.json(
      { error: "db_unavailable", message: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: { name?: unknown; domain?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const domain =
    typeof body.domain === "string" ? body.domain.trim().slice(0, 200) || null : null;

  try {
    const res = await getPool().query(
      "INSERT INTO sites (name, domain) VALUES ($1, $2) RETURNING id, name, domain, write_key",
      [name, domain],
    );
    await getPool().query(
      "INSERT INTO user_sites (user_id, site_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [user.id, res.rows[0].id],
    );
    return NextResponse.json({ site: res.rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "db_unavailable", message: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
}
