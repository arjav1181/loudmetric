import { getFunnel, getPages, type Funnel } from "@/lib/queries";
import { FunnelChart } from "../charts";
import { Header, NoSite, parseRange, resolveSite } from "../shell";
import { Caveat, Empty, Panel } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Funnels.
 *
 * The unit is a session, never a person, and the reason is printed under every
 * funnel: cross-day identity does not exist in this system, so a funnel that
 * implied it would be quietly reporting a different question than the one
 * asked.
 */
export default async function FunnelsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const site = await resolveSite(sp.site);
  if (!site) return <NoSite />;
  const range = parseRange(sp.range);

  const pages = await getPages(site.id, range, 25);

  // Sensible default funnel built from real traffic: the most-viewed page, then
  // whatever is second, so the panel is never an empty box you have to
  // configure before it says anything.
  const topPaths = pages.map((p) => p.path);
  const funnel: Funnel = {
    name: "Top pages, in order",
    steps: topPaths.slice(0, 4),
    windowMs: 30 * 60_000,
  };

  const result = funnel.steps.length >= 2 ? await getFunnel(site.id, range, funnel) : null;

  return (
    <>
      <Header
        siteId={site.id}
        siteName={site.name}
        range={range}
        title="Funnels"
        base="/funnels"
        sub="Ordered page paths within a single 30-minute session."
      />

      <div className="space-y-3 p-3 sm:p-4 lg:px-6">
        {topPaths.length < 2 ? (
          <Panel title="Not enough pages yet">
            <Empty label="A funnel needs at least two pages with traffic." hint="Add pages and come back." />
          </Panel>
        ) : result ? (
          <Panel
            title={`${funnel.name} · ${funnel.steps.length} steps`}
            hint="Bar width is proportional to sessions entered, so a steep drop is visible as a shape, not just a number."
          >
            <FunnelChart stages={result.steps.map((s) => ({ name: s.name, value: s.entered }))} />
            <div className="mt-4 space-y-2 border-t border-white/[0.05] pt-4">
              <Caveat>
                Steps must be reached in order within 30 minutes of the previous step. A session that
                visits step 3 before step 2 has not completed this funnel, even though both pages were
                seen — which is the difference between a funnel and a page-pair count.
              </Caveat>
              {result.dropoffs.length ? (
                <Caveat>
                  Biggest drop: <span className="text-white/50">{result.dropoffs[0]}</span>
                </Caveat>
              ) : null}
            </div>
          </Panel>
        ) : null}

        <Panel title="Available steps" hint="Every page with traffic in this range, in case you want to build a different funnel.">
          <ul className="flex flex-wrap gap-1.5">
            {topPaths.map((p) => (
              <li
                key={p}
                className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[11px] text-white/50"
              >
                {p}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
