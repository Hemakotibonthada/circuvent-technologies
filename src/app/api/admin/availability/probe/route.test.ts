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
import { CONTROL_PLANE_URL } from "@/lib/control-plane";
import { defaultChecks } from "@/lib/synthetic-checks";

const realFetch = global.fetch;

/*
 * The mailer is faked so the assertion can be "an email was sent, to these
 * people, with this subject" rather than "a function was called". Everything
 * else on this path is real: the store, the bridge, the planner.
 */
const sent: { to: string; subject: string; html: string }[] = [];
jest.mock("@/lib/order-core", () => ({
  sendMail: jest.fn(async (to: string, subject: string, html: string) => {
    sent.push({ to, subject, html });
    return true;
  }),
}));

/*
 * The shop store is mocked only because Jest cannot parse it.
 *
 * `src/lib/store.ts` uses a top-level await, which the CJS transform rejects
 * outright, so importing it anywhere in a route's module graph fails the whole
 * file before an assertion runs — the trap documented in Docs/15. The route
 * needs exactly one function from it: the record that this scheduled job ran.
 *
 * Kept this narrow deliberately. Everything else on this path stays real.
 */
const cronRuns: { path: string; outcome: string }[] = [];
jest.mock("@/lib/store", () => ({
  recordCronRun: jest.fn((path: string, outcome: string) => {
    cronRuns.push({ path, outcome });
  }),
}));

/*
 * The control-plane event specifically. The sweep also records one event per
 * synthetic suite check, so "everything in the buffer" is no longer the same
 * question as "what did the control-plane probe record".
 */
const controlPlaneEvents = () => allEvents().filter((e) => e.target === "control-plane");

/*
 * A fetch mock whose control-plane answer is under test, and whose suite
 * checks are healthy.
 *
 * The sweep now checks the rest of the suite too, so a blanket mock makes every
 * synthetic check fail as well — which files an incident per check and quietly
 * consumes the fingerprints a later test in this file needs. That is not
 * theoretical: a mock returning `{"build":"x"}` for everything failed the
 * Office API's body check, so the first test in this file was silently filing
 * the incident a later one was trying to assert on.
 *
 * Matched on the exact control-plane URL rather than on a hostname: it is
 * api.circuvent.com by default, so any "circuvent.com" pattern catches the
 * suite checks as well. That mistake made these tests pass for the wrong
 * reason once already.
 */
const CONTROL_PLANE_PROBE = `${CONTROL_PLANE_URL}/health`;
const mockFetch = (controlPlane: () => Promise<Response>) =>
  jest.fn(async (input: RequestInfo | URL) =>
    String(input) === CONTROL_PLANE_PROBE
      ? controlPlane()
      : new Response('{"status":"ok"}', { status: 200 })
  ) as unknown as typeof fetch;

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
    global.fetch = mockFetch(async () => new Response(JSON.stringify({ build: "x" }), { status: 200 }));

    const res = await GET(req({ authorization: "Bearer test-secret" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.probe.reachable).toBe(true);

    const events = controlPlaneEvents();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("dependency");
    expect(events[0].path).toBe("/health");
    expect(events[0].ok).toBe(true);
  });

  it("records an unreachable control plane instead of dropping it", async () => {
    global.fetch = mockFetch(() => Promise.reject(new Error("ECONNREFUSED")));

    const res = await GET(req({ authorization: "Bearer test-secret" }));
    const body = await res.json();

    // The probe succeeded; the thing it probed did not.
    expect(res.status).toBe(200);
    expect(body.probe.reachable).toBe(false);
    expect(body.probe.errorType).toBe("NetworkError");

    const events = controlPlaneEvents();
    expect(events).toHaveLength(1);
    expect(events[0].ok).toBe(false);
    expect(events[0].status).toBe(0);
  });

  it("records a 503 as down, not as a successful check", async () => {
    global.fetch = mockFetch(async () => new Response("{}", { status: 503 }));

    await GET(req({ authorization: "Bearer test-secret" }));
    const events = controlPlaneEvents();
    expect(events[0].ok).toBe(false);
    expect(events[0].status).toBe(503);
  });

  it("files probes under a synthetic session, out of the user journeys", async () => {
    global.fetch = mockFetch(async () => new Response('{"status":"ok"}', { status: 200 }));
    await GET(req({ authorization: "Bearer test-secret" }));
    expect(controlPlaneEvents()[0].session).toBe("probe:availability");
    expect(controlPlaneEvents()[0].source).toBe("probe");
  });
});

