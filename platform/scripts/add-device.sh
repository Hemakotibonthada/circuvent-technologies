#!/usr/bin/env bash
# Grant a provisioned device access to the MQTT broker.
# Run AFTER creating the device via the API (POST /devices/provision), using the
# same id + one-time key it returned.
#
# Usage:  ./scripts/add-device.sh <deviceId> <deviceKey>
set -e
DID="${1:?usage: add-device.sh <deviceId> <deviceKey>}"
DKEY="${2:?usage: add-device.sh <deviceId> <deviceKey>}"
VOL=circuvent-platform_mosquitto_pw
COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

sudo docker run --rm -v "$VOL":/pw eclipse-mosquitto:2 mosquitto_passwd -b /pw/passwordfile "$DID" "$DKEY"
sudo docker run --rm -v "$VOL":/pw eclipse-mosquitto:2 sh -c "chown 1883:1883 /pw/passwordfile; chmod 0700 /pw/passwordfile"
(cd "$COMPOSE_DIR" && sudo docker compose kill -s HUP mosquitto >/dev/null 2>&1)
echo "Device '$DID' can now connect to the broker. Flash it with this id + key."
