/**
 * @jest-environment node
 *
 * The ingest endpoint, exercised through the real route handler.
 *
 * The unit tests next door cover the shaping of a record. This covers the part
 * that decides whether a record is created at all, which is where an
 * observability endpoint goes wrong in the way that matters: accepting reports
 * it should not, or refusing ones it should keep, both while returning 200 and
 * looking entirely healthy.
 *
 * Node environment, not jsdom: the handler takes a web `Request`, and jsdom
 * does not provide one.
 */

const TOKEN = "test-ingest-token-abcdefghijklmnop";

import { POST } from "@/app/api/telemetry/failure/route";
import {
  affectedPeople,
  appBreakdown,
  clearFailures,
  failureGroups,
} from "@/lib/api-failures";

const post = (body: unknown, token?: string) =>
  POST(
    new Request("https://circuvent.com/api/telemetry/failure", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  );

const sample = (over: Record<string, unknown> = {}) => ({
  route: "/api/candidates/8f21b0c4-1c04-4a77-9f10-2b3c4d5e6f70",
  method: "POST",
  status: 500,
  actor: "priya@circuvent.com",
  errorType: "PostgresError",
  errorMessage: "null value in column stage violates not-null constraint",
  ...over,
});

beforeEach(() => {
  clearFailures();
  process.env.INSIGHTS_INGEST_TOKEN = TOKEN;
});

describe("authentication", () => {
  it("refuses everything when no token is configured", async () => {
    /*
     * Falling open would be worse than being switched off: the panel would
     * look exactly as trustworthy while accepting reports from anywhere, and
     * these records name people.
     */
    delete process.env.INSIGHTS_INGEST_TOKEN;
    const res = await post({ app: "ats", failures: [sample()] });
    expect(res.status).toBe(503);
    expect(failureGroups()).toHaveLength(0);
  });

  it("refuses a wrong or missing token", async () => {
    expect((await post({ app: "ats", failures: [sample()] })).status).toBe(401);
    expect((await post({ app: "ats", failures: [sample()] }, "wrong")).status).toBe(401);
    expect(failureGroups()).toHaveLength(0);
  });
});

describe("accepting a report", () => {
  it("records the failure against the person and the application", async () => {
    const res = await post({ app: "ats", failures: [sample()] }, TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, accepted: 1 });

    const [group] = failureGroups();
    expect(group.app).toBe("ats");
    expect(group.route).toBe("/api/candidates/[id]");
    expect(group.actors).toEqual(["priya@circuvent.com"]);

    const [person] = affectedPeople();
    expect(person.actor).toBe("priya@circuvent.com");
    expect(person.topRoute).toBe("POST /api/candidates/[id]");
  });

  it("counts the same fault for two people as one problem with two victims", async () => {
    // The whole reason for grouping: one row saying "this is broken for two
    // people", not two rows nobody connects.
    await post({ app: "ats", failures: [sample()] }, TOKEN);
    await post({ app: "ats", failures: [sample({ actor: "arun@circuvent.com" })] }, TOKEN);

    const groups = failureGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].actors.sort()).toEqual(["arun@circuvent.com", "priya@circuvent.com"]);
    expect(affectedPeople()).toHaveLength(2);
  });

  it("keeps applications apart", async () => {
    await post({ app: "ats", failures: [sample()] }, TOKEN);
    await post({ app: "hrms", failures: [sample()] }, TOKEN);
    expect(failureGroups()).toHaveLength(2);
    expect(appBreakdown().map((a) => a.app).sort()).toEqual(["ats", "hrms"]);
  });

  it("files an unrecognised application rather than dropping it", async () => {
    /*
     * A new service reporting failures is exactly when this is most useful.
     * Rejecting it until somebody edits a list here would hide the deployment
     * that most needs watching.
     */
    await post({ app: "brand-new-service", failures: [sample()] }, TOKEN);
    expect(appBreakdown()[0].app).toBe("other:brand-new-service");
  });

  it("ignores an app name supplied inside a failure", async () => {
    // Otherwise one misconfigured service files against another and sends
    // somebody debugging the wrong codebase.
    await post({ app: "ats", failures: [sample({ app: "hrms" })] }, TOKEN);
    expect(appBreakdown()[0].app).toBe("ats");
  });

  it("caps a batch so one report cannot flood the store", async () => {
    const many = Array.from({ length: 200 }, (_, i) => sample({ route: `/api/x/${i}` }));
    const res = await post({ app: "ats", failures: many }, TOKEN);
    expect((await res.json()).accepted).toBeLessThanOrEqual(50);
  });

  it("survives an empty or malformed body without failing the caller", async () => {
    expect((await post({ app: "ats", failures: [] }, TOKEN)).status).toBe(200);
    expect((await post({ app: "ats" }, TOKEN)).status).toBe(200);
  });
});
