import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeDeviceLists } from "@/lib/shop-fleet";
import type { DeviceView } from "@/lib/store";

/*
 * The storefront showed a customer "No devices linked yet" while two of their
 * devices were online.
 *
 * There are two device registries and both are real: the shop's own table,
 * which holds units claimed here with the printed ID and key, and the control
 * plane, which holds everything commissioned through the app. "My devices"
 * only ever read the first, so hardware bought here, set up here and running
 * here was invisible on the page that sells it.
 *
 * These pin the join.
 */

const d = (id: string, over: Partial<DeviceView> = {}): DeviceView => ({
  id,
  type: "smart-plug",
  name: id,
  online: false,
  state: {},
  ...over,
});

describe("merging the two device registries", () => {
  it("shows control-plane devices the shop's own table has never heard of", () => {
    const merged = mergeDeviceLists([d("home-hub-978dde59"), d("camera-e8fc-648a")], []);
    expect(merged.map((x) => x.id)).toEqual(["home-hub-978dde59", "camera-e8fc-648a"]);
  });

  it("still shows devices claimed here with the printed ID and key", () => {
    const merged = mergeDeviceLists([], [d("shop-only-1")]);
    expect(merged.map((x) => x.id)).toEqual(["shop-only-1"]);
  });

  it("lists a device once when both registries hold it", () => {
    const merged = mergeDeviceLists([d("dup")], [d("dup")]);
    expect(merged).toHaveLength(1);
  });

  it("prefers the control plane's copy of a shared device", () => {
    // The shop's row only advances when the device POSTs to /sync; the control
    // plane is holding a live MQTT connection. Showing the stale copy would
    // report an online device as offline.
    const merged = mergeDeviceLists(
      [d("dup", { online: true, name: "Switch Board" })],
      [d("dup", { online: false, name: "stale" })],
    );
    expect(merged[0].online).toBe(true);
    expect(merged[0].name).toBe("Switch Board");
  });

  it("falls back to the shop's table when the control plane cannot be asked", () => {
    /*
     * null means "we could not ask", which is not the same as "this customer
     * owns nothing". If an unreachable control plane returned [] instead, a
     * brief outage would blank out devices the shop's own table still knows
     * about — the page would claim the customer owns nothing.
     */
    const merged = mergeDeviceLists(null, [d("shop-only-1")]);
    expect(merged.map((x) => x.id)).toEqual(["shop-only-1"]);
  });

  it("reports an empty fleet as empty rather than as an outage", () => {
    expect(mergeDeviceLists([], [])).toEqual([]);
  });
});

describe("the route asks both registries", () => {
  const ROUTE = readFileSync(
    join(__dirname, "..", "src", "app", "api", "devices", "route.ts"),
    "utf8",
  );
  const COMMAND = readFileSync(
    join(__dirname, "..", "src", "app", "api", "devices", "command", "route.ts"),
    "utf8",
  );

  it("GET /api/devices reads the control plane, not only the local table", () => {
    expect(ROUTE).toContain("listFleetDevices");
    expect(ROUTE).toContain("listDevicesByOwner");
    expect(ROUTE).toContain("mergeDeviceLists");
  });

  it("commands fall through to the control plane", () => {
    // Without this every button on a control-plane device would fail while the
    // card sat there showing it online.
    expect(COMMAND).toContain("sendFleetCommand");
  });

  it("still tries the local table first, so shop-claimed devices are unaffected", () => {
    expect(COMMAND.indexOf("enqueueCommand")).toBeLessThan(COMMAND.indexOf("sendFleetCommand"));
  });
});

describe("the federation secret stays on the server", () => {
  const FLEET = readFileSync(join(__dirname, "..", "src", "lib", "shop-fleet.ts"), "utf8");

  it("is never referenced from a client component", () => {
    const page = readFileSync(
      join(__dirname, "..", "src", "app", "shop", "devices", "page.tsx"),
      "utf8",
    );
    expect(page).toContain('"use client"');
    expect(page).not.toContain("shop-fleet");
    expect(page).not.toContain("FEDERATION_SECRET");
  });

  it("re-mints once on a rejected session instead of showing an empty list", () => {
    // A cached token that expires must not look identical to owning no devices.
    expect(FLEET).toContain("res.status === 401");
    expect(FLEET).toContain("sessions.delete(email)");
  });
});
