import { getPool } from "@/lib/db";
import { getLiveVisitors } from "@/lib/queries";
import { AdminShell } from "./PortedShell";

export const dynamic = "force-dynamic";

/**
 * Dashboard layout.
 *
 * The portfolio's AdminShell, mounted rather than paraphrased: sticky top bar
 * with the health strip, refresh and auto-refresh controls; a fixed rail on
 * desktop and a slide-over on a phone; and the command palette behind ⌘K. That
 * chrome is most of what makes the panel feel like the same product, and it is
 * the part that cannot be reconstructed from a screenshot.
 *
 * Only what the shell itself needs is fetched here. Each section fetches its own
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
    <AdminShell health={{ kv: true, lcp: null, live: live.active, events }} sites={sites}>
      {children}
    </AdminShell>
  );
}

/** Total events stored, shown in the shell's health strip. */
async function countEvents(): Promise<number> {
  const res = await getPool().query<{ n: number }>("SELECT count(*)::int AS n FROM events");
  return res.rows[0]?.n ?? 0;
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

