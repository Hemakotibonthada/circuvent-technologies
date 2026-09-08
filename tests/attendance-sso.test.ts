/** @jest-environment node */
import crypto from "node:crypto";
import { beginAttendanceSso, sealAttendance, openAttendance, boundIdentity, landingPath,
  ATTENDANCE_CLIENT_ID, ATTENDANCE_ISSUER, SESSION_TTL } from "../src/lib/attendance-sso";

describe("attendance SSO handshake", () => {
  const { flow, url } = beginAttendanceSso("https://attendance.circuvent.com", "people");
  test("uses independent state and nonce with S256 PKCE", () => {
    const params = new URL(url).searchParams;
    expect(params.get("code_challenge")).toBe(crypto.createHash("sha256").update(flow.verifier).digest("base64url"));
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(flow.state).not.toBe(flow.nonce);
    expect(flow.landing).toBe("/?tab=people");
    expect(landingPath("http://localhost:3014", "//evil.test")).toBe("/smarthome/attendance");
  });
  test("encrypts cookies and rejects tampering, purpose substitution and expiry", () => {
    const sealed = sealAttendance("session", { token: "private-token" }, 1000);
    expect(sealed).not.toContain("private-token");
    expect(openAttendance("session", sealed, 1001)).toEqual({ token: "private-token" });
    expect(openAttendance("flow", sealed, 1001)).toBeNull();
    const bytes = Buffer.from(sealed, "base64url"); bytes[30] ^= 1;
    expect(openAttendance("session", bytes.toString("base64url"), 1001)).toBeNull();
    expect(openAttendance("session", sealed, 999)).toBeNull();
    expect(openAttendance("session", sealed, 1000 + SESSION_TTL * 1000)).toBeNull();
  });
  const claims = { iss: ATTENDANCE_ISSUER, aud: ATTENDANCE_CLIENT_ID, nonce: flow.nonce,
    sub: "user-1", email: "Person@Circuvent.com", email_verified: true, exp: Math.floor(Date.now() / 1000) + 300 };
  const token = (overrides = {}) => `header.${Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString("base64url")}.signature`;
  test("binds identity to this browser's flow before signature verification", () => {
    expect(boundIdentity(token(), flow)).toEqual({ email: "person@circuvent.com" });
    for (const invalid of [{ nonce: "other" }, { aud: "hrms" }, { iss: "https://evil.test" },
      { email_verified: false }, { sub: "" }, { exp: 1 }]) {
      expect(boundIdentity(token(invalid), flow)).toBeNull();
    }
  });
});
