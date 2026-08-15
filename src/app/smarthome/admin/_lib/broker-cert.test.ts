import { describeBrokerCert } from "./broker-cert";
import type { BrokerCertInfo } from "@/lib/control-plane";

/**
 * The states an operator can be shown about the broker certificate.
 *
 * The distinctions tested here are the ones that decide whether somebody acts:
 * "not checked" must never read as healthy, and an already-lapsed certificate
 * must not be described as a future risk.
 */

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

describe("describeBrokerCert", () => {
  it("reports a healthy certificate without advice", () => {
    const v = describeBrokerCert(cert());
    expect({ level: v.level, tone: v.tone, urgent: v.urgent, advice: v.advice }).toEqual({
      level: "ok",
      tone: "green",
      urgent: false,
      advice: null,
    });
    expect(v.detail).toBe("400 days");
  });

  it("never reports an unreadable certificate as healthy", () => {
    /*
     * The whole value of this check is being believed when it says nothing is
     * wrong. Treating "could not reach the broker" as "fine" would make it
     * worthless in exactly the situation it exists for.
     */
    for (const missing of [null, undefined]) {
      const v = describeBrokerCert(missing);
      expect(v.level).toBe("unknown");
      expect(v.tone).toBe("slate");
      expect(v.detail).toBe("not checked");
      expect(v.advice).toMatch(/could not read/i);
      // Unknown is not an emergency — it is usually a restarting broker.
      expect(v.urgent).toBe(false);
    }
  });

  it("warns while there is still time to act", () => {
    const v = describeBrokerCert(cert({ daysRemaining: 45, expiringSoon: true }));
    expect(v.level).toBe("expiring");
    expect(v.tone).toBe("amber");
    expect(v.urgent).toBe(true);
    expect(v.detail).toBe("45 days");
    // The renewal costs nothing if it is done in time; say so, so nobody
    // postpones it fearing an OTA to the whole fleet.
    expect(v.advice).toMatch(/renew-server-cert\.sh/);
    expect(v.advice).toMatch(/no firmware update/i);
  });

  it("describes a lapsed certificate as expired, not as expiring", () => {
    /*
     * The server's `expiringSoon` stays true once the date passes. Without the
     * local expired check, a fleet that is already off the air would be
     * described as a warning about the future.
     */
    const v = describeBrokerCert(cert({ daysRemaining: -3, expiringSoon: true }));
    expect(v.level).toBe("expired");
    expect(v.tone).toBe("red");
    expect(v.urgent).toBe(true);
    expect(v.detail).toBe("expired");
    expect(v.advice).not.toMatch(/expires in/i);
  });

  it("treats the expiry day itself as expired", () => {
    expect(describeBrokerCert(cert({ daysRemaining: 0, expiringSoon: true })).level).toBe("expired");
  });

  it("agrees with the server about when to warn", () => {
    /*
     * The threshold lives in platform/api/src/broker-cert.ts. A low day count
     * with the flag clear must stay quiet — re-deriving 60 days here is how the
     * console and /admin/health would start disagreeing.
     */
    const v = describeBrokerCert(cert({ daysRemaining: 30, expiringSoon: false }));
    expect(v.level).toBe("ok");
    expect(v.urgent).toBe(false);
  });

  it("does not write '1 days'", () => {
    expect(describeBrokerCert(cert({ daysRemaining: 1, expiringSoon: true })).detail).toBe("1 day");
    expect(describeBrokerCert(cert({ daysRemaining: 2, expiringSoon: true })).detail).toBe("2 days");
  });
});
