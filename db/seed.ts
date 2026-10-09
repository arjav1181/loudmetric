/**
 * Seed a demo site with realistic traffic.
 *
 *   npm run db:seed
 *
 * This exists because the most common first-run experience for a self-hosted
 * dashboard is eight empty panels, which says nothing about whether the tool
 * works. Every number this writes is obviously synthetic: the site is named
 * "Demo (fake data)", and it is marked so a real site can never be confused
 * with it.
 *
 * The shape of the data is modelled on a real reading-heavy site, including the
 * parts that are unflattering: a long tail, a bounce rate near 60%, mobile
 * traffic that scrolls worse than desktop, and LCP that is bad on exactly the
 * pages that get the most traffic. A dashboard that only ever shows good news
 * is a screenshot, not a tool.
 */
import { Client } from "pg";

const DEMO_NAME = "Demo (fake data)";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Re-seedable: drop the demo site and let the cascade take its events.
  await client.query("DELETE FROM sites WHERE name = $1", [DEMO_NAME]);
  const site = await client.query<{ id: string; write_key: string }>(
    "INSERT INTO sites (name, domain) VALUES ($1, $2) RETURNING id, write_key",
    [DEMO_NAME, "demo.invalid"],
  );
  const siteId = site.rows[0].id;

  const PAGES = [
    { path: "/", w: 30, lcp: 3100, scroll: 62 },
    { path: "/pricing", w: 18, lcp: 2400, scroll: 78 },
    { path: "/docs/getting-started", w: 16, lcp: 1900, scroll: 85 },
    { path: "/blog/why-cookieless-analytics", w: 14, lcp: 2800, scroll: 71 },
    { path: "/docs/api", w: 10, lcp: 2100, scroll: 55 },
    { path: "/about", w: 7, lcp: 2600, scroll: 90 },
    { path: "/changelog", w: 5, lcp: 1700, scroll: 44 },
  ];

  const SECTIONS = ["hero", "features", "pricing", "faq", "footer"];
  const REFERRERS = [
    "google.com",
    "github.com",
    "news.ycombinator.com",
    "reddit.com",
    "duckduckgo.com",
    null,
    null,
    null,
  ];

  // Deterministic PRNG so a reseed is reproducible and diffs are meaningful.
  let seed = 0x2f6e2b1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const weighted = <T extends { w: number }>(xs: T[]): T => {
    const total = xs.reduce((s, x) => s + x.w, 0);
    let r = rnd() * total;
    for (const x of xs) if ((r -= x.w) <= 0) return x;
    return xs[xs.length - 1];
  };

  const DAY = 86_400_000;
  const NOW = Date.now();
  // Heartbeats and vitals are emitted relative to a pageview, so a pageview
  // one second before "now" can still push children past it. Clamping once,
  // here, is what keeps the dataset free of events in the future.
  // Backdated 10 minutes, not 1 second: otherwise a freshly seeded dataset
  // reports a few hundred "live visitors" for the first five minutes, which
  // reads like a busy site rather than obviously synthetic data.
  const FLOOR_T = NOW - 10 * 60_000;
  const at = (ms: number) => new Date(Math.min(ms, FLOOR_T));
  const rows: unknown[][] = [];

  for (let day = 89; day >= 0; day--) {
    // Weekday traffic curve plus gentle growth, so the chart has a shape rather
    // than uniform noise.
    const date = new Date(NOW - day * DAY);
    const dow = date.getUTCDay();
    const weekday = dow === 0 || dow === 6 ? 0.65 : 1;
    const growth = 1 + (89 - day) / 260;
    const visits = Math.round((120 * weekday * growth) / (1 + day * 0.006));

    for (let v = 0; v < visits; v++) {
      const page = weighted(PAGES);
      const mobile = rnd() < 0.58;
      const referrer = pick(REFERRERS);
      // Clamped to the past: a naive `dayStart + random(DAY)` pushes day-0
      // events up to 24h into the future, which then shows up as "live
      // visitors" on a dataset that has no live visitors.
      const dayStart = NOW - day * DAY;
      const t0 = dayStart + Math.floor(rnd() * (DAY - 60_000));
      // The visitor hash rotates daily, so a "visitor" only exists within a day.
      const visitorHash = `demo-v-${day}-${v}`;
      const sessionId = `demo-s-${day}-${v}`;
      const props = { device: mobile ? "mobile" : "desktop", ua: mobile ? "Mozilla/5.0 (Linux; Android 14)" : "Mozilla/5.0 (Macintosh)" };

      rows.push([
        siteId,
        at(t0),
        "pageview",
        visitorHash,
        sessionId,
        page.path,
        page.path === "/" ? "LoudMetric — cookie-free analytics" : page.path,
        referrer,
        null,
        null,
        JSON.stringify(props),
      ]);

      // Bounce: ~58% leave inside 10s with little scrolling.
      const bounced = rnd() < 0.58;
      const scrolls = bounced ? [Math.floor(rnd() * 25)] : [25, 50, 75, 90, 100].filter((s) => rnd() < page.scroll / 100 * 1.2);
      for (const depth of [...new Set(scrolls)]) {
        rows.push([siteId, at(t0 + 900), "scroll", visitorHash, sessionId, page.path, null, null, null, depth, null]);
      }

      const dwellMs = bounced ? 2000 + Math.floor(rnd() * 7000) : 9000 + Math.floor(rnd() * 90000);
      for (let hb = 0; hb * 15_000 <= dwellMs; hb++) {
        rows.push([
          siteId,
          at(t0 + hb * 15_000),
          "heartbeat",
          visitorHash,
          sessionId,
          page.path,
          null,
          null,
          null,
          hb * 15_000,
          null,
        ]);
      }

      if (!bounced) {
        const nSections = 2 + Math.floor(rnd() * 4);
        for (let s = 0; s < nSections; s++) {
          rows.push([
            siteId,
            at(t0 + 3000 + s * 8000),
            "section",
            visitorHash,
            sessionId,
            page.path,
            null,
            null,
            SECTIONS[s % SECTIONS.length],
            900 + Math.floor(rnd() * 9000),
            null,
          ]);
        }
      }

      // Vitals: bad LCP on the heavy pages, good INP mostly.
      rows.push([siteId, at(t0 + 2500), "vital", visitorHash, sessionId, page.path, null, null, "lcp", Math.round(page.lcp * (0.7 + rnd() * 0.8)), null]);
      rows.push([siteId, at(t0 + 2600), "vital", visitorHash, sessionId, page.path, null, null, "cls", Math.round((0.02 + rnd() * 0.22) * 1000) / 1000, null]);
      if (rnd() < 0.7) {
        rows.push([siteId, at(t0 + 4000), "vital", visitorHash, sessionId, page.path, null, null, "inp", Math.round(60 + rnd() * 460), null]);
      }

      // Custom events, weighted toward the pricing page.
      if (page.path === "/pricing" && rnd() < 0.09) {
        rows.push([siteId, at(t0 + 7000), "event", visitorHash, sessionId, page.path, null, null, "trial_started", null, JSON.stringify({ plan: "pro" })]);
      }
      if (page.path === "/docs/getting-started" && rnd() < 0.14) {
        rows.push([siteId, at(t0 + 6000), "event", visitorHash, sessionId, page.path, null, null, "docs_completed", null, null]);
      }
    }
  }

  // Filtered bot traffic, so the Settings panel has something truthful to show.
  for (let i = 0; i < 420; i++) {
    rows.push([
      siteId,
      new Date(NOW - (1 + Math.floor(rnd() * 30)) * DAY),
      "bot_blocked",
      `bot-${i}`,
      `bot-${i}`,
      pick(PAGES).path,
      null,
      "Googlebot/2.1",
      null,
      null,
      JSON.stringify({ filtered: 1, reason: "known-bot" }),
    ]);
  }

  // Batch insert. One statement per 2000 rows keeps parameter counts sane.
  const COLS =
    "(site_id, occurred_at, type, visitor_hash, session_id, path, title, referrer, name, value, properties)";
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 2000) {
    const chunk = rows.slice(i, i + 2000);
    const values = chunk
      .map((_, ri) =>
        `(${Array.from({ length: 11 }, (_, c) => `$${ri * 11 + c + 1}`).join(",")})`,
      )
      .join(",");
    await client.query(
      `INSERT INTO events ${COLS} VALUES ${values}`,
      chunk.flat() as never[],
    );
    inserted += chunk.length;
  }

  await client.query(
    "INSERT INTO site_bots (site_id, pattern, kind) VALUES ($1, 'my-internal-scraper', 'ua'), ($1, '/wp-admin', 'path') ON CONFLICT DO NOTHING",
    [siteId],
  );

  console.log(`Seeded "${DEMO_NAME}"`);
  console.log(`  site id     ${siteId}`);
  console.log(`  write key   ${site.rows[0].write_key}`);
  console.log(`  events      ${inserted.toLocaleString()}`);
  console.log(`\nOpen /dashboard?site=${siteId}`);
  console.log("Every row above is synthetic. Delete it with:");
  console.log(`  psql "$DATABASE_URL" -c "DELETE FROM sites WHERE name = '${DEMO_NAME}'"`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
