import tls from "node:tls";
import { config } from "./config";
import { logger } from "./logger";

/**
 * Broker TLS certificate expiry.
 *
 * The server certificate is issued for 825 days. When it lapses, every device
 * in the field fails the handshake and the whole fleet drops off — an outage
 * whose date is knowable years ahead, which is exactly the kind that gets
 * forgotten. Surfacing it in /admin/health puts it somewhere an operator
 * actually looks.
 *
 * Renewal itself is cheap: devices trust the CA, not this certificate, so a new
 * one signed by the same CA needs no firmware change. See
 * platform/scripts/renew-server-cert.sh.
 */

export interface BrokerCertInfo {
  subject: string;
  issuer: string;
  validTo: string;
  daysRemaining: number;
  /** True once it is close enough that renewal should be scheduled. */
  expiringSoon: boolean;
}

export const WARN_WITHIN_DAYS = 60;

const TIMEOUT_MS = 5000;

/** Host the broker serves TLS on, derived from the MQTT URL the API already uses. */
function brokerHost(): string {
  try {
    return new URL(config.MQTT_URL).hostname || "mosquitto";
  } catch {
    return "mosquitto";
  }
}

/**
 * Reads the certificate the broker presents.
 *
 * `rejectUnauthorized` is false on purpose: the API container does not mount
 * ca.crt, and this connection authenticates nothing — it opens a socket purely
 * to read the presented certificate's dates and closes it. Devices still verify
 * the chain properly; this is an inspection, not a trust decision.
 */
export function readBrokerCertificate(host = brokerHost(), port = 8883): Promise<BrokerCertInfo | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: BrokerCertInfo | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    let socket: tls.TLSSocket;
    try {
      socket = tls.connect({ host, port, rejectUnauthorized: false, servername: host, timeout: TIMEOUT_MS });
    } catch {
      done(null);
      return;
    }

    socket.once("secureConnect", () => {
      try {
        const cert = socket.getPeerCertificate();
        if (!cert || !cert.valid_to) {
          done(null);
        } else {
          const validTo = new Date(cert.valid_to);
          const days = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);
          // Node types CN as string | string[] because a DN may repeat an
          // attribute; take the first when it does.
          const cn = (v: string | string[] | undefined): string =>
            Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
          done({
            subject: cn(cert.subject?.CN),
            issuer: cn(cert.issuer?.CN),
            validTo: validTo.toISOString(),
            daysRemaining: days,
            expiringSoon: days <= WARN_WITHIN_DAYS,
          });
        }
      } catch {
        done(null);
      } finally {
        socket.destroy();
      }
    });

    socket.once("timeout", () => {
      socket.destroy();
      done(null);
    });
    socket.once("error", (err) => {
      logger.debug({ err, host, port }, "could not read broker certificate");
      socket.destroy();
      done(null);
    });
  });
}
