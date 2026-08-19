/** @jest-environment node */
import {
  runCheck,
  runChecks,
  checksToAlerts,
  checksToTelemetry,
  defaultChecks,
  type SyntheticCheck,
} from "./synthetic-checks";

const NOW = "2026-06-01T12:00:00.000Z";

const check = (over: Partial<SyntheticCheck> = {}): SyntheticCheck => ({
  id: "test",
  name: "Test service",
  url: "https://example.test/api/health",
  method: "GET",
  expectStatus: [200],
  owningTeam: "Platform",
  enabled: true,
  ...over,
});

const reply = (status: number, body = "") =>
  jest.fn().mockResolvedValue(new Response(body, { status })) as unknown as typeof fetch;

afterEach(() => {
  jest.restoreAllMocks();
});

describe("runCheck", () => {
  it("passes when the status is expected", async () => {
    global.fetch = reply(200);
    const r = await runCheck(check());

    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.reason).toBe("answered 200");
  });

  it("fails on the wrong status and says what it wanted", async () => {
    // This is the Office backend as found: alive enough to answer, not alive.
    global.fetch = reply(503);
    const r = await runCheck(check());

    expect(r.ok).toBe(false);
    expect(r.errorType).toBe("HTTP 503");
    expect(r.reason).toBe("answered 503; expected 200");
  });

  it("treats an expected 401 as healthy", async () => {
    /*
     * The useful check on a guarded endpoint: 401 proves the route exists, the
     * process is up and the guard is running. Demanding 2xx would mean either
     * not checking authenticated surfaces or holding a credential to do it.
     */
    global.fetch = reply(401);
    const r = await runCheck(check({ expectStatus: [401] }));

    expect(r.ok).toBe(true);
  });

  it("distinguishes a timeout from an unreachable host", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    global.fetch = jest.fn().mockRejectedValue(abort) as unknown as typeof fetch;
    const timedOut = await runCheck(check({ timeoutMs: 50 }));

    expect(timedOut.ok).toBe(false);
    expect(timedOut.errorType).toBe("Timeout");
    expect(timedOut.reason).toContain("did not answer within 50ms");

    global.fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;
    const refused = await runCheck(check());

    expect(refused.errorType).toBe("NetworkError");
    expect(refused.reason).toBe("could not be reached at all");
  });

  it("checks the body when asked", async () => {
    global.fetch = reply(200, '{"status":"ok"}');
    expect((await runCheck(check({ expectBody: "ok" }))).ok).toBe(true);

    global.fetch = reply(200, '{"status":"degraded"}');
    const bad = await runCheck(check({ expectBody: "ok" }));
    expect(bad.ok).toBe(false);
    expect(bad.errorType).toBe("BodyMismatch");
  });

  it("does not read the body when nothing depends on it", async () => {
    const res = new Response("a very large page", { status: 200 });
    const text = jest.spyOn(res, "text");
    global.fetch = jest.fn().mockResolvedValue(res) as unknown as typeof fetch;

    await runCheck(check());
    expect(text).not.toHaveBeenCalled();
  });

  it("never throws, whatever fetch does", async () => {
    global.fetch = jest.fn().mockRejectedValue("not even an error") as unknown as typeof fetch;
    await expect(runCheck(check())).resolves.toMatchObject({ ok: false });
  });
});

describe("runChecks", () => {
  it("skips disabled checks", async () => {
    global.fetch = reply(200);
    const results = await runChecks([check({ id: "a" }), check({ id: "b", enabled: false })]);

    expect(results.map((r) => r.check.id)).toEqual(["a"]);
  });

  it("runs concurrently, so one dead host does not stop the rest", async () => {
    /*
     * Sequentially, ten checks at a ten-second timeout is a hundred seconds and
     * exceeds the scheduler's budget — a single dead host would prevent the
     * others being checked at all, and the outage would look like silence.
     */
    let inFlight = 0;
    let peak = 0;
    global.fetch = jest.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    await runChecks([check({ id: "a" }), check({ id: "b" }), check({ id: "c" })]);
    expect(peak).toBe(3);
  });
});

