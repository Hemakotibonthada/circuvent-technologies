/**
 * The console and the phone must agree about whether a broker certificate
 * needs renewing.
 *
 * `src/app/smarthome/admin/_lib/broker-cert.ts` and `mobile/src/broker-cert.ts`
 * are deliberate duplicates — the app is a separate TypeScript project and
 * Metro cannot resolve imports above its own root. Duplication is fine here;
 * drifting is not.
 *
 * The failure this prevents is quiet and slow. If the phone's copy stopped
 * treating a lapsed certificate as expired, an operator glancing at the app
 * would see a healthy fleet while the console said the handshake was already
 * failing — and each copy would be perfectly self-consistent, so neither
 * project would fail a build. The date it matters on is knowable years in
 * advance, which is exactly why nobody is watching when it arrives.
 *
 * Same reasoning as tests/tank-link-app-parity.test.ts.
 */

import { describeBrokerCert as web } from "@/app/smarthome/admin/_lib/broker-cert";
import { describeBrokerCert as app } from "../mobile/src/broker-cert";
import type { BrokerCertInfo } from "@/lib/control-plane";

function cert(over: Partial<BrokerCertInfo> = {}): BrokerCertInfo {
  return {
    subject: "mqtt.circuvent.com",
    issuer: "Circuvent Device CA",
    validTo: "2027-01-01T00:00:00.000Z",
    daysRemaining: 400,
    expiringSoon: false,
    ...over,
  };
}

/** Every shape /admin/health can produce, including the awkward boundaries. */
const CASES: Array<[string, BrokerCertInfo | null | undefined]> = [
  ["missing entirely", undefined],
  ["explicitly null", null],
  ["healthy, long life", cert()],
  ["healthy but not flagged", cert({ daysRemaining: 30, expiringSoon: false })],
  ["flagged, plenty of notice", cert({ daysRemaining: 60, expiringSoon: true })],
  ["flagged, six weeks", cert({ daysRemaining: 45, expiringSoon: true })],
  ["one day left", cert({ daysRemaining: 1, expiringSoon: true })],
  ["two days left", cert({ daysRemaining: 2, expiringSoon: true })],
  ["expires today", cert({ daysRemaining: 0, expiringSoon: true })],
  ["already lapsed", cert({ daysRemaining: -3, expiringSoon: true })],
  ["long lapsed, flag cleared", cert({ daysRemaining: -400, expiringSoon: false })],
  ["renewed but flag stale", cert({ daysRemaining: 800, expiringSoon: true })],
];

describe("describeBrokerCert agrees across console and app", () => {
  it.each(CASES)("%s", (_name, input) => {
    const w = web(input);
    const a = app(input);
    /*
     * `tone` is not compared: it is the console's own palette name, and the
     * app derives its colour from the theme at render time. Everything that
     * decides what an operator is told — the level, the figure, the sentence
     * and whether it interrupts — has to be identical.
     */
    expect({ level: a.level, detail: a.detail, advice: a.advice, urgent: a.urgent }).toEqual({
      level: w.level,
      detail: w.detail,
      advice: w.advice,
      urgent: w.urgent,
    });
  });

  it("covers every level in both copies", () => {
    // A parity suite that only ever exercised one branch would pass while the
    // other three drifted freely.
    const levels = new Set(CASES.map(([, input]) => web(input).level));
    expect([...levels].sort()).toEqual(["expired", "expiring", "ok", "unknown"]);
  });

  it("never calls an unreadable certificate healthy, in either copy", () => {
    for (const missing of [null, undefined]) {
      expect(web(missing).level).toBe("unknown");
      expect(app(missing).level).toBe("unknown");
    }
  });
});
