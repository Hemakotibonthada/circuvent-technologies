/**
 * The `/v1` API and the console API return the same rows under different field
 * names, and the unattended sweep reads the console names.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS
 *
 * The sweep called `/devices`, `/events` and `/automations`. All three are
 * `requireAuth` — a user JWT only — while the sweep authenticates with
 * CIRCUVENT_SWEEP_TOKEN, which the code itself documents as "a control-plane
 * developer key". A key cannot call any of them. Configure the token exactly as
 * instructed and every request 401s: the feature could never have worked.
 *
 * Pointing it at `/v1` fixes that and creates a quieter problem. `staleness()`
 * reads `last_seen` and returns null without it; `findRecurringEvents` keys on
 * `ts`. Handed camelCase rows the sweep finds no stale device and no recurring
 * event *ever* — on schedule, reporting success, and blind. These assertions
 * are the difference between a monitor and a placebo.
 */
import { fromV1Device, fromV1Event, fromV1DeviceList, fromV1EventList } from "@/lib/v1-shapes";
import { findStaleDevices } from "@/lib/ai/analysis";
import type { Device } from "@/lib/control-plane";

describe("device mapping", () => {
  it("renames the two fields the analysis actually reads", () => {
    const d = fromV1Device({
      id: "camera-1",
      name: "Cctv1",
      type: "camera",
      online: true,
      lastSeen: "2026-08-14T10:00:00.000Z",
      firmware: "1.14.3",
      state: { streaming: true },
    });
    expect(d.last_seen).toBe("2026-08-14T10:00:00.000Z");
    expect(d.fw_version).toBe("1.14.3");
  });

  it("keeps a device the staleness check can still see", () => {
    /*
     * The end-to-end point of the whole mapping, asserted in both directions.
     *
     * A camelCase row handed straight to the analysis has no `last_seen`, so
     * findStaleDevices returns nothing — the sweep runs, reports a clean
     * result, and never notices a device that went quiet. That is the failure
     * this file exists to prevent, so it is pinned rather than described.
     */
    const quietSince = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const raw = { id: "hub-1", online: true, lastSeen: quietSince };

    const unmapped = findStaleDevices([raw as unknown as Device]);
    expect(unmapped).toHaveLength(0);

    const mapped = findStaleDevices([fromV1Device(raw)]);
    expect(mapped.length).toBeGreaterThan(0);
  });

  it("does not invent a room from a null one", () => {
    // `room` is nullable on the wire and optional here; the string "null" in a
    // room filter is worse than no room at all.
    expect(fromV1Device({ id: "a", room: null }).room).toBeUndefined();
    expect(fromV1Device({ id: "a", room: "Living Room" }).room).toBe("Living Room");
  });

  it("treats a missing online flag as offline, not as online", () => {
    // Absence is not evidence of health. Defaulting the other way would have a
    // silent device counted as present.
    expect(fromV1Device({ id: "a" }).online).toBe(false);
  });

  it("defaults state to an object so every reader can index it", () => {
    expect(fromV1Device({ id: "a" }).state).toEqual({});
  });
});

describe("event mapping", () => {
  it("renames deviceId and at to the names the analysis reads", () => {
    const e = fromV1Event({
      id: 7,
      deviceId: "camera-1",
      kind: "motion",
      title: "Motion",
      body: "Front door",
      read: false,
      at: "2026-08-14T10:00:00.000Z",
    });
    expect(e.device_id).toBe("camera-1");
    expect(e.ts).toBe("2026-08-14T10:00:00.000Z");
  });

  it("keeps a null device id null rather than dropping the event", () => {
    // Account-level events have no device and are still worth reporting.
    expect(fromV1Event({ id: 1 }).device_id).toBeNull();
  });
});

describe("payload handling", () => {
  it("returns null — not an empty list — for anything unexpected", () => {
    /*
     * The caller must be able to tell "no devices" from "could not tell". An
     * empty finding set resolves every open alert and reports a recovery that
     * did not happen, so this distinction is load-bearing.
     */
    for (const bad of [null, undefined, {}, { devices: "no" }, "text", 42]) {
      expect(fromV1DeviceList(bad)).toBeNull();
    }
    expect(fromV1DeviceList({ devices: [] })).toEqual([]);
  });

  it("skips malformed rows instead of failing the whole sweep", () => {
    const out = fromV1DeviceList({
      devices: [{ id: "good" }, null, { name: "no id" }, 5, { id: "also-good" }],
    });
    expect(out?.map((d) => d.id)).toEqual(["good", "also-good"]);
  });

  it("applies the same rules to events", () => {
    expect(fromV1EventList({ events: "no" })).toBeNull();
    expect(fromV1EventList({ events: [{ id: 1 }, { nope: true }] })?.length).toBe(1);
  });
});