describe("checksToAlerts", () => {
  it("emits nothing when everything is healthy", () => {
    expect(checksToAlerts([{ check: check(), ok: true, status: 200, durationMs: 5, reason: "answered 200" }], NOW)).toEqual([]);
  });

  it("fingerprints on the check, so a long outage is one incident", () => {
    const failure = { check: check(), ok: false, status: 503, durationMs: 5, errorType: "HTTP 503", reason: "answered 503; expected 200" };
    const [a] = checksToAlerts([failure], NOW);
    const [b] = checksToAlerts([failure], "2026-06-03T12:00:00.000Z");

    expect(a.fingerprint).toBe("synthetic:test");
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("rates unreachable above merely wrong", () => {
    const gone = checksToAlerts(
      [{ check: check(), ok: false, status: 0, durationMs: 5, errorType: "NetworkError", reason: "could not be reached at all" }],
      NOW
    );
    const wrong = checksToAlerts(
      [{ check: check(), ok: false, status: 503, durationMs: 5, errorType: "HTTP 503", reason: "answered 503; expected 200" }],
      NOW
    );

    expect(gone[0].severity).toBe("critical");
    expect(wrong[0].severity).toBe("warning");
  });

  it("produces an alert the ICM bridge accepts", () => {
    const [a] = checksToAlerts(
      [{ check: check(), ok: false, status: 503, durationMs: 5, errorType: "HTTP 503", reason: "answered 503; expected 200" }],
      NOW
    );

    // The bridge refuses anything not "open" and keys everything on fingerprint.
    expect(a.state).toBe("open");
    expect(a.title).toContain("Test service");
    expect(a.detail).toContain("503");
    expect(a.evidence.url).toBe("https://example.test/api/health");
  });
});

describe("checksToTelemetry", () => {
  it("records successes as well as failures, so availability has a denominator", () => {
    const events = checksToTelemetry([
      { check: check({ id: "a" }), ok: true, status: 200, durationMs: 12, reason: "answered 200" },
      { check: check({ id: "b" }), ok: false, status: 503, durationMs: 30, errorType: "HTTP 503", reason: "answered 503; expected 200" },
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "dependency", target: "a", ok: true, path: "/api/health" });
    expect(events[1]).toMatchObject({ target: "b", ok: false, errorType: "HTTP 503" });
  });

  it("keeps a query string out of the recorded path", () => {
    const events = checksToTelemetry([
      {
        check: check({ id: "sock", url: "https://h.test/office-api/socket.io/?EIO=4&transport=polling" }),
        ok: true,
        status: 200,
        durationMs: 9,
        reason: "answered 200",
      },
    ]);

    expect(events[0].path).toBe("/office-api/socket.io/");
  });
});

describe("defaultChecks", () => {
  it("watches other people's services, not only our own origin", () => {
    const hosts = new Set(defaultChecks().map((c) => new URL(c.url).host));
    expect(hosts.size).toBeGreaterThan(2);
  });

  it("checks an API endpoint for every service, not just a page", () => {
    /*
     * The outage that motivated this: office.circuvent.com returned 200
     * throughout, because a static bundle serves fine no matter what its API is
     * doing. Only a check against the API itself would have caught it.
     *
     * That app has since been retired and its checks removed with it, so this
     * no longer names it. The lesson outlived the service, and what it asserts
     * now is the property that mattered — no check may point at a bare origin,
     * because a page answering 200 says nothing about whether the thing behind
     * it works.
     */
    const checks = defaultChecks();
    expect(checks.length).toBeGreaterThan(0);

    // Collected rather than asserted one at a time, because jest's `expect`
    // takes no message argument — so a failure has to carry the offending id
    // in the value it compares, or it says only "false is not true".
    const bareOrigins = checks
      .filter((check) => new URL(check.url).pathname === "/")
      .map((check) => check.id);
    expect(bareOrigins).toEqual([]);

    const notAnApi = checks
      .filter((check) => !/health|api|socket/i.test(new URL(check.url).pathname))
      .map((check) => check.id);
    expect(notAnApi).toEqual([]);
  });

  it("has unique ids, since the fingerprint is built from them", () => {
    const ids = defaultChecks().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has parseable urls", () => {
    for (const c of defaultChecks()) expect(() => new URL(c.url)).not.toThrow();
  });
});
