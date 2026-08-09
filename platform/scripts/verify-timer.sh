#!/usr/bin/env bash
# End-to-end proof that a stored switch timer now reaches the device.
#
# Creates a temporary automation carrying the EXACT broken payload found in the
# database — {"power2": true} with no action — schedules it two minutes out, and
# reads back what the control plane actually published.
#
# The published payload comes from the `commands` table rather than an MQTT
# subscription: runOne() writes that row from the same variable it hands to
# publishCommand, so it *is* the payload, and it needs no broker credentials.
#
# The value matches the relay's current state, so nothing in the house changes.
set -euo pipefail
cd ~/circuvent-platform

DEV="home-hub-978dde59"
q() { docker compose exec -T postgres psql -U circuvent -d circuvent -A -t -q -F'|' -c "$1"; }

q "DELETE FROM automations WHERE name = 'ZZ temp verification';" >/dev/null 2>&1 || true

OWNER=$(q "SELECT owner_id FROM automations WHERE id=9;" | tr -d '[:space:]')
BEFORE=$(q "SELECT coalesce(max(id),0) FROM commands WHERE device_id='$DEV';" | tr -d '[:space:]')
AT=$(TZ=Asia/Kolkata date -d '+2 minutes' +%H:%M)
echo "owner=$OWNER  latest command id before=$BEFORE"
echo "scheduling for $AT IST (now $(TZ=Asia/Kolkata date +%H:%M:%S))"

q "INSERT INTO automations (owner_id,name,enabled,trigger,action)
   VALUES ($OWNER,'ZZ temp verification',true,
           '{\"type\":\"time\",\"at\":\"$AT\"}'::jsonb,
           '{\"type\":\"command\",\"deviceId\":\"$DEV\",\"command\":{\"power2\":true}}'::jsonb);" >/dev/null
ID=$(q "SELECT id FROM automations WHERE name='ZZ temp verification';" | tr -d '[:space:]')
echo "temp rule id=$ID stored with the legacy payload {\"power2\":true}"

echo "--- waiting for the tick ---"
for i in $(seq 1 30); do
  sleep 10
  RAN=$(q "SELECT coalesce(last_run_at::text,'') FROM automations WHERE id=$ID;" | tr -d '[:space:]')
  if [ -n "$RAN" ]; then echo "fired after ~$((i*10))s"; break; fi
done

echo
echo "=== WHAT WAS ACTUALLY PUBLISHED TO THE DEVICE ==="
q "SELECT payload::text FROM commands WHERE device_id='$DEV' AND id > $BEFORE ORDER BY id;"

echo
echo "=== RUN RECORD ==="
q "SELECT 'last_run_at=' || coalesce(last_run_at::text,'never') || '  ok=' || coalesce(last_run_ok::text,'?') || '  error=' || coalesce(last_error,'-') || '  runs=' || run_count FROM automations WHERE id=$ID;"

echo
echo "=== REPAIR LOG ==="
docker compose logs --since=5m api 2>/dev/null | grep -o 'automation command repaired[^"]*' | tail -2 || true

echo
echo "=== DEVICE STATE AFTER ==="
q "SELECT 'power2=' || coalesce(state->>'power2','?') || '  online=' || online::text || '  seen=' || last_seen::text FROM devices WHERE id='$DEV';"

q "DELETE FROM automations WHERE id=$ID;" >/dev/null
echo
echo "temp rule $ID deleted"
