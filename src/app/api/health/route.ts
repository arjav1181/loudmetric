import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness only.
 *
 * Public on purpose — the Docker healthcheck and the Space status both need it —
 * but it says nothing but "is the database answering". No counts, no site
 * names, no timestamps. On an indexed Space a public event count is a free
 * disclosure of someone's traffic volume to whoever happens to ask.
 *
 * Operational detail lives on /api/health/details and needs a session.
 */
export async function GET() {
  const started = Date.now();
  try {
    await getPool().query("SELECT 1");
    return NextResponse.json({ ok: true, db: "up", checkMs: Date.now() - started });
  } catch {
    return NextResponse.json({ ok: false, db: "down", checkMs: Date.now() - started }, { status: 503 });
  }
}
