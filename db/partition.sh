#!/bin/sh
# Create this month's partition and drop partitions older than $KEEP_MONTHS.
#
# Run from cron once a month. A new partition must exist before the month
# begins, or inserts into `events` fail — there is no default partition, which
# is deliberate: silently discarding data is worse than a loud error.
set -e
KEEP_MONTHS="${KEEP_MONTHS:-12}"
NEXT_MONTH=$(date -u -d "$(date -u +%Y-%m-01) +1 month" +%Y%m 2>/dev/null || date -u -v+1m +%Y%m)
THIS_MONTH=$(date -u +%Y%m)

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
CREATE TABLE IF NOT EXISTS events_${NEXT_MONTH}
  PARTITION OF events FOR VALUES FROM (
    DATE '$(date -u -d "$(date -u +%Y-%m-01) +1 month" +%Y-%m-01 2>/dev/null || date -u -v+1m +%Y-%m-01)'
  ) TO (
    DATE '$(date -u -d "$(date -u +%Y-%m-01) +2 month" +%Y-%m-01 2>/dev/null || date -u -v+2m +%Y-%m-01)'
  );
CREATE INDEX IF NOT EXISTS events_${NEXT_MONTH}_occurred_idx ON events_${NEXT_MONTH} (occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_${NEXT_MONTH}_site_type_time_idx ON events_${NEXT_MONTH} (site_id, type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_${NEXT_MONTH}_site_path_idx ON events_${NEXT_MONTH} (site_id, path) WHERE path IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_${NEXT_MONTH}_site_name_idx ON events_${NEXT_MONTH} (site_id, name) WHERE name IS NOT NULL;
SQL

# Drop old partitions. Detach + drop is instant; retention is a partition drop,
# not a row-by-row delete.
CUTOFF=$(date -u -d "${KEEP_MONTHS} months ago" +%Y%m 2>/dev/null || date -u -v-${KEEP_MONTHS}m +%Y%m)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
  DO \$\$
  DECLARE p record;
  BEGIN
    FOR p IN SELECT c.relname FROM pg_class c
             JOIN pg_inherits i ON i.inhrelid = c.oid
             JOIN pg_class t ON t.oid = i.inhparent
             WHERE t.relname = 'events' LOOP
      IF substring(p.relname from '[0-9]{6}\$')::int < ${CUTOFF}::int THEN
        EXECUTE format('DROP TABLE IF EXISTS %I', p.relname);
      END IF;
    END LOOP;
  END \$\$;"
echo "partition $NEXT_MONTH ready; retained from ${CUTOFF}"
