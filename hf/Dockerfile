# LoudMetric on Hugging Face Spaces.
#
# Two processes in one container: Postgres and the Next.js app. Spaces passes
# `--port 7860`, so the app listens there while Postgres stays on a unix socket
# inside the container.
#
# Persistence is a `pg_dump` in a Dataset repo, not a live PGDATA copy. The
# runtime disk is ephemeral and Hugging Face has retired persistent storage, so a
# dump on a schedule is the supported way to keep data. It also happens to be the
# only safe option: PGDATA needs fsync semantics, /dev/shm and background
# processes, and round-tripping a live cluster through git and LFS corrupts it.
#
# The honest cost of this, stated in the UI as well as here: anything written in
# the last SYNC_INTERVAL minutes is lost if the Space restarts. It is a demo and
# a collector, not a production database.

FROM node:22-bookworm-slim

# postgresql-15 for the server; postgresql-client-15 for pg_dump/pg_restore, which
# run on a different schedule than the server itself.
RUN apt-get update && apt-get install -y --no-install-recommends \
      postgresql-15 postgresql-client-15 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PGDATA=/var/lib/postgresql/data \
    DATABASE_URL=postgres://loudmetric:loudmetric@localhost:5432/loudmetric \
    PORT=7860 \
    HOSTNAME=0.0.0.0 \
    SYNC_INTERVAL=900 \
    HF_DATASET_ID=""

WORKDIR /app

# Python is only here for huggingface_hub, which drives the dataset sync.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages "huggingface_hub>=0.24"

# Dependencies first, so a source-only change does not reinstall the world.
#
# Full install, not --omit=dev: `next build` needs typescript and the standalone
# finalize step runs a script through node, and db/seed.ts needs tsx. Installing
# only runtime deps and then building was the first version of this file, and it
# fails at the build step with a missing-compiler error.
COPY package.json package-lock.json* ./
RUN npm ci --registry=https://registry.npmjs.org/

COPY . .
RUN npm run build
# Only now is it safe to drop the toolchain.
RUN npm prune --omit=dev

# Postgres refuses to run as root, so it gets its own account with its own
# home. The app still runs as root, which is not great practice but matches what
# Spaces expects when the container must bind 7860.
RUN useradd -m -s /bin/bash postgres || true \
    && mkdir -p /var/lib/postgresql/data /var/run/postgresql /dumps \
    && chown -R postgres:postgres /var/lib/postgresql /var/run/postgresql \
    && chmod 777 /dumps

COPY hf/entrypoint.sh /usr/local/bin/loudmetric-entrypoint
COPY hf/sync.py /usr/local/bin/loudmetric-sync
RUN chmod +x /usr/local/bin/loudmetric-entrypoint /usr/local/bin/loudmetric-sync

EXPOSE 7860

# Spaces supplies these; the sync is a no-op without them, which keeps the image
# buildable and testable locally with no Hugging Face account at all.
ARG HF_TOKEN=""
ARG HF_DATASET_ID=""
ENV HF_TOKEN=$HF_TOKEN HF_DATASET_ID=$HF_DATASET_ID

HEALTHCHECK --interval=60s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -fsS http://localhost:7860/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/loudmetric-entrypoint"]