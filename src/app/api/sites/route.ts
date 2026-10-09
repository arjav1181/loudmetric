import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

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

export async function GET() {
  try {
    const res = await getPool().query(
      `SELECT s.id, s.name, s.domain, s.created_at,
              (SELECT count(*) FROM events e WHERE e.site_id = s.id) AS events
         FROM sites s
        WHERE s.archived_at IS NULL
        ORDER BY s.created_at DESC
        LIMIT 200`,
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
    return NextResponse.json({ site: res.rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "db_unavailable", message: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
}
