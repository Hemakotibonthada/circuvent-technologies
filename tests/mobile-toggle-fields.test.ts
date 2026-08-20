/*
 * theme.ts reaches for StatusBar, and jest cannot parse React Native's own
 * source. Mocked here rather than mapped in jest.config.js: this is the only
 * test that needs it, and a global mapping would quietly swap React Native out
 * from under any future test that genuinely wants to render a component.
 */
jest.mock("react-native", () => ({ StatusBar: { setBarStyle: () => {} } }), { virtual: true });

import { DEVICE_META } from "../mobile/src/theme";

/**
 * The switch field a device type actually responds to.
 *
 * DEVICE_META.toggle is the authority — it is what Siri and the voice layer
 * read. capabilities() used to guess `power` for any type without an explicit
 * case, which was wrong for four shipped products: a touchboard parses
 * g1/g2/g3, a watertank parses `pump`, a facedoor unlocks, and a gate has no
 * switch at all. Every one of those dropped `{power:true}` in silence, so the
 * switch in Rooms, Scenes, Home and the device list moved back under the finger
 * and the hardware never changed.
 *
 * These expectations are transcribed from the firmware sketches, not from the
 * app, so the test disagrees with the app when the app is wrong.
 */
const FIRMWARE_TOGGLE: Record<string, string | null> = {
  // firmware/rccar: driving happens on the ESP-NOW link, not on a tile. The
  // car has no primary on/off — "mode" is what a screen changes, and
  // immobilised is one of its values rather than the off state of a switch.
  rccar: null,
  // firmware/witness: it measures and reports. It has no output at all — that
  // is the entire argument for trusting it.
  witness: null,
  // firmware/touchboard: p["g1"] / p["g2"] / p["g3"] / p["all"]
  touchboard: "g1",
  // firmware/touchboard-8: p["g1"]..p["g8"] / p["all"] — same field shape,
  // eight of them. `g1` for the card switch, matching the 3-gang board; the
  // whole-board control is `all`, which capabilities() does not model.
  "touchboard-8": "g1",
  /*
   * firmware/switchboard: the same p["g1"]..p["g8"] / p["all"] shape, but the
   * number that exist is commissioned rather than compiled. `g1` for the card
   * switch, because a board always has at least one channel — the device
   * screen reads the real count off `state.gangs` instead of assuming.
   */
  switchboard: "g1",
  // firmware/watertank: p["pump"], p["auto"]
  watertank: "pump",
  // firmware/smart-lock: p["locked"], plus lock/unlock actions
  "smart-lock": "locked",
  // firmware/facedoor: action "unlock"
  facedoor: "locked",
  // firmware/aquaguard and agri-starter: p["pump"]
  aquaguard: "pump",
  "agri-starter": "pump",
  // firmware/sentinel: relays r1..rN
  sentinel: "r1",
  "smart-plug": "power",
  "smart-switch": "power",
  "smart-light": "power",
  "smart-fan": "power",
  /*
   * No single toggle, deliberately.
   *
   * firmware/home-hub does read `power`, but it writes relay 0 and nothing
   * else — so a card switch labelled for the whole device would turn on a
   * quarter of it and report success. capabilities() offers it explicitly as
   * "Channel 1", which is what it actually is; bulk control goes through
   * `relays`.
   */
  "home-hub": null,
  // firmware/rfid-gate: action open/close — a gate is opened, not switched on.
  "rfid-gate": null,
  /*
   * firmware/rfid-attend: no tile toggle.
   *
   * Its booleans are `buzzer` and `offlineFailOpen`, and the second decides
   * whether a network outage opens the building. Neither belongs one
   * accidental tap from the lamps on a dashboard; the door itself is released
   * with an explicit action.
   */
  "rfid-attend": null,
  /*
   * firmware/rfid-only: nothing to toggle, and nothing that could be added.
   * This model holds no roster, drives no door and takes no settings — it
   * reads a card and reports it. A tile switch would have to invent something
   * for the device to do.
   */
  "rfid-only": null,
  // Read-only or non-switchable.
  "energy-monitor": null,
  guardian: null,
  "motion-sensor": null,
  camera: null,
  cctv: null,
  doorbell: null,
  "anpr-cam": null,
  "drone-link": null,
  "drone-x1": null,
  curtain: null, // a position, not a switch
  // Every value a meter publishes is the output of a measurement. A toggle
  // would be the app claiming it can set one, the firmware would ignore it,
  // and the result is a control that looks like it works and does nothing.
  meter: null,
};

describe("device toggle fields match the firmware", () => {
  it.each(Object.entries(FIRMWARE_TOGGLE))("%s", (type, expected) => {
    const meta = DEVICE_META[type];
    expect(meta).toBeDefined();
    expect(meta.toggle?.field ?? null).toBe(expected);
  });

  it("covers every type the app knows about", () => {
    // A new device type must be considered here rather than silently
    // inheriting a guess.
    const unchecked = Object.keys(DEVICE_META).filter((t) => !(t in FIRMWARE_TOGGLE));
    expect(unchecked).toEqual([]);
  });

  it("never points a toggle at a field named after the device type", () => {
    // Cheap guard against a copy-paste that would look plausible in review.
    for (const [type, meta] of Object.entries(DEVICE_META)) {
      if (meta.toggle) expect(meta.toggle.field).not.toBe(type);
    }
  });
});
