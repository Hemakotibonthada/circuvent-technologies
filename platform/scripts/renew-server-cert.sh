#!/usr/bin/env bash
# Renew the broker's TLS server certificate, reusing the existing CA.
#
# WHY THIS EXISTS
# The server certificate is issued for 825 days. When it expires, every device
# in the field fails the TLS handshake and the whole fleet goes offline on a
# date that is knowable years in advance. gen-certs.sh cannot help: it exits
# early when certs are present, so re-running it renews nothing.
#
# WHY THIS IS SAFE
# Devices trust the CA (10 years), not this certificate. A new server cert
# signed by the SAME CA is accepted with no firmware change and no OTA. That is
# the entire point of having a CA, and it is why renewal is cheap while a CA
# rollover is not.
#
# WHAT THIS DELIBERATELY DOES NOT DO
# It never touches ca.crt or ca.key. Replacing the CA invalidates the copy
# embedded in every device, which needs an OTA pushed BEFORE the old CA expires
# — a months-long operation, not a maintenance task.
#
# Usage:  ./renew-server-cert.sh [public-ip]
#   e.g.  ./renew-server-cert.sh 140.245.238.154
#
# Afterwards, restart the broker so it loads the new file:
#   docker compose restart mosquitto
set -euo pipefail

CERTDIR="$(cd "$(dirname "$0")/.." && pwd)/mosquitto/certs"
IP="${1:-}"
DAYS=825

cd "$CERTDIR"

if [ ! -f ca.crt ] || [ ! -f ca.key ]; then
  echo "ERROR: no CA in $CERTDIR. Run gen-certs.sh first." >&2
  echo "       Do NOT generate a new CA to fix this — every device in the" >&2
  echo "       field trusts the original one." >&2
  exit 1
fi

echo "Current server certificate:"
if [ -f server.crt ]; then
  openssl x509 -in server.crt -noout -subject -enddate
else
  echo "  (none — issuing a first one)"
fi

# Keep the old pair until the new one is written, so a failure part-way through
# leaves the broker with something it can still serve.
STAMP="$(date +%Y%m%d%H%M%S)"
[ -f server.crt ] && cp server.crt "server.crt.$STAMP.bak"
[ -f server.key ] && cp server.key "server.key.$STAMP.bak"

echo
echo "Issuing a new server certificate from the existing CA..."
openssl genrsa -out server.key.new 2048
openssl req -new -key server.key.new \
  -subj "/O=Circuvent Technologies/CN=mqtt.circuvent.com" -out server.csr

SAN="DNS:mqtt.circuvent.com,DNS:localhost"
[ -n "$IP" ] && SAN="$SAN,IP:$IP"
printf 'subjectAltName=%s\n' "$SAN" > san.cnf

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days "$DAYS" -sha256 -extfile san.cnf -out server.crt.new

# Prove the new certificate actually chains to the CA the devices trust before
# putting it in place. A cert that does not verify would take the fleet down
# just as surely as an expired one.
if ! openssl verify -CAfile ca.crt server.crt.new >/dev/null 2>&1; then
  echo "ERROR: the new certificate does not verify against ca.crt. Nothing changed." >&2
  rm -f server.crt.new server.key.new server.csr san.cnf
  exit 1
fi

mv server.crt.new server.crt
mv server.key.new server.key
rm -f server.csr san.cnf

chmod 644 ca.crt server.crt
chmod 640 server.key ca.key
sudo chown -R 1883:1883 "$CERTDIR" 2>/dev/null || true

echo
echo "New server certificate:"
openssl x509 -in server.crt -noout -subject -enddate
echo
echo "The CA was not touched, so no firmware change is needed:"
openssl x509 -in ca.crt -noout -subject -enddate
echo
echo "Now restart the broker so it picks this up:"
echo "  docker compose restart mosquitto"
echo
echo "Previous files kept as *.$STAMP.bak — delete them once devices reconnect."
