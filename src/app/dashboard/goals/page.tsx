import { statsForAllGoals, type GoalStats } from "@/lib/goals";
import { formatNumber } from "@/lib/format";
import { Header, NoSite, parseRange, resolveSite } from "../shell";
import { Panel, Stat, Empty, Caveat } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Goals: whatever this site decided to measure.
 *
 * Nothing on this page knows what a "play session" or a "newsletter signup" is.
 * A goal is declared by the operator, with the properties it carries, and every
 * number below is computed from those declarations by Postgres. Adding a goal
 * costs a row in the database and no code at all — which is the whole reason
 * this is a generic view rather than one panel per product.
 */
export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const site = await resolveSite(sp.site);
  if (!site) return <NoSite />;
  const range = parseRange(sp.range);

  const stats = await statsForAllGoals(site.id, range);

  return (
    <>
      <Header
        siteId={site.id}
        siteName={site.name}
        range={range}
        title="Goals"
        base="/goals"
        sub="Conversions and measurements you defined. Each one is declared with the properties it carries, so the numbers below are computed from your definition rather than from a fixed list."
      />

      <div className="space-y-3 p-3 sm:p-4 lg:px-6">
        {stats.length === 0 ? (
          <Panel title="No goals yet">
            <Empty
              label="You have not declared a goal for this site."
              hint="Add one from the Goals panel in Settings, or call loudmetric('track', 'your_event') from your code and declare it here."
            />
          </Panel>
        ) : null}

        {stats.map((s) => (
          <GoalCard key={s.goal.id} s={s} />
        ))}

        {stats.length > 0 ? (
          <Panel title="What these numbers do not mean">
            <div className="space-y-3">
              <Caveat>
                A goal count is events, not people. Because nothing here can be joined across
                days, one person firing the same goal twice counts twice and one person firing it
                over two days cannot be recognised as the same person at all.
              </Caveat>
              <Caveat>
                Conversion rate is against all sessions in the range, not against sessions that
                reached the point where the goal was possible. A goal placed late in a flow will
                always look worse than it is.
              </Caveat>
              <Caveat>
                Aggregates read the first numeric property declared. If a goal carries several,
                the others appear as totals rather than as distributions — adding a histogram for
                each would mean five competing shapes in one panel.
              </Caveat>
            </div>
          </Panel>
        ) : null}
      </div>
    </>
  );
}

function GoalCard({ s }: { s: GoalStats }) {
  const aggs = Object.values(s.aggregates);
  const hist = s.histogram;
  const maxN = hist ? Math.max(...hist.buckets.map((b) => b.n), 1) : 1;

  return (
    <Panel
      title={s.goal.name}
      hint={
        s.goal.description ??
        (s.properties.length
          ? `Properties: ${s.properties.map((p) => p.key).join(", ")}`
          : "No properties declared.")
      }
      action={
        s.goal.unit ? (
          <span className="geist-mono text-[11px] text-white/35">{s.goal.unit}</span>
        ) : null
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Events" value={formatNumber(s.total)} />
        <Stat label="Sessions" value={formatNumber(s.sessions)} sub="distinct" />
        <Stat
          label="Conversion"
          value={s.conversionRate === null ? "—" : `${s.conversionRate}%`}
          sub={`of ${formatNumber(s.totalSessions)} sessions`}
        />
        {aggs[0] ? (
          <Stat
            label={aggs[0].agg === "avg" ? `Average ${aggs[0].key}` : `Total ${aggs[0].key}`}
            value={formatNumber(aggs[0].value)}
            sub={aggs[0].unit ?? undefined}
          />
        ) : (
          <Stat label="Sessions" value={formatNumber(s.sessions)} sub="no properties declared" />
        )}
      </div>

      {hist ? (
        <div className="mt-4">
          <p className="geist-label">Distribution of {hist.key}</p>
          <ul className="mt-2.5 space-y-2">
            {hist.buckets.map((b) => (
              <li key={b.label}>
                <div className="flex items-baseline justify-between">
                  <span className="geist-mono text-[12px] text-white/65">{b.label}</span>
                  <span className="geist-mono text-[12px] tabular-nums text-white/45">
                    {formatNumber(b.n)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-[2px] bg-white/[0.06]">
                  <div
                    className="h-full rounded-[2px] bg-white/30"
                    style={{ width: `${Math.max(1.5, (b.n / maxN) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {aggs.length > 1 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {aggs.slice(1).map((a) => (
            <div key={a.key} className="flex items-baseline justify-between">
              <span className="text-[12px] text-white/50">
                {a.agg === "avg" ? `Average ${a.key}` : `Total ${a.key}`}
              </span>
              <span className="geist-mono text-[12px] tabular-nums text-white/70">
                {formatNumber(a.value)}
                {a.unit ? ` ${a.unit}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
