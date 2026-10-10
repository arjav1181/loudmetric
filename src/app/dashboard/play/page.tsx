import {
  getEventWithNumber,
  getEventSessions,
  getEventBuckets,
  getEventConversion,
  getOverview,
} from "@/lib/queries";
import { Header, NoSite, parseRange, resolveSite } from "../shell";
import { Panel, Stat, Bars, Empty, Delta, Caveat } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Play analytics: who started, and how long they actually played.
 *
 * Two things are deliberately absent. There is no "time on site" number,
 * because an open tab is not play time — Flappy Modi pauses and stops counting
 * when the round ends, when the player pauses, and when the tab is hidden. And
 * there is no per-player breakdown, because there is no way to identify a player
 * in a cookieless system without building the thing this product refuses to
 * build.
 *
 * Every figure below is therefore an aggregate: how many people clicked, how
 * many of those sessions went on to play, and how long the playing lasted.
 */

const BANDS = ["<5s", "5-15s", "15-60s", "1-5m", "5m+"];

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const site = await resolveSite(sp.site);
  if (!site) return <NoSite />;
  const range = parseRange(sp.range);

  try {
    const [clicks, clickSessions, played, buckets, conversion, overview] = await Promise.all([
      getEventSessions(site.id, range, "play_clicked"),
      getEventConversion(site.id, range, "play_clicked"),
      getEventWithNumber(site.id, range, "play_session", "played_seconds"),
      getEventBuckets(site.id, range, "play_session", "band", BANDS),
      getEventConversion(site.id, range, "round_over"),
      getOverview(site.id, range),
    ]);

    const sessions = overview.totals.sessions;
    const maxBand = Math.max(...buckets.map((b) => b.n), 1);
    const hasData = clicks > 0 || played.count > 0;

    return (
      <>
        <Header
          siteId={site.id}
          siteName={site.name}
          range={range}
          title="Play"
          base="/play"
          sub="Who started a round, and how long they actually played."
        />

        <div className="space-y-3 p-3 sm:p-4 lg:px-6">
          {!hasData ? (
            <Panel title="Nothing to show yet">
              <Empty
                label="No play events recorded in this range."
                hint="They appear once someone clicks the Play button on your site."
              />
            </Panel>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Play clicked" value={clicks.toLocaleString()} sub="sessions" />
            <Stat
              label="Click-through"
              value={conversion.rate === null ? "—" : `${conversion.rate}%`}
              sub="of all sessions"
            />
            <Stat
              label="Total play time"
              value={formatDuration(played.total)}
              sub={`${played.count.toLocaleString()} play sessions`}
            />
            <Stat
              label="Average session"
              value={played.avg === null ? "—" : `${played.avg}s`}
              sub="active play only"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="How long people play"
              hint="Every completed play session, bucketed. Buckets rather than exact values so the shape is readable."
            >
              {played.count === 0 ? (
                <Empty label="No completed play sessions yet." />
              ) : (
                <div>
                  <Bars
                    rows={buckets.map((b) => ({ name: b.band, value: b.n }))}
                    empty="No sessions bucketed yet."
                  />
                  <p className="mt-3 text-[12px] text-white/35">
                    {Math.round(((buckets.find((b) => b.band === "5m+")?.n ?? 0) / maxBand) * 100)}% of
                    the longest bucket is not a rate — read the counts.
                  </p>
                </div>
              )}
            </Panel>

            <Panel
              title="From click to finished round"
              hint="Share of sessions that produced at least one completed round."
            >
              <div className="flex items-baseline gap-3">
                <span className="geist-mono text-2xl tabular-nums">
                  {conversion.sessions === 0 ? "—" : `${sessions.toLocaleString()}`}
                </span>
                <span className="text-[12px] text-white/40">sessions in range</span>
              </div>
              <div className="mt-4 space-y-3">
                <Step
                  label="Clicked Play"
                  value={clickSessions.withEvent}
                  total={clickSessions.sessions || 1}
                />
                <Step
                  label="Finished a round"
                  value={conversion.withEvent}
                  total={clickSessions.withEvent || 1}
                />
              </div>
            </Panel>
          </div>

          <div className="geist-panel p-4">
            <p className="geist-label">What these numbers do not mean</p>
            <div className="mt-3 space-y-3">
              <Caveat>
                There is no time-on-site figure here, on purpose. Someone who leaves a tab open
                for an hour has not played for an hour, so the clock stops when the round ends,
                when the player pauses, and when the tab is hidden. What you get is active play
                time, which is a smaller and more honest number.
              </Caveat>
              <Caveat>
                Sessions cannot be linked across days, so &ldquo;people who click Play and come
                back tomorrow&rdquo; is not answerable here. Nor can a play session be attributed
                to a specific person — there is no identifier to attribute it to.
              </Caveat>
              <Caveat>
                Total play time is a sum over sessions, so it grows with traffic whether or not
                engagement improves. Read it alongside the average; a rising total with a falling
                average means more people playing less each.
              </Caveat>
            </div>
          </div>
        </div>
      </>
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return (
      <>
        <Header siteId={site.id} siteName={site.name} range={range} title="Play" base="/play" />
        <div className="p-6">
          <Empty label={detail} />
        </div>
      </>
    );
  }
}

function Step({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-white/60">{label}</span>
        <span className="geist-mono text-[12px] tabular-nums text-white/45">
          {value.toLocaleString()} · {pct}%
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-[2px] bg-white/[0.06]">
        <div
          className="h-full rounded-[2px] bg-white/30"
          style={{ width: `${Math.max(1.5, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
