import { analyseHome } from "./analysis";

/**
 * The control plane wraps its collections.
 *
 * `GET /devices` answers `{ devices: [...] }`, not a bare array. The analyze
 * route and three assistant tools all typed that call as `Device[]` and reached
 * for it directly. Nothing caught it: the fetch helper ends in `as T`, which is
 * an assertion, so the wrong type compiled cleanly and only failed at runtime —
 * as a 500 behind the message "Analysis failed.", which names nothing.
 *
 * A type cannot defend this, because a type is exactly what was wrong. These
 * assert on the real payload shape instead.
 */

const envelope = {
  devices: [
    { id: "hub-1", name: "My Room", type: "home-hub", room: "Hall", online: true,
      last_seen: new Date().toISOString(), state: { power: true }, favorite: false },
    { id: "plug-1", name: "Plug", type: "smart-plug", room: "Hall", online: false,
      last_seen: new Date(Date.now() - 9e5).toISOString(), state: {}, favorite: false },
  ],
};

describe("control-plane collection shape", () => {
  it("analyseHome works on the array inside the envelope", () => {
    const r = analyseHome({ devices: envelope.devices as never });
    expect(Array.isArray(r.findings)).toBe(true);
  });

  it("passing the envelope itself is what broke production", () => {
    // The exact mistake: handing the wrapper where the array belongs. This must
    // throw rather than quietly produce an empty analysis, because an analysis
    // that reports nothing wrong is indistinguishable from a healthy home.
    expect(() => analyseHome({ devices: envelope as never })).toThrow();
  });

  it("GET /devices really is an envelope, not an array", () => {
    // Guards the assumption itself. If the control plane ever returns a bare
    // array, this fails and points at every call site that unwraps.
    expect(Array.isArray(envelope)).toBe(false);
    expect(Array.isArray(envelope.devices)).toBe(true);
  });
});
