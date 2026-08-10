import { describeFailure, isUnsupported } from "./errors";

/**
 * What an operator reads when a request fails.
 *
 * Written after a live console showed a red banner saying **"Not found"** on
 * the Safety tab. That is the control plane's terminal 404 body reaching the
 * screen unedited: it names nothing, implies the settings are missing, and
 * offers a Retry button that could never work — the control plane was simply
 * running a build older than the feature.
 */

const fail = (status: number, error?: string) => ({
  ok: false,
  status,
  data: error === undefined ? {} : { error },
});

describe("a control plane older than the console", () => {
  it("is recognised from the terminal 404 body", () => {
    expect(isUnsupported(fail(404, "Not found"))).toBe(true);
    // Case and spacing vary between Express versions and proxies.
    expect(isUnsupported(fail(404, "not found"))).toBe(true);
    // A 404 with no body at all is the same situation.
    expect(isUnsupported(fail(404))).toBe(true);
  });

  it("explains the situation and gives the command", () => {
    const msg = describeFailure(fail(404, "Not found"), "drone settings");
    expect(msg).toMatch(/does not have the drone API yet/i);
    expect(msg).toMatch(/docker compose up -d --build/);
    // The old behaviour, which said nothing useful.
    expect(msg).not.toBe("Not found");
  });
});

describe("a 404 from a handler that actually ran", () => {
  /*
   * The distinction this file exists to protect. "No such aircraft" is a real
   * answer from a route that executed; treating it as "your server is out of
   * date" would send somebody to redeploy a control plane that is working
   * perfectly.
   */
  it("is not mistaken for a missing API", () => {
    expect(isUnsupported(fail(404, "No such aircraft"))).toBe(false);
    expect(isUnsupported(fail(404, "No such flight"))).toBe(false);
  });

  it("shows the server's own message", () => {
    expect(describeFailure(fail(404, "No such aircraft"), "aircraft")).toBe("No such aircraft");
  });
});

describe("other failures", () => {
  it("distinguishes an unreachable control plane from a rejected request", () => {
    // status 0 is what `req()` returns when fetch itself threw.
    const msg = describeFailure({ ok: false, status: 0, data: { error: "Network error" } }, "aircraft");
    expect(msg).toMatch(/cannot reach the control plane/i);
    expect(isUnsupported({ ok: false, status: 0, data: {} })).toBe(false);
  });

  it("says so plainly when the session is the problem", () => {
    expect(describeFailure(fail(401), "aircraft")).toMatch(/not signed in/i);
    expect(describeFailure(fail(403), "aircraft")).toMatch(/not signed in|cannot see/i);
  });

  it("passes a refusal through, because the reason is the point", () => {
    // A 409 from the safety gate is written for a person to read: "too few
    // satellites", not "not_ready". Replacing it with a generic message would
    // discard the only useful part.
    expect(describeFailure(fail(409, "Battery 12% is below the 25% floor"), "that command")).toBe(
      "Battery 12% is below the 25% floor"
    );
  });

  it("suggests a restart rather than a bug when the gateway is down", () => {
    expect(describeFailure(fail(502), "aircraft")).toMatch(/not responding/i);
    expect(describeFailure(fail(503), "aircraft")).toMatch(/not responding/i);
  });

  it("falls back to naming what failed when the server says nothing", () => {
    expect(describeFailure(fail(500), "the flight log")).toBe("Could not load the flight log.");
  });

  it("ignores a blank error string rather than showing an empty banner", () => {
    expect(describeFailure(fail(500, "   "), "aircraft")).toBe("Could not load aircraft.");
  });
});
