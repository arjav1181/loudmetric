import Link from "next/link";
import { Suspense } from "react";
import { getPool } from "@/lib/db";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

/**
 * Dashboard chrome: a persistent left rail.
 *
 * The failure mode of an analytics panel is losing your place between six views
 * of the same data, so the rail never goes away. On mobile it becomes a
 * horizontal scroller rather than being hidden — a nav you have to guess is not
 * a nav.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sites = await listSites();

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-white/[0.06] p-5 lg:flex">
        <Link href="/" className="text-[15px] font-bold tracking-tight">LoudMetric</Link>
        <p className="mt-1 font-mono text-[10px] text-white/25">cookie-free analytics</p>

        <Suspense fallback={null}>
          <Nav vertical />
        </Suspense>

        <div className="space-y-1.5 border-t border-white/[0.06] pt-4">
          <p className="font-mono text-[10px] tracking-[0.18em] text-white/25 uppercase">Sites</p>
          {sites.length === 0 ? (
            <p className="font-mono text-[11px] text-white/25">none yet</p>
          ) : (
            <ul className="space-y-0.5">
              {sites.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/dashboard?site=${s.id}`}
                    className="block truncate rounded-md px-2 py-1 font-mono text-[11px] text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/80"
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-auto space-y-1 pt-4">
          <Link href="/" className="block font-mono text-[11px] text-white/30 transition-colors hover:text-white/70">
            ← All sites
          </Link>
          <a
            href="https://github.com/arjav1181/loudmetric"
            className="block font-mono text-[11px] text-white/30 transition-colors hover:text-white/70"
          >
            GitHub ↗
          </a>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 overflow-x-auto border-b border-white/[0.06] bg-black/90 px-4 py-3 backdrop-blur lg:hidden">
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
        </div>
        {children}
      </div>
    </div>
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
