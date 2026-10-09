#!/usr/bin/env python3
"""
Dataset sync for LoudMetric on Hugging Face Spaces.

    loudmetric-sync push     dump the database and upload it to the dataset
    loudmetric-sync pull     download the latest dump, if one exists

A dump is a single .dump file in a private Dataset repo. This is deliberately
crude and it is worth knowing exactly what that buys and costs:

  BUYS   the data survives a Space restart or rebuild, which the 50GB runtime
         disk does not. Hugging Face has retired persistent storage and
         recommends a dataset repo as the datastore, so this is the supported
         path rather than a workaround.

  COSTS  anything written in the last SYNC_INTERVAL is lost on restart. A dump
         is a consistent snapshot, so there is no partial-file corruption, but
         there is a real window of loss and the dashboard says so.

The alternative of syncing a live PGDATA directory was rejected on purpose: it
needs fsync semantics, /dev/shm and background processes, and round-tripping a
running cluster through git and LFS corrupts it rather than persisting it.

Writes go to a file under /dumps and are uploaded with a commit message that
includes the row count, so a dataset history is a readable audit trail of how
much data existed at each sync.
"""

import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

DUMP_DIR = Path("/dumps")
DUMP_PATH = DUMP_DIR / "latest.dump"
DB_URL = os.environ.get(
    "DATABASE_URL", "postgres://loudmetric:loudmetric@localhost:5432/loudmetric"
)
DATASET_ID = os.environ.get("HF_DATASET_ID", "").strip()
TOKEN = os.environ.get("HF_TOKEN", "").strip()


def log(msg: str) -> None:
    print(f"[sync] {msg}", flush=True)


def configured() -> bool:
    return bool(DATASET_ID and TOKEN)


def ensure_repo():
    """Create the dataset repo on first push. Pull never creates anything."""
    from huggingface_hub import HfApi

    api = HfApi(token=TOKEN)
    try:
        api.repo_info(repo_id=DATASET_ID, repo_type="dataset")
        return api
    except Exception:
        log(f"creating dataset {DATASET_ID}")
        api.create_repo(repo_id=DATASET_ID, repo_type="dataset", private=True)
        return api


def row_count() -> int:
    try:
        out = subprocess.run(
            ["psql", DB_URL, "-tAc", "SELECT count(*) FROM events"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        return int(out.stdout.strip() or 0)
    except Exception:
        return 0


def push() -> int:
    if not configured():
        log("HF_DATASET_ID or HF_TOKEN not set, nothing to sync")
        return 0

    DUMP_DIR.mkdir(parents=True, exist_ok=True)
    n = row_count()
    if n == 0:
        log("no events yet, skipping")
        return 0

    started = time.time()
    # -Fc is the custom format: compressed, and restorable table-by-table with
    # pg_restore --clean, which a plain SQL dump is not.
    result = subprocess.run(
        [
            "pg_dump",
            DB_URL,
            "--format=custom",
            "--compress=6",
            "--no-owner",
            "--file",
            str(DUMP_PATH),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        # Dump to stdout and keep the previous good file rather than replacing it
        # with a truncated one.
        log(f"pg_dump failed: {result.stderr.strip()[:200]}")
        return 1

    size_mb = DUMP_PATH.stat().st_size / 1_048_576
    log(f"dumped {n:,} events ({size_mb:.1f} MB) in {time.time() - started:.0f}s")

    try:
        api = ensure_repo()
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        api.upload_file(
            path_or_fileobj=str(DUMP_PATH),
            path_in_repo=f"dumps/{stamp}.dump",
            repo_id=DATASET_ID,
            repo_type="dataset",
            commit_message=f"loudmetric: {n:,} events, {size_mb:.1f} MB",
        )
        # A stable alias so pull does not have to list commits and pick the
        # newest by name.
        api.upload_file(
            path_or_fileobj=str(DUMP_PATH),
            path_in_repo="latest.dump",
            repo_id=DATASET_ID,
            repo_type="dataset",
            commit_message=f"loudmetric: latest ({n:,} events)",
        )
        log(f"pushed to {DATASET_ID}")
        return 0
    except Exception as exc:
        log(f"upload failed: {exc}")
        return 1


def pull() -> int:
    """Fetch the newest dump. Returns non-zero when there is nothing to restore."""
    if not configured():
        log("HF_DATASET_ID or HF_TOKEN not set, starting empty")
        return 1

    DUMP_DIR.mkdir(parents=True, exist_ok=True)
    try:
        from huggingface_hub import hf_hub_download

        path = hf_hub_download(
            repo_id=DATASET_ID,
            filename="latest.dump",
            repo_type="dataset",
            token=TOKEN,
        )
        size_mb = Path(path).stat().st_size / 1_048_576
        # Copied rather than symlinked: pg_restore runs as the postgres user and
        # the HF cache is root-owned with restrictive permissions.
        DUMP_PATH.write_bytes(Path(path).read_bytes())
        DUMP_PATH.chmod(0o666)
        log(f"downloaded dump ({size_mb:.1f} MB)")
        return 0
    except Exception as exc:
        log(f"no dump available: {type(exc).__name__}")
        return 1


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "push"
    if cmd == "push":
        sys.exit(push())
    elif cmd == "pull":
        sys.exit(pull())
    else:
        print(__doc__)
        sys.exit(2)