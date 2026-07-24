#!/usr/bin/env bash
# Measure real control-plane latency components.
BASE=https://api.circuvent.com
cd ~/circuvent-platform || exit 1
R=$(date +%s)
TOKEN=$(curl -s -X POST $BASE/auth/register -H 'Content-Type: application/json' -d "{\"name\":\"L\",\"email\":\"lat_${R}@example.com\",\"password\":\"secret123\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
DEV="lat-dev-${R}"
K=$(curl -s -X POST $BASE/devices/provision -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"id\":\"$DEV\",\"type\":\"smart-plug\",\"name\":\"L\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("key",""))')
curl -s -X POST $BASE/devices/claim -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"id\":\"$DEV\",\"key\":\"$K\"}" >/dev/null

echo "== /health round-trip from the VM (near-loopback via Caddy), 3x =="
for i in 1 2 3; do curl -s -o /dev/null -w "   %{time_total}s\n" $BASE/health; done

echo "== POST /command round-trip = auth + DB insert + MQTT publish, 5x =="
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "   %{time_total}s\n" -X POST $BASE/devices/$DEV/command -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"action":"set","power":true}'
done

echo "== broker delivery latency (publish -> subscriber receives), in-broker =="
MU=$(docker compose exec -T api printenv MQTT_USERNAME | tr -d '\r')
MP=$(docker compose exec -T api printenv MQTT_PASSWORD | tr -d '\r')
docker compose exec -T mosquitto sh -lc "
  U='$MU'; P='$MP';
  for n in 1 2 3; do
    ( mosquitto_sub -h localhost -p 1883 -u \"\$U\" -P \"\$P\" -t bench/x -C 1 >/dev/null; date +%s%3N >/tmp/r ) &
    sleep 0.4
    date +%s%3N >/tmp/s
    mosquitto_pub -h localhost -p 1883 -u \"\$U\" -P \"\$P\" -t bench/x -m hi
    wait
    echo \"   pub->sub: \$(( \$(cat /tmp/r) - \$(cat /tmp/s) )) ms\"
  done
"
curl -s -X DELETE $BASE/devices/$DEV -H "Authorization: Bearer $TOKEN" >/dev/null
echo "done"
