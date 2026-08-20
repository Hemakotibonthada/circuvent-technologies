#!/usr/bin/env python3
"""
Back the control-plane database up to R2.

WHY THIS EXISTS

`deploy.sh` keeps five rotated archives of the *code*, and the nightly
`archive-logs.py` ships container logs off the box. Between them it looked like
the VM was backed up. It was not: an audit on 2026-08-20 found no `pg_dump`
anywhere on the host, no backup entry in cron, and nothing but logs in R2 — so
the `pgdata` volume was the only copy in existence of every user, device
registration, telemetry row and plate read. One `docker compose down -v`, or one
lost VM, and all of it was gone.

The signing code is deliberately not reimplemented here. `archive-logs.py`
already has a working SigV4 `put_object`, and a second hand-rolled copy of
request signing is a second thing to get subtly wrong and never notice until the
day it matters. This imports that one.

Usage, from the platform directory on the host:

    set -a && . ./.env.logs && set +a
    python3 scripts/backup-db.py            # dry run: dump, report, upload nothing
    python3 scripts/backup-db.py --commit   # dump, upload, rotate

Nightly, alongside the log archiver:

    37 0 * * * cd /home/ubuntu/circuvent-platform && set -a && . ./.env.logs \
      && set +a && /usr/bin/python3 scripts/backup-db.py --commit \
      >> /home/ubuntu/backup-db.out 2>&1
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
COMPOSE_DIR = os.environ.get("COMPOSE_DIR", os.path.expanduser("~/circuvent-platform"))

DB_NAME = os.environ.get("POSTGRES_DB", "circuvent")
DB_USER = os.environ.get("POSTGRES_USER", "circuvent")

# Local copies kept as a fallback for the case where R2 itself is unreachable.
# Small enough that a fortnight of them is invisible on a 45 GB disk.
KEEP_LOCAL = 14
LOCAL_DIR = os.path.expanduser("~/db-backups")

# A custom-format dump of an empty-but-valid database is still a few kilobytes
# of header. A real one is far larger. This is the floor below which we refuse
# to call it a backup — see _check_plausible.
MIN_PLAUSIBLE_BYTES = 20_000


def _load_archiver():
    """Borrow put_object from archive-logs.py, whose name is not importable."""
    path = os.path.join(HERE, "archive-logs.py")
    spec = importlib.util.spec_from_file_location("archive_logs", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def dump() -> bytes:
    """A custom-format (-Fc) dump, taken inside the postgres container.

    Custom format rather than plain SQL because it restores selectively and
    compresses itself, and because `pg_restore --clean` is a single command
    where plain SQL needs the database dropped by hand first.
    """
    cmd = [
        "docker", "compose", "exec", "-T", "postgres",
        "pg_dump", "-U", DB_USER, "-Fc", DB_NAME,
    ]
    proc = subprocess.run(cmd, cwd=COMPOSE_DIR, capture_output=True)
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", "replace").strip()
        raise SystemExit(f"pg_dump failed ({proc.returncode}): {err}")
    return proc.stdout


def _check_plausible(blob: bytes) -> None:
    """Refuse to ship something that is not a dump.

    The failure this guards against is the quiet one. `docker compose exec`
    exits 0 in situations where the payload is empty or truncated — a container
    that went away mid-stream, a disk that filled during the write. Uploading
    that produces a backup set full of files that look fine in a bucket listing
    and restore into nothing, which is discovered only during a recovery, which
    is the worst possible moment to discover it.
    """
    if not blob.startswith(b"PGDMP"):
        raise SystemExit("Refusing to upload: output is not a PostgreSQL custom-format dump.")
    if len(blob) < MIN_PLAUSIBLE_BYTES:
        raise SystemExit(
            f"Refusing to upload: dump is only {len(blob)} bytes, "
            f"below the {MIN_PLAUSIBLE_BYTES}-byte floor. The database is either "
            f"empty or the dump was truncated; neither should overwrite a good backup set."
        )


def rotate_local() -> None:
    files = sorted(
        (f for f in os.listdir(LOCAL_DIR) if f.endswith(".dump")),
        reverse=True,
    )
    for stale in files[KEEP_LOCAL:]:
        os.remove(os.path.join(LOCAL_DIR, stale))


def main() -> int:
    ap = argparse.ArgumentParser(description="Back the control-plane database up to R2.")
    ap.add_argument("--commit", action="store_true", help="Actually upload and rotate.")
    args = ap.parse_args()

    now = dt.datetime.now(dt.timezone.utc)
    stamp = now.strftime("%Y%m%d-%H%M%S")
    key = f"db/{now:%Y}/{now:%m}/{stamp}.dump"

    blob = dump()
    _check_plausible(blob)
    print(f"{DB_NAME}: {len(blob) / 1024:.1f} KB -> {key}")

    if not args.commit:
        print("(dry run — pass --commit to upload)")
        return 0

    os.makedirs(LOCAL_DIR, exist_ok=True)
    local = os.path.join(LOCAL_DIR, f"{stamp}.dump")
    with open(local, "wb") as fh:
        fh.write(blob)

    archiver = _load_archiver()
    if not archiver.ACCESS or not archiver.SECRET:
        # Worth failing on rather than warning about. A silent "local only"
        # mode is how you end up with every backup on the machine the backup
        # exists to survive.
        raise SystemExit(
            f"Kept {local}, but R2 credentials are unset — "
            f"source .env.logs before running this."
        )

    archiver.put_object(key, blob, "application/octet-stream")
    print(f"uploaded {key}")

    rotate_local()
    print(f"local copies kept: {len(os.listdir(LOCAL_DIR))} in {LOCAL_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
