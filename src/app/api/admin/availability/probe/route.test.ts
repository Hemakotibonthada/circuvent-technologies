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
import { allEvents, clearTelemetry, ingest } from "@/lib/telemetry-store";

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

describe("the sweep also files incidents from telemetry", () => {
  beforeEach(() => {
    clearTelemetry();
    process.env.CRON_SECRET = "test-secret";
    global.fetch = jest.fn().mockResolvedValue(new Response("{}", { status: 200 })) as unknown as typeof fetch;
  });

  it("files nothing when telemetry is healthy", async () => {
    const now = Date.now();
    ingest(
      Array.from({ length: 100 }, () => ({
        kind: "request",
        path: "/api/devices",
        method: "GET",
        status: 200,
        ok: true,
        durationMs: 40,
      })),
      { session: "s", source: "web", now: new Date(now - 3 * 3600_000).toISOString() }
    );

    const res = await GET(req({ authorization: "Bearer test-secret" }));
    const body = await res.json();
    expect(body.detection.findings).toBe(0);
    expect(body.detection.incidentsFiled).toEqual([]);
  });

  it("files an incident when a route starts failing", async () => {
    const now = Date.now();
    // A healthy baseline, well before the window.
    ingest(
      Array.from({ length: 200 }, () => ({
        kind: "request",
        path: "/api/orders",
        method: "GET",
        status: 200,
        ok: true,
        durationMs: 40,
      })),
      { session: "s", source: "web", now: new Date(now - 5 * 3600_000).toISOString() }
    );
    // Then a spike, inside it. Ingest caps a single call at 50 events, so this
    // is sent in batches — which is also how a real browser reports.
    for (let i = 0; i < 2; i++) {
      ingest(
        Array.from({ length: 40 }, () => ({
          kind: "request",
          path: "/api/orders",
          method: "GET",
          status: 500,
          ok: false,
          durationMs: 40,
        })),
        { session: "s", source: "web", now: new Date(now - 5 * 60_000).toISOString() }
      );
    }

    const res = await GET(req({ authorization: "Bearer test-secret" }));
    const body = await res.json();

    expect(body.detection.findings).toBeGreaterThan(0);
    expect(body.detection.incidentsFiled.length).toBeGreaterThan(0);
  });

  it("does not file the same incident twice on consecutive sweeps", async () => {
    const now = Date.now();
    ingest(
      Array.from({ length: 200 }, () => ({
        kind: "request",
        path: "/api/carts",
        method: "GET",
        status: 200,
        ok: true,
        durationMs: 40,
      })),
      { session: "s", source: "web", now: new Date(now - 5 * 3600_000).toISOString() }
    );
    for (let i = 0; i < 2; i++) {
      ingest(
        Array.from({ length: 40 }, () => ({
          kind: "request",
          path: "/api/carts",
          method: "GET",
          status: 500,
          ok: false,
          durationMs: 40,
        })),
        { session: "s", source: "web", now: new Date(now - 5 * 60_000).toISOString() }
      );
    }

    const first = await (await GET(req({ authorization: "Bearer test-secret" }))).json();
    const second = await (await GET(req({ authorization: "Bearer test-secret" }))).json();

    expect(first.detection.incidentsFiled.length).toBeGreaterThan(0);
    // The detector still finds it — the problem has not gone away — but the
    // bridge must not open a second incident for it.
    expect(second.detection.findings).toBeGreaterThan(0);
    expect(second.detection.incidentsFiled).toEqual([]);
  });
});

describe("user-defined alert rules fire through the same sweep", () => {
  beforeEach(() => {
    clearTelemetry();
    process.env.CRON_SECRET = "test-secret";
    global.fetch = jest.fn().mockResolvedValue(new Response("{}", { status: 200 })) as unknown as typeof fetch;
  });

  const seed = (n: number, over: Record<string, unknown>) => {
    for (let i = 0; i < Math.ceil(n / 40); i++) {
      ingest(
        Array.from({ length: Math.min(40, n - i * 40) }, () => ({
          kind: "request",
          path: "/api/quotes",
          method: "GET",
          status: 200,
          ok: true,
          durationMs: 50,
          ...over,
        })),
        { session: "s", source: "web", now: new Date(Date.now() - 5 * 60_000).toISOString() }
      );
    }
  };

  it("reports rule alerts separately from detection findings", async () => {
    seed(200, { durationMs: 50 });
    const body = await (await GET(req({ authorization: "Bearer test-secret" }))).json();

    // A healthy system trips neither.
    expect(body.detection.findings).toBe(0);
    expect(body.detection.ruleAlerts).toBe(0);
  });

  it("files an incident when a shipped default rule is breached, and only once", async () => {
    // Slow but successful: invisible to failure-rate detection, and exactly the
    // gap user-defined latency rules exist to cover.
    seed(200, { durationMs: 9000 });

    const first = await (await GET(req({ authorization: "Bearer test-secret" }))).json();
    expect(first.detection.ruleAlerts).toBeGreaterThan(0);
    expect(first.detection.incidentsFiled.length).toBeGreaterThan(0);

    /*
     * Swept again with the problem still present. The rule must still fire —
     * nothing has been fixed — but the bridge must not open a second incident.
     * Asserted in one test rather than two because the incident filed above is
     * exactly the state the second sweep is being judged against.
     */
    const second = await (await GET(req({ authorization: "Bearer test-secret" }))).json();
    expect(second.detection.ruleAlerts).toBeGreaterThan(0);
    expect(second.detection.incidentsFiled).toEqual([]);
  });
});