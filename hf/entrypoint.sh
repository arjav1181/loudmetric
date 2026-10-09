#!/usr/bin/env bash
# Boot LoudMetric inside a Hugging Face Space.
#
# Order matters here and each step is a dependency of the next:
#   1. Postgres must be running before anything can restore or migrate.
#   2. The dump must be restored BEFORE the schema is applied, or the schema
#      would be created empty and pg_restore would then collide with it.
#   3. The app starts last, and the sync loop starts only after the app is up, so
#      a failed sync can never take down ingest.
set -euo pipefail

log() { echo "[loudmetric] $*"; }

log "starting postgres"
su postgres -c "/usr/lib/postgresql/15/bin/pg_ctl -D '$PGDATA' -l /tmp/pg.log -o '-p 5432 -k /var/run/postgresql -c listen_addresses=localhost' -w start" \
  || {
    log "no cluster found, initialising one"
    su postgres -c "/usr/lib/postgresql/15/bin/initdb -D '$PGDATA' -U loudmetric --auth=trust --auth-host=trust --auth-local=trust"
    su postgres -c "/usr/lib/postgresql/15/bin/pg_ctl -D '$PGDATA' -l /tmp/pg.log -o '-p 5432 -k /var/run/postgresql -c listen_addresses=localhost' -w start"
  }

# Replicas and Spaces share a clock; give the clockcheck a moment before
# trusting a WAL timestamp we might otherwise replay incorrectly.
sleep 2

psql_ready() { su postgres -c "psql -h localhost -p 5432 -U loudmetric -d loudmetric -tAc 'SELECT 1'" >/dev/null 2>&1; }

if ! psql_ready; then
  log "creating database"
  su postgres -c "psql -h localhost -p 5432 -U loudmetric -d postgres -c 'CREATE DATABASE loudmetric'" || true
fi

# ── Restore from the dataset ─────────────────────────────────────────────────
# Only if HF_DATASET_ID is set and a dump is actually present. With neither, the
# Space boots empty, which is the correct behaviour for a first run.
if [ -n "${HF_DATASET_ID:-}" ] && [ -n "${HF_TOKEN:-}" ]; then
  log "looking for a saved dump in $HF_DATASET_ID"
  if loudmetric-sync pull; then
    log "restoring dump"
    # --clean --if-exists so a restore over a partially initialised database is
    # idempotent rather than erroring halfway through.
    if su postgres -c "pg_restore -h localhost -p 5432 -U loudmetric -d loudmetric --clean --if-exists --no-owner /dumps/latest.dump" 2>/tmp/restore.err; then
      log "restore complete"
    else
      log "restore reported errors (continuing):"
      head -20 /tmp/restore.err | while read -r line; do log "  $line"; done
    fi
  else
    log "no dump found, starting empty"
  fi
fi

# Schema and partitions are applied on every boot, not just the first. They are
# both idempotent, and it means a Space redeploy picks up a schema change without
# anyone having to remember to migrate.
log "applying schema"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f /app/db/schema.sql 2>&1 | grep -v "already exists, skipping" || true
log "ensuring partitions"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f /app/db/partition.sql 2>&1 | grep -v NOTICE || true

# ── App ──────────────────────────────────────────────────────────────────────
log "starting app on :$PORT"
node /app/.next/standalone/server.js &
APP_PID=$!

# ── Sync loop ────────────────────────────────────────────────────────────────
# Runs in the background and never kills the app. If the Space is restarted, at
# most SYNC_INTERVAL seconds of events are lost, and that limit is surfaced in
# the dashboard rather than hidden.
(
  sleep 60
  while true; do
    loudmetric-sync push || log "sync failed (will retry)"
    sleep "${SYNC_INTERVAL}"
  done
) &
SYNC_PID=$!

shutdown() {
  log "shutting down"
  # One last push, so a deliberate restart does not throw away the interval's
  # worth of data. Best effort: never block shutdown on a network call.
  loudmetric-sync push || true
  kill "$APP_PID" "$SYNC_PID" 2>/dev/null || true
  su postgres -c "/usr/lib/postgresql/15/bin/pg_ctl -D '$PGDATA' -m fast stop" || true
  exit 0
}
trap shutdown SIGTERM SIGINT

wait "$APP_PID"