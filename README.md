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
src/app/…                 the dashboard
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

---

## Licence

MIT. Use it, fork it, self-host it, sell support for it.

Not affiliated with or endorsed by Google Analytics, Plausible, Umami, or any
other analytics product mentioned in this README.