describe("the sweep also files incidents from telemetry", () => {
  beforeEach(() => {
    clearTelemetry();
    process.env.CRON_SECRET = "test-secret";
    global.fetch = mockFetch(async () => new Response('{"status":"ok"}', { status: 200 }));
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
    global.fetch = mockFetch(async () => new Response('{"status":"ok"}', { status: 200 }));
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

describe("the sweep tells somebody", () => {
  beforeEach(() => {
    clearTelemetry();
    sent.length = 0;
    process.env.CRON_SECRET = "test-secret";
    process.env.ICM_NOTIFY_EMAIL = "oncall@circuvent.com";
    global.fetch = mockFetch(async () => new Response('{"status":"ok"}', { status: 200 }));
  });

  it("emails when an incident is filed, and does not email again for the same one", async () => {
    // A route failing hard: detection files it, and somebody must hear about it.
    for (let i = 0; i < 3; i++) {
      ingest(
        Array.from({ length: 40 }, () => ({
          kind: "request",
          path: "/api/invoices",
          method: "GET",
          status: 503,
          ok: false,
          durationMs: 30,
        })),
        { session: "s", source: "web", now: new Date(Date.now() - 5 * 60_000).toISOString() }
      );
    }

    const first = await (await GET(req({ authorization: "Bearer test-secret" }))).json();

    expect(first.detection.incidentsFiled.length).toBeGreaterThan(0);
    expect(first.notified.sent).toBeGreaterThan(0);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].to).toContain("oncall@circuvent.com");
    expect(sent[0].subject).toContain(first.detection.incidentsFiled[0]);

    // Swept again: the problem persists, but the message has been sent.
    const before = sent.length;
    const second = await (await GET(req({ authorization: "Bearer test-secret" }))).json();

    expect(second.detection.incidentsFiled).toEqual([]);
    expect(sent.length).toBe(before);
  });

  it("does not fail the probe when there is nothing to say", async () => {
    const body = await (await GET(req({ authorization: "Bearer test-secret" }))).json();
    expect(body.ok).toBe(true);
    expect(body.notified.failed).toBe(0);
  });
});

describe("the sweep watches the rest of the suite", () => {
  beforeEach(() => {
    clearTelemetry();
    sent.length = 0;
    process.env.CRON_SECRET = "test-secret";
    process.env.ICM_NOTIFY_EMAIL = "oncall@circuvent.com";
  });

  /** Answers 200 for everything except the hosts named. */
  const failing = (broken: string[]) =>
    jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (broken.some((b) => url.includes(b))) return new Response("", { status: 503 });
      return new Response('{"status":"ok"}', { status: 200 });
    }) as unknown as typeof fetch;

  it("reports every check, not just the failures", async () => {
    global.fetch = failing([]);
    const body = await (await GET(req({ authorization: "Bearer test-secret" }))).json();

    expect(body.synthetic.length).toBe(defaultChecks().length);
    expect(body.synthetic.every((s: { ok: boolean }) => s.ok)).toBe(true);
  });

  it("files and emails when another app in the suite goes down", async () => {
    // Exactly the outage that motivated this: the page serves fine, the API
    // behind it does not.
    global.fetch = failing(["https://mail.circuvent.com/api/health"]);

    const body = await (await GET(req({ authorization: "Bearer test-secret" }))).json();

    const broken = body.synthetic.find((s: { id: string }) => s.id === "mail-prod");
    expect(broken.ok).toBe(false);
    expect(broken.reason).toContain("503");

    // And the page check still passed, which is the point — it always did.
    expect(body.synthetic.find((s: { id: string }) => s.id === "web-prod").ok).toBe(true);

    expect(body.detection.incidentsFiled.length).toBeGreaterThan(0);
    expect(sent.some((m) => m.subject.includes("mail.circuvent.com"))).toBe(true);
  });

  it("does not open a second incident while the outage continues", async () => {
    global.fetch = failing(["https://circuvent.com/api/health"]);

    const first = await (await GET(req({ authorization: "Bearer test-secret" }))).json();
    expect(first.detection.incidentsFiled.length).toBeGreaterThan(0);

    const second = await (await GET(req({ authorization: "Bearer test-secret" }))).json();
    expect(second.synthetic.find((s: { id: string }) => s.id === "web-prod").ok).toBe(false);
    expect(second.detection.incidentsFiled).toEqual([]);
  });

  it("keeps the health probe working when the suite checks throw", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("circuvent.com")) throw new Error("dns exploded");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const res = await GET(req({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});