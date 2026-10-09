import { getPages, getReferrers, getDevices } from "@/lib/queries";
import { compact } from "@/lib/vitals";
import { Header, NoSite, parseRange, resolveSite } from "../shell";
import { Bars, Caveat, Empty, Panel } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Pages, referrers and device split.
 *
 * Referrer grouping is done in SQL with a regex rather than in JS, so the
 * database never ships a million raw referrer strings to the Node process just
 * to have them collapsed in memory.
 */
export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const site = await resolveSite(sp.site);
  if (!site) return <NoSite />;
  const range = parseRange(sp.range);

  const [pages, referrers, devices] = await Promise.all([
    getPages(site.id, range, 100),
    getReferrers(site.id, range, 25),
    getDevices(site.id, range),
  ]);

  const deviceTotal = devices.reduce((a, d) => a + d.n, 0) || 1;

  return (
    <>
      <Header
        siteId={site.id}
        siteName={site.name}
        range={range}
        title="Pages"
        base="/pages"
        sub="Where people land and where they come from."
      />

      <div className="space-y-4 p-5 sm:p-7">
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel
            title="Top pages"
            className="xl:col-span-2"
            hint="Sorted by views. Query strings are stripped by the tracker, so this is a clean path list."
          >
            {pages.length === 0 ? (
              <Empty>No pageviews in this range.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[12px]">
                  <thead>
                    <tr className="text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">
                      <th className="pb-2 text-left font-medium">Path</th>
                      <th className="pb-2 text-left font-medium">Title</th>
                      <th className="pb-2 text-right font-medium">Views</th>
                      <th className="pb-2 text-right font-medium">Visitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((p) => (
                      <tr key={p.path} className="border-t border-white/[0.05]">
                        <td className="py-2.5 pr-4 font-mono text-white/80">{p.path}</td>
                        <td className="max-w-[220px] truncate py-2.5 pr-4 text-white/40">
                          {p.title ?? "—"}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular-nums text-white/60">
                          {compact(p.views)}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular-nums text-white/40">
                          {compact(p.visitors)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="space-y-4">
            <Panel title="Devices" hint="From the tracker, falling back to user-agent sniffing.">
              <Bars
                rows={devices.map((d) => ({
                  label: d.kind,
                  value: d.n,
                  hint: `${compact(d.n)} · ${Math.round((d.n / deviceTotal) * 100)}%`,
                }))}
              />
            </Panel>

            <Panel title="Referrers" hint="Bare host, so google.com covers /search and /ads.">
              <Bars
                rows={referrers.map((r) => ({ label: r.referrer, value: r.views }))}
                empty="No referrers recorded — likely all direct."
              />
            </Panel>
          </div>
        </div>

        <Caveat>
          Direct traffic shows as <code className="text-white/50">direct</code> when the browser sent
          no <code className="text-white/50">Referer</code> header. Most in-app navigation and most
          privacy extensions strip it, so &ldquo;direct&rdquo; is an upper bound that quietly absorbs
          some genuinely referred visits. Splitting those apart is not possible from here.
        </Caveat>
      </div>
    </>
  );
}
