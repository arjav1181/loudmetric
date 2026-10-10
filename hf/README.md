---
title: LoudMetric
emoji: 📊
colorFrom: gray
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Self-hosted, cookie-free analytics for Hugging Face Spaces
---

# LoudMetric on Hugging Face Spaces

Self-hosted, cookie-free analytics — running on a Hugging Face Space with its
analytics stored in a Hugging Face Dataset.

No cookies, no fingerprinting, no persistent visitor identifier. IP addresses are
hashed against a salt that rotates daily and are never stored, so yesterday's
visitors cannot be joined to today's. That is a design decision, not a
limitation to apologise for.

**This Space is a demonstration and a public collector.** It runs on a shared
2 vCPU box, sleeps when idle, and has a storage pattern you should understand
before trusting it with anything:

> Events are flushed to the Dataset every 15 minutes. Anything collected in the
> window between the last flush and a restart is lost. The dashboard shows the
> age of the newest event, so you can see whether the sync is keeping up.

For real production analytics, self-host it properly with the Docker Compose
file in the repository — that gives you real Postgres with no sync window.

## How this is stored

The Space runs Postgres in the container. The 50 GB runtime disk is ephemeral and
Hugging Face has retired persistent storage, so the database is dumped to a
Dataset repo on a schedule and restored on boot. That is the mechanism Hugging
Face recommends, and it is the only safe one: a live `PGDATA` directory cannot
round-trip through git and LFS without corrupting.

## Secrets you must set

The Space will not start serving authenticated requests without these. Both go
in **Settings → Secrets**:

| Secret | Value | Why |
| --- | --- | --- |
| `SESSION_SECRET` | `openssl rand -hex 32` | Signs the session cookie. The app **refuses to sign** anything shorter than 16 characters, and login reports "Server is misconfigured" rather than falling back to a forgeable default. |
| `INGEST_SALT` | any long random string | Daily salt for hashing visitor IPs. It rotates every day regardless, but a fixed secret here is what makes the rotation mean anything. |
| `HF_TOKEN` | your Hugging Face token | Lets the sync loop write dumps to the dataset. |
| `HF_DATASET_ID` | `abc1181/loudmetric-data` | Which dataset receives the dumps. |

Optional but recommended, because it makes redirects correct even if a proxy
stops forwarding headers:

| Variable | Value |
| --- | --- |
| `PUBLIC_ORIGIN` | `https://abc1181-loudmetric.hf.space` |

Without it, redirect targets are derived from `X-Forwarded-Host`/`Host`. That
works behind the Space's proxy, but a container whose own address is
`0.0.0.0` cannot work it out on its own — which is why an early version sent
every login redirect to `http://0.0.0.0:7860`.

## Using it

1. Visit the Space. On first run it asks you to create an account — that form
   only works while no account exists.
2. Create a site to get a write key and a tracking snippet.
3. Put the snippet in your site's `<head>`:

```html
<script
  async
  src="https://abc1181-loudmetric.hf.space/loudmetric.js"
  data-site="YOUR_WRITE_KEY"
  data-endpoint="https://abc1181-loudmetric.hf.space/api/ingest"
></script>
```

## Privacy model

| Question | Answer |
|---|---|
| Cookies? | Never. |
| Fingerprinting? | No canvas, fonts, WebGL, or audio. |
| IP addresses stored? | No — hashed on arrival against a daily salt. |
| Can visitors be linked across days? | No. That is the design. |
| Do Not Track? | Honoured — the snippet no-ops. |
| Telemetry leaves this machine? | No. |

The trade-off is honest: cross-day journeys and returning-user rates are not
knowable without an identifier, and this project does not create one.

## What it measures

Pageviews, scroll depth, per-section engagement, dwell time, real Core Web Vitals
from actual visitors, funnels, and custom events.

## Source

MIT licensed. Not affiliated with or endorsed by Google Analytics, Plausible,
Umami, or any other analytics product mentioned here.

[github.com/arjav1181/loudmetric](https://github.com/arjav1181/loudmetric)