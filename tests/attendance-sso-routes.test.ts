/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/attendance/auth/sso/callback/route";
import { POST } from "../src/app/api/attendance/auth/sso/session/route";
import { beginAttendanceSso, sealAttendance, openAttendance, FLOW_COOKIE, SESSION_COOKIE,
  ATTENDANCE_CLIENT_ID, ATTENDANCE_ISSUER, SSO_PATH } from "../src/lib/attendance-sso";
jest.mock("@/lib/sso", () => ({ CONTROL_PLANE_URL: "https://control.test", federationAllowedHere: () => true }));
const origin = "https://attendance.circuvent.com";
const { flow } = beginAttendanceSso(origin);
const session = { token: "console-secret", refreshToken: "refresh-secret", user: { id: 7, email: "person@circuvent.com", name: "Person" } };
const idToken = `header.${Buffer.from(JSON.stringify({ iss: ATTENDANCE_ISSUER, aud: ATTENDANCE_CLIENT_ID,
  nonce: flow.nonce, sub: "7", email: session.user.email, email_verified: true, exp: Math.floor(Date.now()/1000)+300 })).toString("base64url")}.signature`;
const callback = (state = flow.state) => new NextRequest(`${origin}${SSO_PATH}/callback?code=code&state=${state}`, {
  headers: { cookie: `${FLOW_COOKIE}=${sealAttendance("flow", flow)}` },
});
describe("attendance callback and browser handoff", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  test("refuses mismatched state without exchanging credentials", async () => {
    global.fetch = jest.fn();
    expect((await GET(callback("wrong"))).headers.get("location")).toContain("attendance_sso=expired");
    expect(global.fetch).not.toHaveBeenCalled();
  });
  test("requires control-plane verification before creating a handoff", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(Response.json({ id_token: idToken }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const response = await GET(callback());
    expect(response.headers.get("location")).toContain("attendance_sso=session");
    expect(response.cookies.get(SESSION_COOKIE)?.value).toBe("");
  });
  test("exchanges PKCE then hands off encrypted credentials without URL tokens", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(Response.json({ id_token: idToken }))
      .mockResolvedValueOnce(Response.json(session));
    const response = await GET(callback());
    expect(response.headers.get("location")).toBe(`${origin}/?attendance_sso=complete`);
    const sealed = response.cookies.get(SESSION_COOKIE)!;
    expect(sealed.httpOnly).toBe(true);
    expect(sealed.secure).toBe(true);
    expect(openAttendance("session", sealed.value)).toEqual(session);
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][1].body.get("code_verifier")).toBe(flow.verifier);
    expect(calls[1][0]).toBe("https://control.test/auth/sso");
    expect(JSON.parse(calls[1][1].body)).toEqual({ idToken });
    const handed = await POST(new NextRequest(`${origin}${SSO_PATH}/session`, {
      method: "POST", headers: { origin, cookie: `${SESSION_COOKIE}=${sealed.value}` },
    }));
    expect(await handed.json()).toEqual(session);
    expect(handed.cookies.get(SESSION_COOKIE)?.value).toBe("");
    expect(handed.headers.get("cache-control")).toBe("no-store");
  });
  test("rejects cross-origin handoffs and missing sessions", async () => {
    expect((await POST(new NextRequest(`${origin}${SSO_PATH}/session`, { method: "POST", headers: { origin: "https://evil.test" } }))).status).toBe(403);
    expect((await POST(new NextRequest(`${origin}${SSO_PATH}/session`, { method: "POST", headers: { origin } }))).status).toBe(401);
  });
  test("carries verified organization data from the identity service", async () => {
    const organization = { id: "org-7", name: "Customer Company", domain: "customer.example" };
    global.fetch = jest.fn().mockResolvedValueOnce(Response.json({ id_token: idToken, access_token: "access" }))
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ email: session.user.email, email_verified: true, organization }));
    const response = await GET(callback());
    const handed = openAttendance<{ user: { organization: unknown } }>("session", response.cookies.get(SESSION_COOKIE)?.value);
    expect(handed?.user.organization).toEqual(organization);
    expect((global.fetch as jest.Mock).mock.calls[2][1].headers.Authorization).toBe("Bearer access");
  });
  test("rejects organization details returned for a different identity", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(Response.json({ id_token: idToken, access_token: "access" }))
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ email: "someone@else.test", email_verified: true, organization: { id: "other" } }));
    expect((await GET(callback())).headers.get("location")).toContain("attendance_sso=identity");
  });
});
