/**
 * @jest-environment node
 *
 * The suite runs in jsdom, which has no Request/Response — importing a route
 * handler there fails before a single assertion runs. Overridden per file
 * rather than globally: every other test in this repo wants a DOM, and this is
 * the first API route test, so there was no precedent to follow.
 *
 * The availability probe endpoint.
 *
 * Two properties matter more than the happy path: it must stay shut without a
 * configured secret (it makes an outbound request on demand, so an open
 * trigger is an abuse vector), and a control plane that is down must be
 * recorded as down rather than dropped — an outage that leaves no trace is
 * indistinguishable from uptime.
 */

import { GET } from "@/app/api/admin/availability/probe/route";
import { allEvents, clearTelemetry } from "@/lib/telemetry-store";

const realFetch = global.fetch;

const req = (headers: Record<string, string> = {}) =>
  new Request("https://circuvent.com/api/admin/availability/probe", { headers });

describe("availability probe", () => {
  beforeEach(() => {
    clearTelemetry();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("refuses without a bearer token", async () => {
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(allEvents()).toHaveLength(0);
  });

  it("refuses a wrong token", async () => {
    const res = await GET(req({ authorization: "Bearer nope" }));
    expect(res.status).toBe(403);
  });

  it("stays shut when no secret is configured, rather than open", async () => {
    // The dangerous default. An unset secret must not mean "no auth required".
    delete process.env.CRON_SECRET;
    const res = await GET(req({ authorization: "Bearer anything" }));
    expect(res.status).toBe(403);
  });

  it("records a reachable control plane", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ build: "x" }), { status: 200 })
    ) as unknown as typeof fetch;

    const res = await GET(req({ authorization: "Bearer test-secret" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.probe.reachable).toBe(true);

    const events = allEvents();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("dependency");
    expect(events[0].path).toBe("/health");
    expect(events[0].ok).toBe(true);
  });

  it("records an unreachable control plane instead of dropping it", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const res = await GET(req({ authorization: "Bearer test-secret" }));
    const body = await res.json();

    // The probe succeeded; the thing it probed did not.
    expect(res.status).toBe(200);
    expect(body.probe.reachable).toBe(false);
    expect(body.probe.errorType).toBe("NetworkError");

    const events = allEvents();
    expect(events).toHaveLength(1);
    expect(events[0].ok).toBe(false);
    expect(events[0].status).toBe(0);
  });

  it("records a 503 as down, not as a successful check", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response("{}", { status: 503 })
    ) as unknown as typeof fetch;

    await GET(req({ authorization: "Bearer test-secret" }));
    const events = allEvents();
    expect(events[0].ok).toBe(false);
    expect(events[0].status).toBe(503);
  });

  it("files probes under a synthetic session, out of the user journeys", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response("{}", { status: 200 })) as unknown as typeof fetch;
    await GET(req({ authorization: "Bearer test-secret" }));
    expect(allEvents()[0].session).toBe("probe:availability");
    expect(allEvents()[0].source).toBe("probe");
  });
});
