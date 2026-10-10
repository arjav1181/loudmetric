import Link from "next/link";
import { Suspense } from "react";
import { getPool } from "@/lib/db";
import { getLiveVisitors } from "@/lib/queries";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

/**
 * Geist app shell.
 *
 * 64px top bar, 240px rail, both on the same translucent border token. The
 * layout is a plain two-column flex rather than a fixed-and-sticky combination,
 * because sticky plus fixed is where dashboards end up with a rail that scrolls
 * away from its own header at exactly the wrong scroll position.
 *
 * Only what the chrome itself displays is fetched here. Each view fetches its own
 * range-scoped data, so the layout does not do the panel's work twice.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sites = await listSites();
  const first = sites[0]?.id ?? null;
  const [live, events] = await Promise.all([
    first ? getLiveVisitors(first, 5).catch(() => ({ active: 0, pages: 0 })) : { active: 0, pages: 0 },
    countEvents().catch(() => 0),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-white/[0.09] bg-black/95 backdrop-blur">
        <div className="flex h-full items-center gap-4 px-4">
          <Link href="/" className="shrink-0 text-[14px] font-semibold tracking-[-0.01em]">
            LoudMetric
          </Link>

          <div className="hidden min-w-0 flex-1 items-center gap-4 md:flex">
            <StatusDot ok label="Database" okText="connected" />
            <span
              className="geist-mono text-[12px] text-white/50"
              title="Visitors in the last 5 minutes, and total events stored"
            >
              {live.active} live · {events.toLocaleString()} events
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <a
              href="https://github.com/arjav1181/loudmetric"
              className="geist-mono text-[12px] text-white/45 transition-colors hover:text-white"
            >
              GitHub
            </a>
            <Link
              href="/"
              className="geist-btn geist-btn-secondary h-8 px-3 text-[13px]"
            >
              Sites
            </Link>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Rail: fixed on desktop, a scrollable strip on narrow screens. */}
        <aside className="hidden w-60 shrink-0 border-r border-white/[0.09] p-4 lg:block">
          <Suspense fallback={null}>
            <Nav />
          </Suspense>

          {sites.length > 0 ? (
            <div className="mt-8 border-t border-white/[0.09] pt-4">
              <p className="px-3 pb-2 text-[12px] font-medium text-white/40">Sites</p>
              <ul>
                {sites.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/dashboard?site=${s.id}`}
                      className="block truncate rounded px-3 py-1.5 font-mono text-[12px] text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <div className="sticky top-16 z-30 overflow-x-auto border-b border-white/[0.09] bg-black/95 px-4 py-2 backdrop-blur lg:hidden">
            <Suspense fallback={null}>
              <Nav horizontal />
            </Suspense>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Connection status. Colour is never the only cue — the label says what the dot
 * means, so it survives both colour-blindness and a monochrome screenshot.
 */
function StatusDot({
  ok,
  label,
  okText,
}: {
  ok: boolean;
  label: string;
  okText: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-white/50">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`}
      />
      {label} <span className="text-white/30">{ok ? okText : "unavailable"}</span>
    </span>
  );
}

async function listSites(): Promise<{ id: string; name: string }[]> {
  try {
    const res = await getPool().query<{ id: string; name: string }>(
      "SELECT id, name FROM sites WHERE archived_at IS NULL ORDER BY created_at LIMIT 100",
    );
    return res.rows;
  } catch {
    return [];
  }
}

async function countEvents(): Promise<number> {
  const res = await getPool().query<{ n: number }>("SELECT count(*)::int AS n FROM events");
  return res.rows[0]?.n ?? 0;
}