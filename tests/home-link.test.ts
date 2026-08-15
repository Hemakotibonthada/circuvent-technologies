/**
 * The home network, the Wi-Fi push, and the two copies of each that must agree.
 *
 * These three features share one property that makes them worth guarding
 * carefully: every failure mode is silent.
 *
 *   - A board that never joined a home still reports a healthy device, healthy
 *     Wi-Fi and working relays. Only a pad in another room stops working.
 *   - A Wi-Fi change that failed looks exactly like one still in progress,
 *     because a device changing network is supposed to go quiet.
 *   - A binding pointing at a board that is gone is a switch that does nothing,
 *     with no error anywhere.
 *
 * None of it throws. All of it has to be asserted.
 */
import fs from "node:fs";
import path from "node:path";

import {
  readHomeLink, homeLinkNotice, canReachPeers, readBindings, bindingTarget,
} from "@/app/smarthome/home-link";
import { readWifiStatus, wifiNotice, reprovisionRoute } from "@/app/smarthome/wifi-status";
import { projectCommand } from "@/lib/smarthome-command-map";

const root = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), "utf8");

describe("the local home bus reports what it can actually reach", () => {
  it("says so when a board was never given a home key", () => {
    const h = readHomeLink({ homeLink: "unprovisioned" });
    expect(h.phase).toBe("unprovisioned");
    expect(canReachPeers(h)).toBe(false);
    expect(homeLinkNotice(h)).toMatch(/not part of a home network/i);
  });

  it("does not call a board with no peers 'working' and leave it there", () => {
    /*
     * The case this whole module exists for. The bus is up, the radio is fine,
     * and the board cannot reach a single other one — so every cross-room pad
     * on it is dead. Reporting only "up" would be true and useless.
     */
    const h = readHomeLink({ homeLink: "up", homePeers: 0 });
    expect(h.phase).toBe("up");
    expect(canReachPeers(h)).toBe(false);
    expect(homeLinkNotice(h)).toMatch(/cannot hear any other board/i);
  });

  it("is quiet when the bus is genuinely working", () => {
    const h = readHomeLink({ homeLink: "up", homePeers: 3 });
    expect(canReachPeers(h)).toBe(true);
    expect(homeLinkNotice(h)).toBeNull();
  });

  it("treats an unknown status as unknown rather than as working", () => {
    // Devices in the field run older builds. Guessing "up" for a board that
    // never said so would claim a bus that does not exist.
    expect(readHomeLink({ homeLink: "banana" }).phase).toBe("unknown");
    expect(readHomeLink({}).phase).toBe("unknown");
    expect(canReachPeers(readHomeLink({ homeLink: "banana", homePeers: 5 }))).toBe(false);
  });
});

describe("pad bindings", () => {
  it("reads what the firmware stores", () => {
    const b = readBindings({ bind1: "abc123:g2", bind3: "def456:power" }, 4);
    expect(b[0]).toEqual({ gang: 1, peerId: "abc123", field: "g2" });
    expect(b[1]).toEqual({ gang: 2, peerId: "", field: "" });
    expect(b[2]).toEqual({ gang: 3, peerId: "def456", field: "power" });
  });

  it("treats a half-written binding as unbound", () => {
    /*
     * The firmware would not act on these either. Showing them as live would
     * be the panel claiming a pad drives something when the board ignores it.
     */
    for (const bad of [":g2", "abc123:", "abc123", ""]) {
      expect(readBindings({ bind1: bad }, 1)[0]).toEqual({ gang: 1, peerId: "", field: "" });
    }
  });

  it("round-trips through the wire form the sketch parses", () => {
    const t = bindingTarget("abc123", "g2");
    expect(t).toBe("abc123:g2");
    expect(readBindings({ bind1: t }, 1)[0]).toEqual({ gang: 1, peerId: "abc123", field: "g2" });
  });

  it("clears the binding when either half is missing", () => {
    expect(bindingTarget("", "g2")).toBe("");
    expect(bindingTarget("abc123", "")).toBe("");
  });

  it("projects a bind command to the field the sketch republishes", () => {
    expect(projectCommand("touchboard-8", { action: "bind", gang: 3, target: "abc:g2" }))
      .toEqual({ bind3: "abc:g2" });
    expect(projectCommand("touchboard-8", { action: "bind", gang: 3, target: "" }))
      .toEqual({ bind3: "" });
  });

  it("does not project a relay change for a bind", () => {
    /*
     * Binding a pad changes what it will do next time, not the state of
     * anything now. Asserting a relay would pin a control waiting for a change
     * the firmware was never going to make.
     */
    const patch = projectCommand("touchboard-8", { action: "bind", gang: 3, target: "abc:g2" });
    expect(Object.keys(patch)).toEqual(["bind3"]);
  });

  it("refuses a gang the board does not have", () => {
    expect(projectCommand("touchboard-8", { action: "bind", gang: 9, target: "abc:g2" })).toEqual({});
    expect(projectCommand("touchboard-8", { action: "bind", gang: 0, target: "abc:g2" })).toEqual({});
  });
});

