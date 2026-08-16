/**
 * Cross-application failure collection.
 *
 * The failures this code can have are all quiet ones. A grouping key that is
 * too specific turns one outage into a thousand singletons nobody scrolls
 * through; one that is too loose merges unrelated faults into a pile nobody can
 * read. Redaction that misses turns a diagnostics panel into a place where
 * customer data and credentials accumulate, which no error will ever announce.
 */

import {
  failureSignature,
  normaliseFailure,
  normaliseRoute,
  redactMessage,
  trimStack,
} from "@/lib/api-failures";

describe("normaliseRoute", () => {
  it("collapses ids so one broken endpoint is one row", () => {
    expect(normaliseRoute("/api/candidates/8f21b0c4-1c04-4a77-9f10-2b3c4d5e6f70")).toBe(
      "/api/candidates/[id]"
    );
    expect(normaliseRoute("/api/orders/100234/items")).toBe("/api/orders/[id]/items");
    expect(normaliseRoute("/api/device/a1b2c3d4e5f60718")).toBe("/api/device/[id]");
  });

  it("keeps a version segment, which is not an id", () => {
    // /v1/ and /v2/ are different APIs; merging them hides which one broke.
    expect(normaliseRoute("/api/v1/jobs")).toBe("/api/v1/jobs");
  });

  it("drops the query string", () => {
    // Query strings carry tokens and search terms, and they would also split
    // one endpoint into a row per distinct query.
    expect(normaliseRoute("/api/search?q=secret&token=abc")).toBe("/api/search");
  });

  it("survives nonsense", () => {
    expect(normaliseRoute("")).toBe("/");
  });
});

describe("redactMessage", () => {
  it("removes email addresses that are not the person concerned", () => {
    /*
     * Drivers put the offending value straight into the message, so a failed
     * insert carries somebody's address into a panel any staff member can read.
     */
    expect(redactMessage("duplicate key for rahul@customer.com")).toBe(
      "duplicate key for [email]"
    );
  });

  it("keeps the actor's own address, which is the point of the row", () => {
    expect(redactMessage("permission denied for priya@circuvent.com", "priya@circuvent.com")).toBe(
      "permission denied for priya@circuvent.com"
    );
  });

  it("removes anything long enough to be a credential", () => {
    const message = "auth failed with eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    expect(redactMessage(message)).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(redactMessage(message)).toContain("[redacted]");
  });

  it("removes uuids, which are usually somebody's record", () => {
    expect(redactMessage("row 8f21b0c4-1c04-4a77-9f10-2b3c4d5e6f70 missing")).toBe(
      "row [id] missing"
    );
  });

  it("clamps, so one enormous message cannot dominate the store", () => {
    expect(redactMessage("x".repeat(5000)).length).toBeLessThanOrEqual(300);
  });
});

describe("trimStack", () => {
  it("keeps the top frames and nothing more", () => {
    const stack = ["Error: boom", ...Array.from({ length: 40 }, (_, i) => `    at f${i}`)].join("\n");
    const trimmed = trimStack(stack)!;
    expect(trimmed.split("\n").length).toBeLessThanOrEqual(6);
    expect(trimmed).toContain("at f0");
    expect(trimmed).not.toContain("at f30");
  });

  it("passes undefined through", () => {
    expect(trimStack(undefined)).toBeUndefined();
  });
});

describe("failureSignature", () => {
  const base = {
    app: "ats",
    method: "POST",
    route: "/api/candidates/[id]",
    errorType: "PostgresError",
    errorMessage: "null value in column stage violates not-null constraint",
  };

  it("groups the same fault on different records together", () => {
    // Two people hitting the same bug must be one row with a count of two.
    expect(failureSignature(base)).toBe(
      failureSignature({ ...base, errorMessage: "null value in column stage violates not-null constraint" })
    );
  });

  it("ignores the numbers inside a message", () => {
    /*
     * "timed out after 3011ms" and "after 5024ms" are one problem. Without this
     * every occurrence is its own group and the count is always one.
     */
    expect(failureSignature({ ...base, errorMessage: "timed out after 3011ms" })).toBe(
      failureSignature({ ...base, errorMessage: "timed out after 5024ms" })
    );
  });

  it("keeps different applications apart", () => {
    // The same route name in two apps is two different endpoints with two
    // different owners.
    expect(failureSignature(base)).not.toBe(failureSignature({ ...base, app: "hrms" }));
  });

  it("keeps different error types apart", () => {
    expect(failureSignature(base)).not.toBe(failureSignature({ ...base, errorType: "TypeError" }));
  });

  it("keeps different methods apart", () => {
    expect(failureSignature(base)).not.toBe(failureSignature({ ...base, method: "GET" }));
  });
});

describe("normaliseFailure", () => {
  const ctx = { app: "ats", now: "2026-08-16T12:00:00.000Z" };

  it("accepts a well-formed report", () => {
    const f = normaliseFailure(
      {
        route: "/api/candidates/8f21b0c4-1c04-4a77-9f10-2b3c4d5e6f70",
        method: "post",
        status: 500,
        actor: "Priya@Circuvent.com",
        errorType: "PostgresError",
        errorMessage: "boom",
        durationMs: 412,
      },
      ctx
    )!;
    expect(f.route).toBe("/api/candidates/[id]");
    expect(f.method).toBe("POST");
    expect(f.actor).toBe("priya@circuvent.com");
    expect(f.app).toBe("ats");
    expect(f.durationMs).toBe(412);
  });

  it("refuses a report with no route, which cannot be acted on", () => {
    expect(normaliseFailure({ status: 500 }, ctx)).toBeNull();
    expect(normaliseFailure(null, ctx)).toBeNull();
    expect(normaliseFailure("nonsense", ctx)).toBeNull();
  });

  it("clamps a status somebody has invented", () => {
    expect(normaliseFailure({ route: "/a", status: 99999 }, ctx)!.status).toBe(599);
    expect(normaliseFailure({ route: "/a", status: -5 }, ctx)!.status).toBe(0);
    expect(normaliseFailure({ route: "/a", status: "nope" }, ctx)!.status).toBe(500);
  });

  it("takes the application from the server, never from the payload", () => {
    /*
     * The app name is established by the authenticated caller. Letting a report
     * name its own application would let one misconfigured service file its
     * failures against another and send somebody debugging the wrong codebase.
     */
    const f = normaliseFailure({ route: "/a", app: "hrms" }, ctx)!;
    expect(f.app).toBe("ats");
  });

  it("redacts on the way in, not on the way out", () => {
    // Storing it raw and hiding it in the UI means the data is still there for
    // anybody who reads the document or the database.
    const f = normaliseFailure(
      { route: "/a", errorMessage: "conflict with rahul@customer.com" },
      ctx
    )!;
    expect(f.errorMessage).toBe("conflict with [email]");
  });
});
