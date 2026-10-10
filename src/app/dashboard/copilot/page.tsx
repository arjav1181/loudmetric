import Link from "next/link";
import { getCurrentUser, allowedSiteIds } from "@/lib/auth";
import { getPool } from "@/lib/db";
import Copilot from "./Copilot";
import { NoSite } from "../shell";

export const dynamic = "force-dynamic";

/**
 * The copilot. Unlike every other dashboard view this one needs a session:
 * an unauthenticated endpoint that writes SQL and spends an operator's API
 * budget is an exfiltration surface, not a feature.
 */
export default async function CopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[15px] text-white/75">Sign in to use the copilot</p>
        <p className="max-w-sm text-[13px] leading-relaxed text-white/35">
          It writes SQL against your analytics and spends your model credits, so it is never
          reachable without a session.
        </p>
        <Link
          href="/login"
          className="mt-2 rounded-md border border-white/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors hover:border-white/40"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const allowed = await allowedSiteIds(user.id);
  const siteId = sp.site && allowed.includes(sp.site) ? sp.site : allowed[0];

  if (!siteId) return <NoSite />;

  const site = await getPool()
    .query<{ name: string }>("SELECT name FROM sites WHERE id = $1", [siteId])
    .then((r) => r.rows[0])
    .catch(() => null);

  return (
    <>
      <header className="border-b border-white/[0.06] px-5 py-4 sm:px-7">
        <p className="geist-label">{site?.name ?? "site"}</p>
        <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">Copilot</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-white/40">
          The model chooses the query and explains the answer. Postgres does the counting, every
          figure is checked against what the database actually returned, and it can only ever read.
        </p>
      </header>
      <Copilot siteId={siteId} />
    </>
  );
}
