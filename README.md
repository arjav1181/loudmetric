# LoudMetric

Self-hosted, cookie-free analytics for people who do not want to track people.

No cookies, no consent banner, no data leaving your server. It still tells you
what people actually read, and how fast your site really is — which most
cookieless tools do not.

---

## Why this exists

Every mainstream analytics tool asks you to choose between "accurate" and
"does not fingerprint people". Plausible, Fathom, Umami and Simple Analytics
all made the same trade: give up the per-visitor detail, because identifying a
visitor requires a cookie.

LoudMetric makes the other trade. It keeps the detail that actually answers
questions — which section was read, for how long, and what the real Core Web
Vitals were on real phones — while refusing to build a persistent identifier at
all.

**What is genuinely different:**

- **Real Core Web Vitals.** LCP, CLS and INP measured from actual visitors via
  `PerformanceObserver`, charted against traffic. No other self-hosted tool
  collects these.
- **Section-level engagement.** Not "scrolled 60%" but *which section*, and
  for how long, based on which element was actually most visible.
- **Anomaly detection that needs no model.** Each day is compared against the
  *same weekday* over the previous 8 weeks, using median and median absolute
  deviation. One viral day cannot inflate the baseline and hide the next spike,
  and there is no API call, so it works with the AI layer switched off.
- **Honest scoping.** Metrics that can only be stored all-time are labelled
  all-time. Nothing quietly implies a date filter applies to it.
- **No identifier, on purpose.** Visitors are counted by a hash of IP + user
  agent against a salt that rotates daily. Yesterday cannot be joined to today,
  because yesterday's salt no longer exists.

---

## Run it

```bash
git clone https://github.com/arjav1181/loudmetric.git
cd loudmetric
cp .env.example .env
docker compose up
```

That is the whole setup. Open <http://localhost:3000>, create a site, paste the
snippet into your `<head>`:

```html
<script
  async
  src="https://your-loudmetric-host/loudmetric.js"
  data-site="YOUR_WRITE_KEY"
  data-endpoint="https://your-loudmetric-host/api/ingest"
></script>
```

No signup, no email, no DNS verification. You get a write key immediately.

### Without Docker

```bash
npm install
export DATABASE_URL=postgres://localhost/loudmetric
psql "$DATABASE_URL" -f db/schema.sql
npm run dev
```

You need Node 20+ and Postgres 14+.

---

## How the privacy model works

| Question | Answer |
|---|---|
| Do you set cookies? | No. Never. |
| Do you fingerprint? | No. No canvas, no fonts, no WebGL, no audio. |
| Is an IP stored? | No. Hashed on arrival, against a salt that rotates daily. |
| Can you link a visitor across days? | No. That is the design, not a gap. |
| Do you honour Do Not Track? | Yes, the snippet no-ops when `doNotTrack` is on. |
| Does anything phone home? | No. There is no external call in this codebase. |

The trade-off is honest: **you cannot see cross-day journeys, because a visitor
who cannot be identified cannot be followed.** Most tools resolve that by
setting a cookie. This one does not.

---

## Try it before you have traffic

```bash
npm run db:seed     # ~91,000 synthetic events over 90 days
```

The seed writes a site called **"Demo (fake data)"** so it can never be mistaken
for a real one. The data is modelled on a reading-heavy site *including the
unflattering parts* — a ~57% bounce rate, mobile traffic that scrolls worse than
desktop, and LCP that is bad on exactly the pages that get the most traffic. A
dashboard that only shows good news is a screenshot, not a tool.

```bash
psql "$DATABASE_URL" -c "DELETE FROM sites WHERE name = 'Demo (fake data)'"
```

### Operations

| Command | Does |
|---|---|
| `npm run db:init` | Applies the schema. Safe to re-run. |
| `npm run db:partitions` | Creates missing months, drops expired ones. Monthly cron. |
| `npm run db:seed` | Synthetic demo traffic. |
| `npm test` | Guard + grounding tests. No database needed. |
| `npm run test:db -- <siteId>` | Proves Postgres refuses writes, with the static checker bypassed. |
| `npm run test:agent -- <siteId>` | The copilot loop end to end, driven by a scripted model. |

`npm run test:db -- <siteId> --bypass` is the one that matters most. It skips the
regex layer entirely and fires INSERT/UPDATE/DELETE/DROP and a data-modifying
CTE straight at the read-only transaction, so a green run means the *database*
refused — not that the validation still works.

`db:partitions` backfills **every** month from the retention floor to next month,
not just next month. A fresh install has no partitions at all, and a site that
imports history needs months that are already current — creating only the next
month makes every insert in a gap fail with `no partition of relation found for
row`, which is a miserable thing to debug from an error the tracker swallowed in
a browser.

Retention is 12 months and lives in Postgres rather than in shell `date`:

