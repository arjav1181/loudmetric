import {
  getOverview,
  getLiveVisitors,
  getPages,
  getReferrers,
  getDevices,
  getScrollFunnel,
  getVitals,
} from "@/lib/queries";
import { compact, formatVital, gradeVital, METRICS, GRADE_DOT, GRADE_TEXT } from "@/lib/vitals";
import { AnomalyPanel } from "./AnomalyPanel";
import { TrafficChart, CategoryBars } from "./recharts";
import { FunnelChart } from "./charts";
import { Panel, Stat, Bars, Table, Empty, Delta } from "./ui";
import { Header, NoSite, parseRange, resolveSite } from "./shell";

export const dynamic = "force-dynamic";

/**
 * Overview.
 *
 * Composition ported from the portfolio admin: a four-tile stat row, then a
 * 1.6fr/1fr split with the traffic chart beside a funnel and a secondary panel,
 * then a three-column band. The proportions are the portfolio's, because the
 * asymmetry between the primary chart and its sidebar is doing the work — a
 * 50/50 split makes the chart as important as the funnel, and it is not.
 *
 * The data is entirely different. Everything below the grid is queried from
 * Postgres at request time; no rollup table and no cache, so a number here is
 * the same number a raw query returns.
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
    const [overview, live, pages, refs, devices, scroll, vitals] = await Promise.all([
      getOverview(site.id, range),
      getLiveVisitors(site.id, 5).catch(() => ({ active: 0, pages: 0 })),
      getPages(site.id, range, 6),
      getReferrers(site.id, range, 6),
      getDevices(site.id, range),
      getScrollFunnel(site.id, range),
      getVitals(site.id, range).catch(() => ({ p75: { lcp: null, cls: null, inp: null }, series: [] })),
    ]);

    const { totals, deltas, series } = overview;
    const engagedPct =
      totals.sessions > 0
        ? Math.round(((totals.sessions - totals.bounces) / totals.sessions) * 100)
        : 0;

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

        <div className="space-y-3 p-3 sm:p-4 lg:px-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Pageviews" value={compact(totals.pageviews)} delta={deltas.pageviews} />
            <Stat
              label="Unique"
              value={compact(totals.visitors)}
              delta={deltas.visitors}
              sub="per day, salt-rotated"
            />
            <Stat
              label="Engaged"
              value={`${engagedPct}%`}
              sub={`${totals.sessions - totals.bounces} sessions`}
            />
            <Stat
              label="Avg dwell"
              value={totals.avgDwellSeconds === null ? "—" : `${totals.avgDwellSeconds}s`}
              delta={deltas.avgDwellSeconds}
              sub="time on page"
            />
          </div>

          <AnomalyPanel siteId={site.id} />

          <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
            <Panel
              title="Traffic"
              hint="Hover for exact numbers. Light bar behind each day is unique visitors."
            >
              {series.length === 0 ? (
                <Empty label="No data in this range." />
              ) : (
                <TrafficChart
                  data={series.map((p) => ({
                    label: p.t.slice(5, 10),
                    views: p.pageviews,
                    uniques: p.visitors,
                  }))}
                  height={190}
                />
              )}
            </Panel>

            <div className="space-y-3">
              <Panel
                title="Funnel"
                hint="Scroll thresholds. Each stage is capped by the one above it."
              >
                {scroll[0]?.sessions === 0 ? (
                  <Empty label="No scroll events yet." />
                ) : (
                  <FunnelChart
                    stages={[
                      { name: "Visited", value: scroll[0].sessions },
                      { name: "25% scroll", value: scroll[0].sessions },
                      { name: "50% scroll", value: scroll[1].sessions },
                      { name: "75% scroll", value: scroll[2].sessions },
                      { name: "Read to end", value: scroll[4].sessions },
                    ]}
                  />
                )}
              </Panel>

              <Panel title="Core Web Vitals" hint="p75 from real visitors">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(["lcp", "cls", "inp"] as const).map((m) => (
                    <Mini
                      key={m}
                      label={METRICS[m].label}
                      value={formatVital(m, vitals.p75[m])}
                      tone={gradeVital(m, vitals.p75[m])}
                    />
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Top pages" hint="Where people land" dense>
              <Bars rows={pages.map((p) => ({ name: p.path, value: p.views }))} />
            </Panel>
            <Panel title="Referrers" hint="Where visits come from" dense>
              <Bars rows={refs.map((r) => ({ name: r.referrer, value: r.views }))} />
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
            <Panel title="Bounce rate" hint="One heartbeat under 10s, no scroll past 25%, no event">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-2xl text-white tabular-nums">
                  {totals.bounceRate === null ? "—" : `${totals.bounceRate}%`}
                </span>
                <Delta value={deltas.bounceRate} goodDirection="down" />
              </div>
              <p className="mt-2 text-[11px] text-white/30">
                {totals.bounces.toLocaleString()} of {totals.sessions.toLocaleString()} sessions
              </p>
            </Panel>

            <Panel title="Devices" hint="Classified server-side at ingest" dense>
              <Bars rows={devices.map((d) => ({ name: d.kind, value: d.n }))} />
            </Panel>

            <Panel title="Scroll depth" hint="Sessions that ever reached each threshold" dense>
              <Table
                head={["Depth", "Sessions"]}
                rows={scroll.map((s) => [
                  `${s.depth}%`,
                  s.sessions.toLocaleString(),
                ])}
              />
            </Panel>
          </div>

          <div className="border border-white/10 p-4">
            <p className="text-[10px] font-medium tracking-[0.2em] text-white/40 uppercase">
              What these numbers do not mean
            </p>
            <div className="mt-3 space-y-2">
              <p className="border-l-2 border-white/10 pl-2.5 text-[11px] leading-relaxed text-white/30">
                Unique visitors are a lower bound. Two people behind one NAT share a hash and count
                once; one person switching networks counts twice. There is no fix without an
                identifier, and an identifier is the thing we are not building.
              </p>
              <p className="border-l-2 border-white/10 pl-2.5 text-[11px] leading-relaxed text-white/30">
                There is no persistent visitor id here, so returning users, cohort retention and
                cross-day journeys are unknowable. If a question needs one of those, the honest answer
                is that this system cannot answer it.
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
        <div className="p-6">
          <Empty label={detail} />
        </div>
      </>
    );
  }
}

/**
 * Compact figure with a grade dot.
 *
 * The colour channel carries a real Core Web Vitals verdict against Google's
 * thresholds, so it takes a grade rather than a decorative tone. The dot and the
 * text say the same thing, so the meaning survives colour-blindness.
 */
function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "good" | "needs-improvement" | "poor" | "unknown";
}) {
  return (
    <div className="border border-white/10 p-2.5">
      <p className="text-[9px] tracking-[0.15em] text-white/30 uppercase">{label}</p>
      <p className={`mt-1 font-mono text-lg leading-none tabular-nums ${GRADE_TEXT[tone]}`}>
        <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${GRADE_DOT[tone]}`} />
        {value}
      </p>
    </div>
  );
}