describe("changing a device's Wi-Fi", () => {
  it("reads the firmware's own account of the switch", () => {
    expect(readWifiStatus("switching to Home_5G")).toEqual({ phase: "switching", ssid: "Home_5G", detail: "" });
    expect(readWifiStatus("ok")).toMatchObject({ phase: "ok" });
    expect(readWifiStatus("unchanged")).toMatchObject({ phase: "unchanged" });
    expect(readWifiStatus("failed: could not join Home_5G")).toMatchObject({
      phase: "failed",
      detail: "could not join Home_5G",
    });
  });

  it("explains the silence instead of leaving it to look like a crash", () => {
    /*
     * A device changing network stops answering by design. That gap was the
     * whole problem: with nothing reading wifiStatus, a successful switch, a
     * wrong password and a dead board were the same spinner.
     */
    const w = readWifiStatus("switching to Home_5G");
    expect(wifiNotice(w, true)).toMatch(/drops off this network/i);
    expect(wifiNotice(w, false)).toMatch(/expected gap|nothing is wrong/i);
  });

  it("says the device is still reachable after a failed change", () => {
    // _applyWifi restores the old credentials, which is why offering this
    // remotely is safe at all. The message has to carry that.
    const w = readWifiStatus("failed: could not join Home_5G");
    expect(wifiNotice(w, true)).toMatch(/previous Wi-Fi back|still reachable/i);
  });

  it("only sends someone to the device when it cannot be reached", () => {
    /*
     * The reported bug. The app asked for the button-and-hotspot route
     * unconditionally, so re-provisioning a board that was online and three
     * metres away still meant finding it and holding a button.
     */
    expect(reprovisionRoute(true)).toBe("push");
    expect(reprovisionRoute(false)).toBe("manual");
  });

  it("is quiet when there is nothing happening", () => {
    expect(wifiNotice(readWifiStatus(undefined), true)).toBeNull();
    expect(wifiNotice(readWifiStatus(""), true)).toBeNull();
  });
});

describe("the app and the console tell the same story", () => {
  /*
   * These modules are duplicated because the two projects cannot import each
   * other. Duplication is fine; drift is the bug — and drift here means one
   * surface explains a failure the other renders as silence.
   */
  const pairs: [string, string[], string[]][] = [
    ["home-link", ["src", "app", "smarthome", "home-link.ts"], ["mobile", "src", "home-link.ts"]],
    ["wifi-status", ["src", "app", "smarthome", "wifi-status.ts"], ["mobile", "src", "wifi-status.ts"]],
  ];

  it.each(pairs)("%s exports the same API on both", (_name, webPath, mobilePath) => {
    const exportsOf = (src: string) =>
      [...src.matchAll(/export (?:function|const|type|interface)\s+(\w+)/g)].map((m) => m[1]).sort();
    const web = exportsOf(read(...webPath));
    const mob = exportsOf(read(...mobilePath));
    expect(web.length).toBeGreaterThan(3);
    expect(mob).toEqual(web);
  });

  it.each(pairs)("%s produces the same sentences on both", (_name, webPath, mobilePath) => {
    // The wording is the product here. A message improved on one platform and
    // not the other is how two surfaces end up disagreeing about one device.
    const quoted = (src: string) =>
      [...src.matchAll(/"([A-Z][^"]{25,})"/g)].map((m) => m[1]).sort();
    expect(quoted(read(...mobilePath))).toEqual(quoted(read(...webPath)));
  });
});

describe("the firmware and the surfaces agree on the wire format", () => {
  const link = read("firmware", "CircuventDevice", "CvHomeLink.h");
  const sketch = read("firmware", "touchboard-8", "touchboard-8.ino");

  it("uses the same 'id:field' binding shape everywhere", () => {
    expect(link).toMatch(/cvHomeSplitTarget/);
    expect(sketch).toMatch(/cvHomeSplitTarget\(bindTarget\[i\]/);
    expect(bindingTarget("abc", "g2")).toBe("abc:g2");
  });

  it("publishes the link state the panels read", () => {
    expect(sketch).toMatch(/cv\.set\("homeLink"/);
    expect(sketch).toMatch(/cv\.set\("homePeers"/);
    expect(sketch).toMatch(/cv\.set\(bk, bindTarget\[i\]\)|publishBindings/);
  });

  it("refuses to run an unauthenticated bus", () => {
    /*
     * "No key" must mean no local bus, never an open one. An ESP-NOW frame is
     * broadcast into a building containing other people's flats, and an
     * unauthenticated "switch everything on" is an unattended heater.
     */
    expect(sketch).toMatch(/no home key provisioned — local bus disabled/);
    expect(link).toMatch(/cvHomeVerify/);
    expect(link).toMatch(/_state\.rejected\+\+/);
  });

  it("rejects a replayed frame, including an exact repeat", () => {
    expect(link).toMatch(/p\.seq <= known->lastSeq/);
  });

  it("parks on a fixed channel when the router goes, so the flat stays linked", () => {
    /*
     * The failure this prevents is the cruellest one available: the boards
     * scatter across channels exactly when the internet dies, so the local bus
     * disintegrates during the outage it was built for.
     */
    expect(link).toMatch(/CV_HOME_PARK_CHANNEL\s+1/);
    expect(link).toMatch(/cvHomeShouldPark/);
    expect(sketch).toMatch(/home\.loop\(cv\.online\(\)\)/);
  });
});
