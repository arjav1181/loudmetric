import { getPool } from "@/lib/db";
import type { Range } from "@/lib/queries";
import { Header } from "./Header";
import { parseRange, rangeHref, RANGES } from "./ranges";

export const dynamic = "force-dynamic";

export { parseRange, rangeHref, RANGES };
export { Header };

/**
 * Resolves the site from `?site=`.
 *
 * Falls back to the oldest site so a bare `/dashboard` still shows something
 * instead of an error — a self-hosted tool with exactly one site should not
 * require a URL parameter to be usable.
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
      <p className="text-[14px] text-white/90">No site selected</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-white/45">
        Create a site to start collecting events. You need a running Postgres and a site row
        before any metric here means anything.
      </p>
      <a href="/" className="geist-btn geist-btn-primary mt-1">
        Go to Sites
      </a>
    </div>
  );
}

export function DbDown({ detail }: { detail?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[14px] text-red-300">Database unavailable</p>
      <p className="max-w-md text-[13px] leading-relaxed text-white/45">
        LoudMetric could not reach Postgres. Nothing here is estimated or cached — an analytics
        tool that shows stale numbers without saying so is worse than one that shows nothing.
      </p>
      {detail ? (
        <pre className="geist-mono max-w-xl overflow-x-auto text-[11px] text-white/25">{detail}</pre>
      ) : null}
    </div>
  );
}

export type { Range };
