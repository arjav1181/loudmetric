import { getVitals } from "@/lib/queries";
import {
  GRADE_DOT,
  GRADE_TEXT,
  METRICS,
  formatVital,
  gradeVital,
  vitalFraction,
  type Metric,
} from "@/lib/vitals";
import { VitalLines } from "../charts";
import { Header, NoSite, parseRange, resolveSite } from "../shell";
import { Caveat, Empty, GradeDot, Meter, Panel } from "../ui";

export const dynamic = "force-dynamic";

const ORDER: Metric[] = ["lcp", "cls", "inp"];

/**
 * Real Core Web Vitals from real visitors — the feature no other self-hosted
 * analytics tool collects.
 *
 * These are field measurements on actual devices, which is the only number
 * that matters: a lab score is your machine, a field score is your users'.
 */
export default async function VitalsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const site = await resolveSite(sp.site);
  if (!site) return <NoSite />;
  const range = parseRange(sp.range);

  const { p75, series } = await getVitals(site.id, range);
  const hasAny = ORDER.some((m) => p75[m] !== null);

  return (
    <>
      <Header
        siteId={site.id}
        siteName={site.name}
        range={range}
        title="Core Web Vitals"
        base="/vitals"
        sub="Measured in the field on real devices via PerformanceObserver. Lab scores measure your laptop; these measure your visitors."
      />

      <div className="space-y-4 p-5 sm:p-7">
        {!hasAny ? (
          <Panel title="No samples yet">
            <Empty>
              Core Web Vitals appear once real visitors load your site. Nothing is simulated or
              estimated in the meantime.
            </Empty>
          </Panel>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          {ORDER.map((m) => {
            const value = p75[m];
            const grade = gradeVital(m, value);
            const meta = METRICS[m];
            return (
              <div key={m} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <GradeDot tone={GRADE_DOT[grade]} />
                  <p className="text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">
                    {meta.label}
                  </p>
                </div>
                <p className="mt-2.5 font-mono text-[28px] leading-none tracking-tight tabular-nums">
                  {formatVital(m, value)}
                </p>
                <p className={`mt-2 font-mono text-[11px] ${GRADE_TEXT[grade]}`}>
                  {grade === "unknown"
                    ? "no samples"
                    : grade === "good"
                      ? "good"
                      : grade === "needs-improvement"
                        ? "needs work"
                        : "poor"}
                </p>
                <div className="mt-3">
                  <Meter
                    fraction={vitalFraction(m, value)}
                    tone={
                      grade === "good"
                        ? "bg-emerald-400/60"
                        : grade === "needs-improvement"
                          ? "bg-amber-400/60"
                          : grade === "poor"
                            ? "bg-red-400/60"
                            : "bg-white/15"
                    }
                  />
                </div>
                <p className="mt-2 text-[10px] text-white/25">
                  {meta.full} · good ≤ {formatVital(m, meta.good)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {ORDER.map((m) => {
            const meta = METRICS[m];
            return (
              <Panel key={m} title={`${meta.label} over time`} hint={`p75 per day · ${meta.full}`}>
                <VitalLines series={series} metric={m} good={meta.good} poor={meta.poor} />
              </Panel>
            );
          })}
        </div>

        <div className="space-y-2">
          <Caveat>
            The headline figures average each day&rsquo;s p75 across the selected range. A true rolling
            30-day p75 would re-rank every sample when a new day arrives; averaging daily p75s moves
            less and is easier to reason about. Both are approximations of the field metric, and this
            one is the cheaper lie.
          </Caveat>
          <Caveat>
            INP only appears for sessions with an interaction. A site nobody clicks has no INP data,
            and the panel says so rather than showing a flattering zero.
          </Caveat>
        </div>
      </div>
    </>
  );
}
