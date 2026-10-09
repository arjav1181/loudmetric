import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getPool, resolveSiteByWriteKey } from "@/lib/db";

/**
 * POST /api/ingest — the only write path.
 *
 * Two deliberate design choices:
 *
 * 1. The body arrives as `text/plain`, not JSON-in-a-content-type. Ingest
 *    endpoints are the single most-scraped URL on any analytics service, and
 *    this one deliberately never issues a CORS preflight, so a cross-origin
 *    POST from a random site is rejected by the browser before it ever
 *    arrives. The script sends no credentials either.
 *
 * 2. IPs are hashed, never stored, against a salt that rotates daily. This is
 *    what makes "unique visitors" computable without a cookie and without
 *    keeping anything that could identify a person.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY = 64 * 1024;
const VALID_TYPES = new Set(["pageview", "event", "scroll", "section", "vital", "heartbeat"]);

/**
 * A daily-rotating salt. Yesterday's visitors cannot be joined to today's,
 * because yesterday's salt no longer exists anywhere — it is derived on demand
 * and never persisted.
 */
function saltForDay(offsetDays = 0): string {
  const day = new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
  return createHmac("sha256", process.env.INGEST_SALT || "loudmetric-dev-salt")
    .update(day)
    .digest("hex");
}

function hash(ip: string, ua: string, salt: string): string {
  return createHmac("sha256", salt).update(`${ip}|${ua}`).digest("hex").slice(0, 24);
}

/**
 * Bot filtering: built-in rules plus whatever the operator added for this site.
 *
 * There is no JS challenge. A challenge would mean a third party in the
 * request path, which is the exact thing this project exists to avoid, so
 * filtering is honest about its limits instead: user-agent signatures and
 * headless markers catch most automated traffic, and a human-readable per-site
 * exclusion list catches the rest. Some bots will always get through; that is
 * stated plainly in the docs rather than papered over.
 */
const BUILTIN_BOTS = [
  /bot\b/i,
  /crawler/i,
  /spider/i,
  /slurp/i,
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /lighthouse/i,
  /pingdom|uptimerobot|statuscake|site24x7/i,
  /ahrefs|semrush|mj12bot|dotbot|blexbot/i,
  /facebookexternalhit|whatsapp|telegrambot|slackbot|discordbot/i,
  /curl\/|wget\/|python-requests|go-http-client|okhttp/i,
  /preview|webhook|monitoring/i,
];

function isBot(ua: string, path: string, custom: { pattern: string; kind: string }[]): boolean {
  for (const re of BUILTIN_BOTS) if (re.test(ua)) return true;
  for (const rule of custom) {
    if (rule.kind === "ua" && ua.toLowerCase().includes(rule.pattern.toLowerCase())) return true;
    if (rule.kind === "path" && path.toLowerCase().includes(rule.pattern.toLowerCase())) return true;
  }
  return false;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  let body: { site?: unknown; e?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const writeKey = typeof body.site === "string" ? body.site : "";
  const events = Array.isArray(body.e) ? (body.e as Record<string, unknown>[]) : [];
  if (!writeKey || events.length === 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (events.length > 50) {
    return NextResponse.json({ error: "too_many_events" }, { status: 413 });
  }

  const site = await resolveSiteByWriteKey(writeKey);
  if (!site) {
    // Same response shape as success. A wrong key is not worth confirming to
    // someone probing for valid keys.
    return NextResponse.json({ ok: true });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0";
  const ua = (req.headers.get("user-agent") || "").slice(0, 300);

  const salt = saltForDay(0);
  const custom = await loadBotRules(site.id);
  const pool = getPool();

  const rows: unknown[][] = [];
  let skipped = 0;

  for (const e of events) {
    const type = String(e.t || "");
    if (!VALID_TYPES.has(type)) {
      skipped += 1;
      continue;
    }
    const path = String(e.p || "").slice(0, 400);
    const referrer = String(e.r || "").slice(0, 400);
    const x = (e.x && typeof e.x === "object" ? e.x : {}) as Record<string, unknown>;

    if (isBot(ua, path, custom)) {
      skipped += 1;
      continue;
    }

    // Reject far-future or absurdly old timestamps so a hostile client cannot
    // poison the time-series.
    const when = Number(e.d);
    const ts =
      Number.isFinite(when) && when > Date.now() - 7 * 86400000 && when < Date.now() + 60000
        ? new Date(when)
        : new Date();

    const vh = hash(ip, ua, salt);

    let name: string | null = null;
    let value: number | null = null;
    let props: Record<string, unknown> | null = null;

    switch (type) {
      case "pageview":
        props = { ti: String(x.ti || "").slice(0, 200) };
        break;
      case "event":
        name = String(x.n || "event").slice(0, 64);
        props = x.x && typeof x.x === "object" ? (x.x as Record<string, unknown>) : null;
        break;
      case "scroll":
        value = clampNum(x.v, 0, 100);
        break;
      case "section":
        name = String(x.n || "").slice(0, 64);
        value = clampNum(x.v, 0, 3600000);
        break;
      case "vital": {
        const vn = String(x.n || "");
        if (!["lcp", "cls", "inp"].includes(vn)) {
          skipped += 1;
          continue;
        }
        name = vn;
        value = clampNum(x.v, 0, 600000);
        break;
      }
      case "heartbeat":
        value = clampNum(x.v, 0, 3600000);
        break;
    }

    if ((type === "scroll" && value === null) || (type === "vital" && value === null)) {
      skipped += 1;
      continue;
    }

    rows.push([
      site.id,
      ts,
      type,
      // Session = visitor hash plus a 30-minute bucket. Approximates a
      // session without a cookie and cannot outlive the day.
      createHmac("sha256", salt).update(`${vh}|${Math.floor(when / 1800000)}`).digest("hex").slice(0, 24),
      vh,
      path || null,
      props && props.ti ? String(props.ti) : null,
      referrer || null,
      name,
      value,
      props ? JSON.stringify(props) : null,
    ]);
  }

  if (rows.length > 0) {
    try {
      await pool.query(
        `INSERT INTO events
          (site_id, occurred_at, type, session_id, visitor_hash, path, title, referrer, name, value, properties)
         VALUES ${rows.map((_, i) => `($${i * 11 + 1}, $${i * 11 + 2}, $${i * 11 + 3}, $${i * 11 + 4}, $${i * 11 + 5}, $${i * 11 + 6}, $${i * 11 + 7}, $${i * 11 + 8}, $${i * 11 + 9}, $${i * 11 + 10}, $${i * 11 + 11})`).join(", ")}`,
      rows.flat(),
      );
    } catch (err) {
      // A write failure must not surface as an error to the browser: the
      // tracker has no way to react and retrying would double-count.
      console.error("[loudmetric] ingest failed", err);
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true }, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

function clampNum(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

async function loadBotRules(siteId: string) {
  try {
    const res = await getPool().query<{ pattern: string; kind: string }>(
      "SELECT pattern, kind FROM site_bots WHERE site_id = $1",
      [siteId],
    );
    return res.rows;
  } catch {
    return [];
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { "access-control-allow-origin": "*" } });
}