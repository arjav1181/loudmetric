import Link from "next/link";
import { Suspense } from "react";
import { getPool } from "@/lib/db";
import { SidebarNav } from "./PortedNav";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

/**
 * Dashboard chrome, using the portfolio admin's rail markup and classes.
 *
 * The rail is fixed on desktop and becomes a slide-over on a phone, copied from
 * AdminShell rather than reinvented — the reason it is worth copying is that it
 * already handles both, and a dashboard that loses your place between eight
 * views of the same data is a dashboard nobody reads.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sites = await listSites();

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 overflow-y-auto border-r border-white/10 bg-black px-3 pb-8 pt-5 lg:block">
        <Link href="/" className="mb-6 block px-3">
          <span className="text-[15px] font-bold tracking-[-0.02em]">LoudMetric</span>
          <span className="mt-1 block font-mono text-[10px] text-white/25">cookie-free analytics</span>
        </Link>

        <Suspense fallback={null}>
          <SidebarNav />
        </Suspense>

        {sites.length > 0 ? (
          <div className="mt-6 border-t border-white/[0.07] pt-4">
            <p className="px-3 text-[10px] tracking-[0.2em] text-white/25 uppercase">Sites</p>
            <ul className="mt-2 flex flex-col gap-0.5 px-3">
              {sites.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/dashboard?site=${s.id}`}
                    className="block truncate py-1 font-mono text-[11px] text-white/45 transition-colors hover:text-white/80"
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 border-t border-white/[0.07] pt-4">
          <ul className="flex flex-col gap-1 px-3 text-[11px] text-white/30">
            <li>
              <Link href="/" className="transition-colors hover:text-white/70">
                ← All sites
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/arjav1181/loudmetric"
                className="transition-colors hover:text-white/70"
              >
                GitHub ↗
              </a>
            </li>
          </ul>
        </div>
      </aside>

      {/* Phone: the rail is unreachable at this width, so the same links become a
          horizontal scroller rather than being hidden. A nav you have to guess is
          not a nav. */}
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 overflow-x-auto border-b border-white/10 bg-black/95 px-4 py-3 backdrop-blur lg:hidden">
          <Suspense fallback={null}>
            <MobileNav />
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

/** Horizontal variant of the same nav, for narrow viewports. */
function MobileNav() {
  return (
    <div className="flex items-center gap-3">
      <Link href="/" className="shrink-0 text-[13px] font-bold tracking-[-0.02em]">
        LoudMetric
      </Link>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <Nav />
      </div>
    </div>
  );
}