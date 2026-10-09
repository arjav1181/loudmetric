import Link from "next/link";
import { getPool } from "@/lib/db";
import type { Range } from "@/lib/queries";
import { LABEL } from "./ui";

export const dynamic = "force-dynamic";

export const RANGES: { key: Range; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

export function parseRange(v: string | undefined): Range {
  return v === "24h" || v === "7d" || v === "90d" ? v : "30d";
}

export function rangeHref(base: string, siteId: string, range: Range): string {
  return `/dashboard${base}?site=${siteId}&range=${range}`;
}

/**
 * Page header shared by every dashboard view: which site, which window, and
 * the honest label for what that window can and cannot tell you.
 */
export function Header({
  siteId,
  siteName,
  range,
  title,
  sub,
  base = "",
}: {
  siteId: string;
  siteName: string;
  range: Range;
  title: string;
  sub?: string;
  /** Path under /dashboard that the range links point back to. */
  base?: string;
}) {
  return (
    <header className="border-b border-white/[0.06] px-5 py-4 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={LABEL}>{siteName}</p>
          <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">{title}</h1>
          {sub ? <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-white/40">{sub}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={rangeHref(base, siteId, r.key)}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors ${
                r.key === range
                  ? "bg-white/[0.1] text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
              aria-current={r.key === range ? "true" : undefined}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

/**
 * Resolves the site from `?site=`. Falls back to the oldest site so a bare
 * `/dashboard` link still shows something instead of an error — a self-hosted
 * tool with exactly one site should not require a URL parameter to be usable.
 */
export async function resolveSite(siteParam: string | undefined): Promise<{
  id: string;
  name: string;
} | null> {
  try {
    if (siteParam) {
      const r = await getPool().query<{ id: string; name: string }>(
        "SELECT id, name FROM sites WHERE id = $1 AND archived_at IS NULL",
        [siteParam],
      );
      if (r.rows[0]) return r.rows[0];
    }
    const first = await getPool().query<{ id: string; name: string }>(
      "SELECT id, name FROM sites WHERE archived_at IS NULL ORDER BY created_at LIMIT 1",
    );
    return first.rows[0] ?? null;
  } catch {
    return null;
  }
}

export function NoSite() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[15px] text-white/70">No site selected</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-white/35">
        Create a site to start collecting events. You need a running Postgres and a site row
        before any metric here means anything.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md border border-white/15 px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors hover:border-white/40"
      >
        Go to sites
      </Link>
    </div>
  );
}

export function DbDown({ detail }: { detail?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[15px] text-red-300/90">Database unavailable</p>
      <p className="max-w-md text-[13px] leading-relaxed text-white/35">
        LoudMetric could not reach Postgres. Nothing here is estimated or cached — an analytics
        tool that shows stale numbers without saying so is worse than one that shows nothing.
      </p>
      {detail ? <pre className="mono max-w-xl overflow-x-auto text-[11px] text-white/25">{detail}</pre> : null}
      <p className="font-mono text-[11px] text-white/25">
        Check that the container is up and <code className="text-white/40">db/schema.sql</code> was applied.
      </p>
    </div>
  );
}