```bash
PGOPTIONS='-c loudmetric.keep_months=24' psql "$DATABASE_URL" -f db/partition.sql
```

---

## What it tracks

| Type | What it means |
|---|---|
| `pageview` | Path, title, referrer |
| `scroll` | Depth reached, reported at 25/50/75/90/100% |
| `section` | Which `[data-lm-section]` was most visible, and for how long |
| `vital` | LCP, CLS, INP from real field data |
| `heartbeat` | Presence, used to compute dwell time and detect bounces |
| `event` | Your own goals: `loudmetric('track', 'signup', { plan: 'pro' })` |

Tag sections to get engagement depth:

```html
<section data-lm-section="pricing"> … </section>
```

### Tuning the snippet

| Attribute | Default | Effect |
|---|---|---|
| `data-scroll` | `true` | Set `false` to skip scroll tracking on very long pages |
| `data-heartbeat` | `true` | Set `false` to disable dwell-time tracking |

---

## Bot filtering

Built-in user-agent and headless-browser signatures, plus a per-site
exclusion list you edit from the dashboard:

```sql
INSERT INTO site_bots (site_id, pattern, kind) VALUES ('…', 'my-scraper', 'ua');
```

There is deliberately **no JavaScript challenge**. A challenge means a third
party in the request path, which is the exact thing this project exists to
avoid.

The consequence, stated plainly: some sophisticated bots will get through.
Filtering is honest about what it can catch rather than implying it catches
everything.

---

## Architecture

```
tracker/loudmetric.js      one file, no dependencies, framework-agnostic
src/app/api/ingest        the only write path
db/schema.sql             Postgres, partitioned monthly
src/app/dashboard/        the dashboard (7 views, no charting library)
db/partition.sql          partition maintenance — run monthly
db/seed.ts                synthetic demo traffic
```

Two decisions worth explaining up front:

**The ingest endpoint reads `text/plain`.** Ingest URLs are the most-scraped
endpoints on any analytics service. Taking the body as plain text means the
browser never issues a CORS preflight, so a cross-origin POST from a random
site is rejected before it arrives. It also avoids a content-type that invites
preflights in the first place.

**Events are partitioned by month.** Analytics data is append-only and queried
by time range. Partitioning keeps the hot window small and makes retention a
matter of dropping a partition rather than deleting rows.

**No charting library.** Recharts would add 150–400kB to render bars and a
tooltip that is ~80 lines of SVG here, and the funnel those libraries ship with
is a stack of tapered bars regardless. Every dashboard view is hand-built SVG, so
the whole dashboard is under 100kB of JS.

**`events.site_id` has a foreign key.** `ON DELETE CASCADE`, which is
load-bearing: without it, deleting a site leaves its entire event history on disk
forever — invisible to the dashboard, still growing. It is verified by test
rather than assumed.

---

## Run it on a Hugging Face Space

```bash
huggingface-cli login
huggingface-cli repo create abc1181/loudmetric --repo-type space --sdk docker --space-sdk docker
huggingface-cli upload abc1181/loudmetric . --repo-type space \
  --include "hf/*" "Dockerfile" "README.md" ".env.example" \
             "package*.json" "next.config.mjs" "tsconfig.json" \
             "src/**" "public/**" "db/**" "scripts/**"
```

Postgres runs in the Space container and is dumped to an HF Dataset every 15
minutes, restored on boot. That is the mechanism Hugging Face recommends:
persistent storage is retired, and a dataset repo is the documented replacement.

**It is a dump, not a live data directory.** Anything written in the last
`SYNC_INTERVAL` seconds is lost if the Space restarts — the dashboard reports the
age of the newest event so the sync window is visible rather than implied. A dump
is a consistent snapshot, so there is no half-written file, just a real window of
loss.

Docker Spaces require a paid PRO plan; free accounts can only host Gradio Spaces
on ZeroGPU.

### Why not sync a live PGDATA

Because it corrupts. A Postgres data directory needs `fsync` semantics,
`/dev/shm`, and background processes (checkpointer, WAL writer) against a real
filesystem. Round-tripping a running cluster through git and LFS does not persist
it, it breaks it. `pg_dump --format=custom` produces a consistent snapshot that
`pg_restore --clean` can put back, which is why the sync uses that.

Verified locally: 90,833 events dumped, dropped, and restored byte-identical in
count through a real `pg_restore`.

### Files

| Path | Does |
|---|---|
| `hf/Dockerfile` | Space image: Postgres + app, port 7860 |
| `hf/entrypoint.sh` | Boot: start PG, restore, migrate, serve, sync loop |
| `hf/sync.py` | `push` / `pull` the dump to the dataset |
| `hf/README.md` | Space frontmatter and public description |

---

## Licence

MIT. Use it, fork it, self-host it, sell support for it.

Not affiliated with or endorsed by Google Analytics, Plausible, Umami, or any
other analytics product mentioned in this README.