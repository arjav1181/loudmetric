import { getPool } from "@/lib/db";
import { getBotStats } from "@/lib/queries";
import { Header, NoSite, parseRange, resolveSite } from "../shell";
import { Caveat, Empty, Panel, Table } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Site settings: bot rules and the write key.
 *
 * Write keys are shown in full because they are write-only by design — they can
 * append events and nothing else. A tool that pretended to need them hidden
 * would only be teaching operators to be afraid of their own dashboard.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const site = await resolveSite(sp.site);
  if (!site) return <NoSite />;
  const range = parseRange(sp.range);

  const [bots, stats, siteRow] = await Promise.all([
    getPool()
      .query<{ id: number; pattern: string; kind: string; created_at: Date }>(
        "SELECT id, pattern, kind, created_at FROM site_bots WHERE site_id = $1 ORDER BY created_at DESC LIMIT 100",
        [site.id],
      )
      .then((r) => r.rows)
      .catch(() => []),
    getBotStats(site.id, range).catch(() => ({ filtered: 0, total: 0 })),
    getPool()
      .query<{ write_key: string; domain: string | null; created_at: Date }>(
        "SELECT write_key, domain, created_at FROM sites WHERE id = $1",
        [site.id],
      )
      .then((r) => r.rows[0])
      .catch(() => null),
  ]);

  return (
    <>
      <Header siteId={site.id} siteName={site.name} range={range} title="Settings" base="/settings" />

      <div className="space-y-3 p-3 sm:p-4 lg:px-6">
        {siteRow ? (
          <Panel title="Write key" hint="Safe to embed in your tracking snippet — it can only append events, never read them.">
            <pre className="overflow-x-auto rounded-md border border-white/[0.08] bg-black/40 p-3 font-mono text-[12px] text-white/70">
              {`data-site="${siteRow.write_key}"`}
            </pre>
            <p className="mt-2 font-mono text-[10px] text-white/25">
              domain {siteRow.domain ?? "unset"} · created {siteRow.created_at.toISOString().slice(0, 10)}
            </p>
          </Panel>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Bot rules" hint="Substring match against the user agent, per site.">
            {bots.length === 0 ? (
              <Empty
                label="No custom rules."
                hint="Built-in signatures for headless browsers and known crawlers always apply."
              />
            ) : (
              <Table head={["Pattern", "Kind"]} rows={bots.map((b) => [b.pattern, b.kind])} />
            )}
          </Panel>

          <Panel title="Filtered traffic" hint={`Bot requests rejected at ingest in the last ${range}.`}>
            <p className="font-mono text-[28px] leading-none tabular-nums text-white">
              {stats.filtered.toLocaleString()}
            </p>
            <p className="mt-2 text-[11px] text-white/30">
              Requests dropped before hitting the database. They are counted, not stored.
            </p>
          </Panel>
        </div>

        <Caveat>
          There is deliberately no JavaScript challenge. A challenge would put a third party in the
          request path, which is the exact thing this project exists to avoid. Filtering is
          signature-based and honest about its ceiling: a determined bot with a residential proxy
          will get through.
        </Caveat>
      </div>
    </>
  );
}
