import {
  getOverview,
  getLiveVisitors,
  getPages,
  getScrollFunnel,
} from "@/lib/queries";
import { compact } from "@/lib/vitals";
import { AnomalyPanel } from "./AnomalyPanel";
import { BarChart } from "./charts";
import { Header, NoSite, parseRange, resolveSite } from "./shell";
import { Bars, CARD, Caveat, Delta, Empty, Panel, Stat } from "./ui";

export const dynamic = "force-dynamic";

/**
 * Overview: the numbers someone opens the tool to check, and nothing else.
 *
 * Every panel is a direct SQL aggregate over the selected window. There is no
 * rollup table and no cache, which means a number shown here is the same number
 * a raw query returns — the property that makes an analytics tool trustworthy.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const site = await resolveSite(sp.site);
  if (!site) return <NoSite />;

  const range = parseRange(sp.range);

  try {
    const [overview, live, pages, scroll] = await Promise.all([
      getOverview(site.id, range),
      getLiveVisitors(site.id, 5),
      getPages(site.id, range, 6),
      getScrollFunnel(site.id, range),
    ]);

    const { totals, deltas, series } = overview;
    const maxScroll = Math.max(...scroll.map((s) => s.sessions), 1);

    return (
      <>
        <Header
          siteId={site.id}
          siteName={site.name}
          range={range}
          title="Overview"
          base=""
          sub={`Live: ${live.active} visitor${live.active === 1 ? "" : "s"} in the last 5 minutes.`}
        />

        <div className="space-y-4 p-5 sm:p-7">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Pageviews" value={compact(totals.pageviews)} delta={deltas.pageviews} />
            <Stat label="Unique visitors" value={compact(totals.visitors)} delta={deltas.visitors}
              sub="per day, salt-rotated" />
            <Stat
              label="Bounce rate"
              value={totals.bounceRate === null ? "—" : `${totals.bounceRate}%`}
              delta={deltas.bounceRate}
              goodDirection="down"
              sub="no scroll past 25%"
            />
            <Stat
              label="Avg dwell"
              value={totals.avgDwellSeconds === null ? "—" : `${totals.avgDwellSeconds}s`}
              delta={deltas.avgDwellSeconds}
              sub="time on page"
            />
          </div>

          <AnomalyPanel siteId={site.id} />

          <Panel
            title="Traffic"
            hint="Unique visitors are counted per day. Because the hash salt rotates daily, the same person cannot be counted as one visitor across two days — so this line is daily, never weekly uniques."
            bodyClass="p-5"
          >
            {series.length === 0 ? (
              <Empty>No pageviews in this range yet.</Empty>
            ) : (
              <BarChart
                points={series.map((p) => ({
                  label: p.t.slice(5, 10),
                  value: p.pageviews,
                  secondary: p.visitors,
                }))}
                primary="Pageviews"
                secondary="Visitors"
              />
            )}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              title="Top pages"
              hint="Visitors column is per-day uniques, not per-page."
              action={
                <a href={`/dashboard/pages?site=${site.id}&range=${range}`} className="font-mono text-[11px] text-white/35 hover:text-white/70">
                  All →
                </a>
              }
            >
              <Bars
                rows={pages.map((p) => ({
                  label: p.path,
                  value: p.views,
                  hint: p.views.toLocaleString(),
                }))}
                empty="No pages yet."
              />
            </Panel>

            <Panel
              title="Scroll depth"
              hint="Sessions that ever reached each threshold. This is the number that says whether a page works, and it is the one most tools cannot show you."
            >
              {scroll[0]?.sessions === 0 ? (
                <Empty>No scroll events yet — needs a real page view.</Empty>
              ) : (
                <ul className="space-y-2.5">
                  {scroll.map((s) => (
                    <li key={s.depth}>
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[12px] text-white/60">{s.depth}%</span>
                        <span className="font-mono text-[12px] tabular-nums text-white/40">
                          {s.sessions.toLocaleString()}
                          <span className="ml-2 text-white/25">
                            {Math.round((s.sessions / maxScroll) * 100)}%
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-white/35"
                          style={{ width: `${(s.sessions / maxScroll) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className={`${CARD} p-4 xl:col-span-2`}>
              <p className="text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">
                What these numbers do not mean
              </p>
              <div className="mt-3 space-y-2">
                <Caveat>
                  Unique visitors are a lower bound. Two people behind one NAT share a hash and count
                  once; one person switching networks counts twice. There is no fix for this without
                  an identifier, and an identifier is the thing we are not building.
                </Caveat>
                <Caveat>
                  A bounce is defined as one heartbeat under 10s with no scroll past 25% and no custom
                  event. It is a deliberately conservative definition — someone who read one page
                  carefully for two minutes is not counted as a bounce.
                </Caveat>
              </div>
            </div>
            <div className={`${CARD} flex flex-col justify-between p-4`}>
              <div>
                <p className="text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">
                  Range
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-white/45">
                  Comparisons are against the immediately preceding window of equal length.
                </p>
              </div>
              <p className="mt-4 font-mono text-[11px] text-white/25">
                <Delta value={deltas.sessions} /> sessions vs previous {range}
              </p>
            </div>
          </div>
        </div>
      </>
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return (
      <>
        <Header siteId={site.id} siteName={site.name} range={range} title="Overview" base="" />
        <div className="p-5 sm:p-7">
          <Empty>{detail}</Empty>
        </div>
      </>
    );
  }
}
