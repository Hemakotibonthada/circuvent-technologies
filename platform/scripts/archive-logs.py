#!/usr/bin/env python3
"""
Ships the control plane's container logs to object storage before Docker
rotates them away.

    archive-logs.py            # yesterday, dry run
    archive-logs.py --commit
    archive-logs.py --since 6h --commit

WHY THIS EXISTS

`docker-compose.yml` caps the json-file driver at 10 MB x 5 per service, and
that cap is load-bearing: without it the logs fill a 45 GB disk, Postgres stops
accepting writes and the broker stops persisting — an outage caused entirely by
bookkeeping. But a cap is not retention. It means the logs are *discarded*, and
at the API's volume that is a few days of history.

So the moment anybody asks a question that needs last month — why did that gate
open, when did this device start failing its OTA, what did the broker do the
night everything went quiet — the answer is gone. This is the other half of the
rotation policy: keep the disk bounded AND keep the history, by moving it
somewhere that is neither.

WHY PYTHON AND NOT THE CONTROL PLANE ITSELF

The API container cannot read other containers' logs, and the whole point is to
capture Postgres, Mosquitto and Caddy as well as the API. That makes this a host
job. The host has python3, openssl and curl and no Node, so this is stdlib-only
Python: no pip install, nothing to keep up to date, and no dependency that can
break the one job that runs when something has already gone wrong.

WHY THE BUCKET IS PRIVATE

These logs carry IP addresses, account emails, device ids and command payloads.
`circuvent-firmware` is public because an ESP32 doing an OTA check cannot sign a
request; this is the opposite case, and it is a separate bucket for exactly that
reason.
"""

import argparse
import datetime as dt
import gzip
import hashlib
import hmac
import os
import subprocess
import sys
import urllib.request
import urllib.error

BUCKET = os.environ.get("LOG_BUCKET", "circuvent-logs")
ACCOUNT = os.environ.get("R2_ACCOUNT_ID", "")
ACCESS = os.environ.get("S3_ACCESS_KEY_ID", "")
SECRET = os.environ.get("S3_SECRET_ACCESS_KEY", "")
REGION = os.environ.get("S3_REGION", "auto")
ENDPOINT = os.environ.get("S3_ENDPOINT", "").rstrip("/") or (
    "https://%s.r2.cloudflarestorage.com" % ACCOUNT if ACCOUNT else ""
)

COMPOSE_DIR = os.environ.get("COMPOSE_DIR", os.path.expanduser("~/circuvent-platform"))
SERVICES = ["api", "postgres", "mosquitto", "caddy"]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def put_object(key: str, body: bytes, content_type: str) -> None:
    """SigV4, header form, path-style — the shape R2 wants."""
    host = ENDPOINT.split("://", 1)[1]
    path = "/%s/%s" % (BUCKET, key)
    now = dt.datetime.now(dt.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    stamp = now.strftime("%Y%m%d")
    payload_hash = sha256(body)

    headers = {
        "host": host,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
        "content-type": content_type,
    }
    names = sorted(headers)
    canonical_headers = "".join("%s:%s\n" % (n, headers[n].strip()) for n in names)
    signed_headers = ";".join(names)
    canonical_request = "\n".join(
        ["PUT", path, "", canonical_headers, signed_headers, payload_hash]
    )

    scope = "%s/%s/s3/aws4_request" % (stamp, REGION)
    string_to_sign = "\n".join(
        ["AWS4-HMAC-SHA256", amz_date, scope, sha256(canonical_request.encode())]
    )
    k = sign(("AWS4" + SECRET).encode(), stamp)
    k = sign(k, REGION)
    k = sign(k, "s3")
    k = sign(k, "aws4_request")
    signature = hmac.new(k, string_to_sign.encode(), hashlib.sha256).hexdigest()

    headers["Authorization"] = (
        "AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s"
        % (ACCESS, scope, signed_headers, signature)
    )

    req = urllib.request.Request(ENDPOINT + path, data=body, method="PUT", headers=headers)
    with urllib.request.urlopen(req, timeout=120) as res:
        if res.status >= 300:
            raise RuntimeError("PUT %s -> %s" % (key, res.status))


def container_log(service: str, since: str, until: str = None) -> bytes:
    """
    Reads one service's log for a window.

    stderr is folded in because that is where the interesting half lives: pino
    writes to stdout, but a stack trace from a crashing process, Postgres's
    startup complaints and Caddy's certificate errors all arrive on stderr, and
    an archive missing them is an archive of the days nothing went wrong.
    """
    cmd = ["sudo", "docker", "compose", "logs", "--no-color", "--timestamps", "--since", since]
    if until:
        cmd += ["--until", until]
    cmd.append(service)
    out = subprocess.run(
        cmd, cwd=COMPOSE_DIR, capture_output=True, timeout=300
    )
    return out.stdout + out.stderr


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="actually upload")
    ap.add_argument(
        "--since",
        default=None,
        help="docker --since value; defaults to yesterday 00:00 UTC",
    )
    args = ap.parse_args()

    if not (ACCOUNT or ENDPOINT) or not ACCESS or not SECRET:
        print("Set R2_ACCOUNT_ID, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.", file=sys.stderr)
        return 1

    if args.since:
        since, until, label = args.since, None, dt.datetime.now(dt.timezone.utc)
    else:
        # Yesterday, whole day, in UTC. Run from cron after midnight.
        today = dt.datetime.now(dt.timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        yesterday = today - dt.timedelta(days=1)
        since = yesterday.strftime("%Y-%m-%dT%H:%M:%SZ")
        until = today.strftime("%Y-%m-%dT%H:%M:%SZ")
        label = yesterday

    total = 0
    for service in SERVICES:
        try:
            raw = container_log(service, since, until)
        except Exception as err:  # a missing service must not stop the others
            print("  %-10s read failed: %s" % (service, err))
            continue

        if not raw.strip():
            print("  %-10s nothing to archive" % service)
            continue

        body = gzip.compress(raw, 6)
        key = "logs/%s/%s/%s.log.gz" % (
            service,
            label.strftime("%Y/%m"),
            label.strftime("%d") if not args.since else label.strftime("%dT%H%M%SZ"),
        )
        total += len(body)
        print(
            "  %-10s %8.1f KB raw -> %7.1f KB gz  %s"
            % (service, len(raw) / 1024, len(body) / 1024, key)
        )
        if args.commit:
            try:
                put_object(key, body, "application/gzip")
                print("             uploaded")
            except Exception as err:
                print("             FAILED: %s" % err, file=sys.stderr)
                return 1

    print("\n%s%.1f KB total" % ("" if args.commit else "DRY RUN — ", total / 1024))
    if not args.commit:
        print("pass --commit to upload")
    return 0


if __name__ == "__main__":
    sys.exit(main())
