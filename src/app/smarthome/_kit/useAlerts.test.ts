/**
 * The alerts hook.
 *
 * The behaviour worth protecting is what happens when the sweep fails: the
 * panel must keep showing what it had and say it is stale, because "we cannot
 * see your devices" and "your devices are fine" look identical if you clear
 * the list. Everything else here is about not making a quiet problem noisy —
 * one request at a time, and no polling into a hidden tab.
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAlerts } from "./useAlerts";

jest.mock("@/lib/control-plane", () => ({ getToken: () => "test-console-token" }));

const alert = (over: Record<string, unknown> = {}) => ({
  fingerprint: "device-offline::hub-a1b2c3",
  severity: "critical",
  title: "Hub is offline",
  detail: "hub-a1b2c3 has not reported in 40 minutes.",
  deviceIds: ["hub-a1b2c3"],
  evidence: {},
  state: "open",
  firstSeenAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  occurrences: 1,
  ...over,
});

function mockFetch(impl: (body: Record<string, unknown>) => { status?: number; json: unknown }) {
  global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const { status = 200, json } = impl(body);
    return { ok: status < 400, status, json: async () => json } as unknown as Response;
  }) as unknown as typeof fetch;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useAlerts", () => {
  it("shows the alerts a sweep returns", async () => {
    mockFetch(() => ({ json: { success: true, alerts: [alert()], summary: { open: 1, critical: 1, warning: 0, acknowledged: 0, resolved: 0, worst: "critical" } } }));
    const { result } = renderHook(() => useAlerts({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.summary?.critical).toBe(1);
    expect(result.current.stale).toBe(false);
  });

  it("keeps showing alerts when a sweep fails, and marks them stale", async () => {
    // The endpoint returns the last known alerts on a control-plane failure
    // precisely so the panel does not have to choose between showing nothing
    // and implying everything is fine.
    mockFetch(() => ({
      status: 502,
      json: { success: false, swept: false, message: "Could not reach the smart-home service.", alerts: [alert()], summary: null },
    }));
    const { result } = renderHook(() => useAlerts({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toContain("Could not reach");
  });

  it("marks stale when the request throws outright", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useAlerts({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stale).toBe(true);
  });

  it("acknowledges immediately rather than waiting for the round trip", async () => {
    mockFetch(() => ({ json: { success: true, alerts: [alert()], summary: null } }));
    const { result } = renderHook(() => useAlerts({ enabled: true }));
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    act(() => {
      result.current.acknowledge("device-offline::hub-a1b2c3");
    });
    // Acknowledging is the user's own action and the server cannot refuse it,
    // so making them watch a spinner to grey out a row is only a delay.
    expect(result.current.alerts[0].state).toBe("acknowledged");
  });

  it("sends the acknowledgement to the server", async () => {
    const seen: Record<string, unknown>[] = [];
    mockFetch((body) => {
      seen.push(body);
      return { json: { success: true, alerts: [alert()], summary: null } };
    });
    const { result } = renderHook(() => useAlerts({ enabled: true }));
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    await act(async () => {
      result.current.acknowledge("device-offline::hub-a1b2c3");
    });
    await waitFor(() => expect(seen.some((b) => b.action === "acknowledge")).toBe(true));
  });

  it("does not run at all when disabled", async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    renderHook(() => useAlerts({ enabled: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends the console token with every sweep", async () => {
    const seen: Record<string, unknown>[] = [];
    mockFetch((body) => {
      seen.push(body);
      return { json: { success: true, alerts: [], summary: null } };
    });
    const { result } = renderHook(() => useAlerts({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(seen[0].consoleToken).toBe("test-console-token");
  });
});
