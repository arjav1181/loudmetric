import { getEvents, getOverview } from "@/lib/queries";
import { compact } from "@/lib/vitals";
import { Header, NoSite, parseRange, resolveSite } from "../shell";
import { Bars, Caveat, Empty, Panel, Stat } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Custom events — the conversion layer.
 *
 * A goal is an event name; a funnel is a sequence of pages or events. Both are
 * declared by the site owner in their own code, which means the taxonomy is
 * never invented on your behalf by a heuristic.
 */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const site = await resolveSite(sp.site);
  if (!site) return <NoSite />;
  const range = parseRange(sp.range);

  const [events, overview] = await Promise.all([getEvents(site.id, range, 50), getOverview(site.id, range)]);

  const sessions = overview.totals.sessions;

  return (
    <>
      <Header
        siteId={site.id}
        siteName={site.name}
        range={range}
        title="Events"
        base="/events"
        sub="Conversions you declared yourself."
      />

      <div className="space-y-3 p-3 sm:p-4 lg:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Total events" value={compact(overview.totals.events)} delta={null} />
          <Stat
            label="Distinct names"
            value={events.length}
            sub="declared in your code"
          />
          <Stat
            label="Events / session"
            value={sessions > 0 ? (overview.totals.events / sessions).toFixed(2) : "—"}
            sub="depth of engagement"
          />
        </div>

        <Panel
          title="Event names"
          hint="Send one with: loudmetric('track', 'signup', { plan: 'pro' })"
        >
          {events.length === 0 ? (
            <Empty
              label="No custom events yet."
              hint="Call loudmetric('track', 'name') anywhere in your code and it appears here."
            />
          ) : (
            <Bars
              rows={events.map((e) => ({
                name: e.name,
                value: e.count,
                hint: `${compact(e.count)} · ${sessions > 0 ? Math.round((e.sessions / sessions) * 100) : 0}% of sessions`,
              }))}
            />
          )}
        </Panel>

        <Caveat>
          Properties are stored as JSONB and are not indexed or charted yet. Recording them works
          today; querying them efficiently does not, so the dashboard does not pretend otherwise.
        </Caveat>
      </div>
    </>
  );
}
