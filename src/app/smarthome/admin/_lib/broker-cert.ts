/**
 * How the broker's TLS certificate is presented to an operator.
 *
 * WHY THIS IS ITS OWN FILE
 *
 * Two surfaces show this — the overview's "Platform health" panel and the
 * platform page's health tab — and a third (a banner) decides whether to
 * interrupt. Three independent readings of the same four fields is exactly the
 * shape of bug this codebase keeps finding: one surface says "fine", another
 * says "renew now", and nothing errors. So the judgement lives here once, as a
 * pure function, and the surfaces only render what it returns.
 *
 * WHY IT MATTERS MORE THAN THE OTHER HEALTH ROWS
 *
 * MQTT down and database down are outages you already know about — something
 * is broken now and somebody is looking. This one is the opposite: everything
 * is healthy right up to a date that was knowable years in advance, and then
 * every device in the field fails the TLS handshake at once. Renewal is cheap
 * and needs no OTA, because devices trust the CA rather than this certificate
 * (platform/scripts/renew-server-cert.sh). The only hard part is remembering,
 * which is why the number belongs on a page an operator already opens.
 */

import type { BrokerCertInfo } from "@/lib/control-plane";
import type { Tone } from "../_ui";

export type BrokerCertLevel = "expired" | "expiring" | "ok" | "unknown";

export interface BrokerCertView {
  level: BrokerCertLevel;
  tone: Tone;
  /** Terse value for a status row: "412 days", "expired", "not checked". */
  detail: string;
  /** One actionable sentence, or null when there is nothing to say. */
  advice: string | null;
  /** Whether this is worth interrupting an operator with a banner. */
  urgent: boolean;
}

/**
 * `expiringSoon` is read from the server rather than re-derived here.
 *
 * The 60-day threshold lives in `platform/api/src/broker-cert.ts` as
 * `WARN_WITHIN_DAYS`. Re-deriving it in the console would create a second copy
 * that drifts from the one the API actually reports, and the console would
 * start disagreeing with `/admin/health` about whether a renewal is due.
 *
 * "Expired" *is* derived here, and that is not an inconsistency: the server's
 * flag stays true once the date passes, so without this split a lapsed
 * certificate would be described as "expiring soon" — which reads as a warning
 * about the future for a fleet that is already off the air.
 */
export function describeBrokerCert(cert: BrokerCertInfo | null | undefined): BrokerCertView {
  if (!cert) {
    /*
     * Absent means the API could not open a socket to the broker, or is older
     * than the field. Neither is "fine". Reporting it as healthy would be the
     * worst possible failure for this particular check, because the whole
     * point of it is to be believed when it says nothing is wrong.
     */
    return {
      level: "unknown",
      tone: "slate",
      detail: "not checked",
      advice: "The API could not read the broker's certificate, so its expiry is unknown.",
      urgent: false,
    };
  }

  const days = cert.daysRemaining;

  if (days <= 0) {
    return {
      level: "expired",
      tone: "red",
      detail: "expired",
      advice:
        "The broker certificate has expired — devices cannot complete the TLS handshake. Run platform/scripts/renew-server-cert.sh on the VM.",
      urgent: true,
    };
  }

  if (cert.expiringSoon) {
    return {
      level: "expiring",
      tone: "amber",
      detail: `${days} day${days === 1 ? "" : "s"}`,
      advice: `The broker certificate expires in ${days} day${days === 1 ? "" : "s"}. Renew it with platform/scripts/renew-server-cert.sh — no firmware update is needed.`,
      urgent: true,
    };
  }

  return {
    level: "ok",
    tone: "green",
    detail: `${days} days`,
    advice: null,
    urgent: false,
  };
}
