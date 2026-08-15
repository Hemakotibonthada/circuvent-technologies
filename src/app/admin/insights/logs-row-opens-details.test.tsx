import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppInsightsPanel from "../AppInsightsPanel";
import type { TelemetryEvent } from "@/lib/app-insights";

/**
 * The wiring between the Logs table and the detail drawer.
 *
 * EventDetailDrawer.test.tsx proves the drawer works when handed an event.
 * That is not the same claim as "clicking a row opens it" — the two are joined
 * by a handler in a 2,000-line panel, and a detail view nothing opens is
 * exactly the silent failure this codebase keeps writing guards for: no error,
 * no missing data, just a feature that is never reached.
 */

const EVENT: TelemetryEvent = {
  id: "evt-open-me",
  kind: "request",
  at: "2026-08-14T04:32:00.000Z",
  path: "/api/admin/stats",
  session: "sess-wiring",
  durationMs: 446,
  status: 500,
  method: "GET",
  ok: false,
  source: "api",
  errorType: "UpstreamError",
  errorMessage: "database refused the connection",
};

function view() {
  return {
    summary: {
      totalEvents: 1,
      pageViews: 0,
      requests: 1,
      exceptions: 0,
      sessions: 1,
      failureRate: 1,
      p95: 446,
      series: [{ at: EVENT.at, count: 1, failures: 1 }],
    },
    paths: [],
    failures: [],
    journeys: [],
    requests: [],
    statuses: [],
    performance: [],
    histogram: [],
    recent: [EVENT],
    dependencies: [],
    map: [],
    availability: [],
    lastSweepAt: null,
    anomalies: [],
    received: 1,
    retained: 1,
    capacity: 5000,
    hours: 24,
    now: EVENT.at,
  };
}

beforeEach(() => {
  sessionStorage.setItem("admin-token", "test-token");
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    // Every one of these routes reports outcome in the body, not just the
    // status — `success` is what the panel actually branches on.
    const body = url.includes("insights-telemetry")
      ? { success: true, ...view() }
      : url.includes("insights-rules")
        ? { success: true, rules: [] }
        : { success: true, incidents: [] };
    return { ok: true, json: async () => body } as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.resetAllMocks();
  sessionStorage.clear();
});

describe("Logs row → transaction details", () => {
  it("opens the detail drawer for the row that was clicked", async () => {
    const user = userEvent.setup();
    render(<AppInsightsPanel />);

    // The blade is behind a tab, as it is in the product.
    await user.click(await screen.findByRole("button", { name: /Recent events/i }));

    const row = await screen.findByRole("button", {
      name: /Open transaction details for GET \/api\/admin\/stats/i,
    });

    // Nothing is open until it is asked for.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(row);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("End-to-end transaction details");
    // and it is showing *this* event, not merely some event
    expect(screen.getByText("UpstreamError")).toBeInTheDocument();
    expect(screen.getByText("database refused the connection")).toBeInTheDocument();
  });

  it("opens from the keyboard as well as the mouse", async () => {
    /*
     * A <tr> is neither focusable nor activatable on its own. Without the
     * explicit tabIndex and key handling the row is mouse-only, which for an
     * operator driving a console by keyboard means the details do not exist.
     */
    const user = userEvent.setup();
    render(<AppInsightsPanel />);
    await user.click(await screen.findByRole("button", { name: /Recent events/i }));

    const row = await screen.findByRole("button", {
      name: /Open transaction details for GET \/api\/admin\/stats/i,
    });
    row.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
