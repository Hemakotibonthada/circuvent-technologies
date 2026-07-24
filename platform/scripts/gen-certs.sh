#!/usr/bin/env bash
# Generate Circuvent's own CA + broker server certificate (fully self-owned TLS).
# The CA cert (ca.crt) is public and gets embedded in device firmware; the CA
# key stays on this VM only. Re-running is a no-op if certs already exist.
#
# Usage:  ./gen-certs.sh <public-ip-or-blank>
#   e.g.  ./gen-certs.sh 140.245.238.154
set -e
CERTDIR="$(cd "$(dirname "$0")/.." && pwd)/mosquitto/certs"
IP="${1:-}"
mkdir -p "$CERTDIR"; cd "$CERTDIR"

if [ -f ca.crt ] && [ -f server.crt ]; then
  echo "certs already exist in $CERTDIR — leaving them in place."
  exit 0
fi

echo "Generating CA..."
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -subj "/O=Circuvent Technologies/CN=Circuvent Device CA" -out ca.crt

echo "Generating broker server certificate..."
openssl genrsa -out server.key 2048
openssl req -new -key server.key -subj "/O=Circuvent Technologies/CN=mqtt.circuvent.com" -out server.csr

SAN="DNS:mqtt.circuvent.com,DNS:localhost"
[ -n "$IP" ] && SAN="$SAN,IP:$IP"
printf 'subjectAltName=%s\n' "$SAN" > san.cnf

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days 825 -sha256 -extfile san.cnf -out server.crt
rm -f server.csr san.cnf

# Mosquitto runs as uid 1883 inside the container; make the files readable to it.
chmod 644 ca.crt server.crt
chmod 640 server.key ca.key
sudo chown -R 1883:1883 "$CERTDIR" 2>/dev/null || true

echo "Done. Files in $CERTDIR:"
ls -l
echo
echo "===== ca.crt (embed this in firmware) ====="
cat ca.crt
