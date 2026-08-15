/**
 * How the broker's TLS certificate is presented, on the phone.
 *
 * WHY THIS IS A SECOND COPY
 *
 * The console has the same logic in
 * src/app/smarthome/admin/_lib/broker-cert.ts. The app is a separate TypeScript
 * project and Metro will not resolve imports above the app root, so the rule
 * genuinely has to exist twice — the same constraint that produced two copies
 * of the tank-link freshness rule and of session expiry.
 *
 * Duplication is only safe when it is pinned: tests/broker-cert-app-parity.test.ts
 * runs both copies over the same certificates and fails the build if they
 * disagree. Without it the phone and the console would eventually differ about
 * whether a renewal is due, and only one of them could be right.
 *
 * WHAT THIS IS FOR
 *
 * Every device verifies this certificate on connect. When it lapses the whole
 * fleet fails the handshake at once, on a date that was knowable years ahead.
 * Renewal is cheap and needs no OTA — devices trust the CA, not this
 * certificate — so the only thing that actually goes wrong is nobody noticing
 * in time.
 */

import type { BrokerCertInfo } from "./api";

export type BrokerCertLevel = "expired" | "expiring" | "ok" | "unknown";

export interface BrokerCertView {
  level: BrokerCertLevel;
  /** Terse value for a status row: "412 days", "expired", "not checked". */
  detail: string;
  /** One actionable sentence, or null when there is nothing to say. */
  advice: string | null;
  /** Whether this is worth interrupting an operator with. */
  urgent: boolean;
}

/**
 * `expiringSoon` comes from the server; only "expired" is derived here.
 *
 * The 60-day threshold lives in platform/api/src/broker-cert.ts. Re-deriving it
 * would create a third copy that drifts from the one /admin/health reports.
 * The server's flag stays true once the date passes, though, so without the
 * local expired check a lapsed certificate would be described as a warning
 * about the future for a fleet that is already off the air.
 */
export function describeBrokerCert(cert: BrokerCertInfo | null | undefined): BrokerCertView {
  if (!cert) {
    // Not "fine". The value of this check is being believed when it says
    // nothing is wrong, and an unreachable broker must not read as healthy.
    return {
      level: "unknown",
      detail: "not checked",
      advice: "The API could not read the broker's certificate, so its expiry is unknown.",
      urgent: false,
    };
  }

  const days = cert.daysRemaining;

  if (days <= 0) {
    return {
      level: "expired",
      detail: "expired",
      advice:
        "The broker certificate has expired — devices cannot complete the TLS handshake. Run platform/scripts/renew-server-cert.sh on the VM.",
      urgent: true,
    };
  }

  if (cert.expiringSoon) {
    return {
      level: "expiring",
      detail: `${days} day${days === 1 ? "" : "s"}`,
      advice: `The broker certificate expires in ${days} day${days === 1 ? "" : "s"}. Renew it with platform/scripts/renew-server-cert.sh — no firmware update is needed.`,
      urgent: true,
    };
  }

  return { level: "ok", detail: `${days} days`, advice: null, urgent: false };
}
