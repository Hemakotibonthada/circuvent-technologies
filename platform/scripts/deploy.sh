#!/usr/bin/env bash
#
# Deploy the control plane.
#
# WHY THIS EXISTS
#
# The image can be stamped with its commit and build time, and /health reports
# them so a stale container identifies itself instead of looking like a broken
# camera. That mechanism worked and was still useless, because it depended on
# whoever deployed remembering two environment variables:
#
#   BUILD_COMMIT=$(git rev-parse --short HEAD) BUILD_TIME=... docker compose up
#
# The very next deploy forgot them, and /health went back to saying "unknown" —
# losing exactly the answer it was built to give. A fact that has to be
# remembered at 2am is a fact that will be wrong at 2am.
#
# So the stamp is computed here, and deploying is one command with no arguments
# to get wrong.
#
# Usage, from the platform directory on the host:
#   ./scripts/deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

# The commit, if this is a checkout. A copied tree has no git history, which is
# normal on a host that is deployed to by upload — record what we can rather
# than refusing to deploy over it.
if git rev-parse --short HEAD >/dev/null 2>&1; then
  COMMIT="$(git rev-parse --short HEAD)"
  # A dirty tree is worth knowing about: "which commit is running" has a
  # different answer when the answer is "that commit plus some edits".
  if ! git diff --quiet HEAD 2>/dev/null; then
    COMMIT="${COMMIT}+dirty"
  fi
else
  COMMIT="${BUILD_COMMIT:-copied}"
fi

BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Deploying ${COMMIT} at ${BUILD_TIME}"

BUILD_COMMIT="$COMMIT" BUILD_TIME="$BUILD_TIME" docker compose up -d --build

# Wait for it, rather than declaring success at the moment the container was
# asked to start. A deploy that reports "done" while the API is still failing
# its healthcheck is how a broken build gets left running overnight.
#
# Read from the container's own healthcheck rather than curling a port. The api
# service exposes 8080 to the compose network and does not publish it — only
# Caddy is on the host — so the obvious `curl 127.0.0.1:8080/health` can never
# connect and reports every successful deploy as a failure. The first version
# of this script did exactly that, on its first run, which is a fitting way for
# a script about verifying deploys to fail.
echo -n "Waiting for the API to report healthy"
for _ in $(seq 1 40); do
  status="$(docker inspect --format '{{.State.Health.Status}}' \
    "$(docker compose ps -q api)" 2>/dev/null || echo starting)"
  case "$status" in
    healthy)
      echo
      # Printed from inside the container, for the same reason.
      docker compose exec -T api node -e \
        "fetch('http://127.0.0.1:8080/health').then(r=>r.text()).then(t=>console.log(t))" \
        2>/dev/null || true
      echo "Deployed ${COMMIT}."
      exit 0
      ;;
    unhealthy)
      echo
      echo "The API started and is failing its healthcheck. Recent logs:" >&2
      docker compose logs --tail=40 api >&2
      exit 1
      ;;
  esac
  echo -n .
  sleep 2
done

echo
echo "The API did not become healthy within 80s. Recent logs:" >&2
docker compose logs --tail=40 api >&2
exit 1
