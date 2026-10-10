import { getSections, getScrollFunnel } from "@/lib/queries";
import { formatDuration } from "@/lib/vitals";
import { Header, NoSite, parseRange, resolveSite } from "../shell";
import { Caveat, Empty, Meter, Panel } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Section engagement — the view that justifies the whole project.
 *
 * Pageview tools answer "how many people arrived". This answers "did they read
 * it", which is the question a writer or designer actually has, and it is only
 * answerable with per-element visibility timing.
 */
export default async function EngagementPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const site = await resolveSite(sp.site);
  if (!site) return <NoSite />;
  const range = parseRange(sp.range);

  const [sections, scroll] = await Promise.all([
    getSections(site.id, range, 40),
    getScrollFunnel(site.id, range),
  ]);

  const maxDwell = Math.max(...sections.map((s) => s.avg_dwell_ms), 1);
  const top = scroll[0]?.sessions ?? 0;

  return (
    <>
      <Header
        siteId={site.id}
        siteName={site.name}
        range={range}
        title="Engagement"
        base="/engagement"
        sub="Which section held attention, and for how long. Measured by real element visibility, not scroll position."
      />

      <div className="space-y-3 p-3 sm:p-4 lg:px-6">
        <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
          <Panel
            title="Section dwell time"
            className="xl:col-span-1"
            hint="Average seconds a section spent as the most-visible element, per session that saw it. Sorted by attention."
          >
            {sections.length === 0 ? (
              <Empty>
                No tagged sections found. Add <code className="text-white/50">data-lm-section=&quot;name&quot;</code>{" "}
                to the elements you care about.
              </Empty>
            ) : (
              <ul className="space-y-3">
                {sections.map((s) => (
                  <li key={s.name}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-mono text-[12px] text-white/75">{s.name}</span>
                      <span className="shrink-0 font-mono text-[12px] tabular-nums text-white/50">
                        {formatDuration(s.avg_dwell_ms)}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Meter fraction={s.avg_dwell_ms / maxDwell} tone="bg-emerald-300/50" />
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-white/25">
                      seen by {s.views.toLocaleString()} session{s.views === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Scroll depth"
            className="xl:col-span-1"
            hint="Sessions that ever reached each threshold."
          >
            {top === 0 ? (
              <Empty>No scroll events yet.</Empty>
            ) : (
              <ul className="space-y-3">
                {scroll.map((s) => (
                  <li key={s.depth}>
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-[12px] text-white/70">{s.depth}%</span>
                      <span className="font-mono text-[12px] tabular-nums text-white/45">
                        {s.sessions.toLocaleString()}
                        <span className="ml-2 text-white/25">
                          {Math.round((s.sessions / top) * 100)}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Meter fraction={s.sessions / top} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-2">
          <Caveat>
            Section dwell measures time a section spent as the most-visible element, not time it was
            merely on screen. Reading two columns at once will attribute the time to one of them.
            That is the honest limit of element visibility without eye tracking, and it is why the
            numbers are labelled average-per-session rather than presented as total attention.
          </Caveat>
          <Caveat>
            A section only reports if it is marked. Untagged content is invisible here by design
            rather than being guessed at from scroll depth, which would produce confident numbers
            with no basis.
          </Caveat>
        </div>
      </div>
    </>
  );
}
