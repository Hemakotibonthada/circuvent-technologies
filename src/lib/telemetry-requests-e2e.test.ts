/**
 * End to end: a browser fetch becomes a row in the requests table.
 *
 * Each piece was tested on its own, which is exactly the condition under which
 * a pipeline still fails to join up — a field the client sends under one name
 * and the server reads under another passes both unit tests and carries no data.
 */

import { ingest, allEvents, clearTelemetry, insightsView } from "./telemetry-store";

describe("request telemetry, client to table", () => {
  beforeEach(() => clearTelemetry());

  it("carries the verb from the beacon payload through to the operation name", () => {
    ingest(
      [
        { kind: "request", path: "/api/devices", method: "POST", status: 201, ok: true, durationMs: 120 },
      ],
      { ip: "203.0.113.9", userAgent: "jest", source: "web" }
    );

    const stored = allEvents();
    expect(stored).toHaveLength(1);
    expect(stored[0].method).toBe("POST");

    const view = insightsView(24);
    expect(view.requests[0].name).toBe("POST /api/devices");
    expect(view.requests[0].count).toBe(1);
  });

  it("counts a 500 as a failure in the table and in the status breakdown", () => {
    ingest(
      [
        { kind: "request", path: "/api/orders", method: "GET", status: 500, ok: false, durationMs: 40 },
        { kind: "request", path: "/api/orders", method: "GET", status: 200, ok: true, durationMs: 30 },
      ],
      { ip: "203.0.113.9", userAgent: "jest", source: "web" }
    );

    const view = insightsView(24);
    const row = view.requests.find((r) => r.name === "GET /api/orders");
    expect(row?.count).toBe(2);
    expect(row?.failed).toBe(1);
    expect(view.statuses.find((s) => s.status === 500)?.count).toBe(1);
  });

  it("keeps a dropped connection visible rather than scoring it as a fast success", () => {
    ingest(
      [{ kind: "request", path: "/api/x", method: "GET", status: 0, ok: false, durationMs: 8000 }],
      { ip: "203.0.113.9", userAgent: "jest", source: "web" }
    );

    const view = insightsView(24);
    expect(view.requests[0].failed).toBe(1);
    expect(view.statuses[0].status).toBe(0);
  });

  it("does not let a request be filed under a made-up verb", () => {
    ingest(
      [{ kind: "request", path: "/api/x", method: "TRACE'; DROP", status: 200, ok: true, durationMs: 10 }],
      { ip: "203.0.113.9", userAgent: "jest", source: "web" }
    );

    // Rejected verb falls back to GET rather than becoming a row label.
    expect(insightsView(24).requests[0].name).toBe("GET /api/x");
  });

  it("separates requests from pageviews in the summary", () => {
    ingest(
      [
        { kind: "pageview", path: "/shop", ok: true, durationMs: 300 },
        { kind: "request", path: "/api/cart", method: "POST", status: 200, ok: true, durationMs: 50 },
      ],
      { ip: "203.0.113.9", userAgent: "jest", source: "web" }
    );

    const view = insightsView(24);
    expect(view.summary.requests).toBe(1);
    expect(view.summary.pageViews).toBe(1);
    // A pageview must never appear as an API operation.
    expect(view.requests.every((r) => r.path !== "/shop")).toBe(true);
  });
});
