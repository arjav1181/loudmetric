-- LoudMetric schema
--
-- Design notes, because two decisions here look wrong until you know why.
--
-- 1. NO STABLE VISITOR ID. LoudMetric is cookieless, so there is nothing to
--    identify a person across days. `visitor_hash` is a hash of (IP, user
--    agent, a salt that ROTATES DAILY). That is enough to count unique
--    visitors per day and compute a session, and it is deliberately useless
--    for linking one day to the next. This is a privacy feature, not a
--    limitation to apologise for — cross-day journeys are not knowable without
--    a persistent identifier, and we refuse to create one.
--
-- 2. IP addresses are never stored raw. They are hashed with the rotating
--    salt at ingest. Rotating daily means the database cannot reconstruct an
--    address, and today's salt is only ever held in memory.
--
-- 3. `events` is partitioned by month. Analytics data is append-only and
--    queried by time range, so partitioning keeps the hot window small and
--    makes retention a matter of dropping partitions rather than deleting rows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Sites ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  domain       text,
  -- Write key: safe to embed in the tracking snippet. It can only append
  -- events, never read them. Reading requires the dashboard session.
  write_key    text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);

CREATE INDEX IF NOT EXISTS sites_write_key_idx ON sites (write_key);

-- ── Bot filtering ──────────────────────────────────────────────────────────
-- Per-site rules. `pattern` is a substring match against the user agent, so
-- "Googlebot" catches "Googlebot/2.1" and "Mozilla (compatible; Googlebot/2.1)"
-- without needing a regex dialect in the UI. `kind` is 'ua' or 'path'.
CREATE TABLE IF NOT EXISTS site_bots (
  id         bigserial PRIMARY KEY,
  site_id    uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  pattern    text NOT NULL,
  kind       text NOT NULL DEFAULT 'ua' CHECK (kind IN ('ua', 'path')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, pattern, kind)
);

CREATE INDEX IF NOT EXISTS site_bots_site_idx ON site_bots (site_id);

-- ── Events ─────────────────────────────────────────────────────────────────
-- One table for everything, because they are all "something happened at a
-- point in time on a page" and splitting them makes every query a UNION.
--
--   type = 'pageview'  | path, title, referrer
--   type = 'event'     | name (custom goal/conversion), path
--   type = 'scroll'    | depth (0-100 integer percent)
--   type = 'section'   | name (section id), duration_ms
--   type = 'vital'     | name in (lcp, cls, inp), value (numeric metric)
--   type = 'heartbeat' | value = elapsed ms on page
CREATE TABLE IF NOT EXISTS events (
  id            bigserial,
  -- ON DELETE CASCADE is load-bearing, not decoration. Without it, deleting a
  -- site leaves its entire event history in the database forever: invisible to
  -- the dashboard, still on disk, still growing. A FK check per insert costs an
  -- index lookup, which the (site_id, type, occurred_at) index below already
  -- serves — cheaper than the unbounded disk growth this prevents.
  --
  -- Note this FK lives on the partitioned parent, so Postgres enforces it once
  -- per insert regardless of which partition receives the row.
  site_id       uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  type          text NOT NULL,
  -- Daily-rotating pseudonymous visitor. See note 1.
  visitor_hash  text NOT NULL,
  -- Session id = visitor_hash + a coarser window, so heartbeats inside one
  -- sitting share a session without needing a cookie.
  session_id    text NOT NULL,
  path          text,
  title         text,
  referrer      text,
  name          text,
  value         double precision,
  -- JSONB rather than a column per field: event shapes are open by design,
  -- and the dashboard only ever queries the indexed scalar columns.
  properties    jsonb
) PARTITION BY RANGE (occurred_at);

-- Partitioned tables need an index per partition; this template is applied to
-- each new month by db/partition.sh.
CREATE INDEX IF NOT EXISTS events_occurred_idx ON events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_site_type_time_idx ON events (site_id, type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_site_path_idx ON events (site_id, path) WHERE path IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_site_name_idx ON events (site_id, name) WHERE name IS NOT NULL;

-- Seed the current month so the app is queryable before the first partition
-- run. Safe to re-run.
DO $$
DECLARE
  start_month date := date_trunc('month', now());
  end_month   date := date_trunc('month', now()) + interval '1 month';
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS events_%s PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
    to_char(start_month, 'YYYYMM'), start_month, end_month
  );
END $$;

-- ── Dashboard users ────────────────────────────────────────────────────────
-- Self-hosted means the operator is the only user, but they still need a
-- password, and it must never be the same secret as the write keys.
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  -- bcrypt/argon2 hash. The plaintext is never stored or logged.
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Which sites a user may view. Keeps multi-tenancy correct even in the
-- self-hosted case where there is one user and many sites.
CREATE TABLE IF NOT EXISTS user_sites (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, site_id)
);