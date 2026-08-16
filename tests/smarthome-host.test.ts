/**
 * The smart home console, mounted at the root of its own hostname.
 *
 * The mapping itself is one line. The exclusions are the whole job, and they
 * fail in a way nothing surfaces: a catch-all that also catches /api sends
 * /api/devices to /smarthome/api/devices, so all 143 API routes 404 while the
 * page still renders its shell. The app looks like it loaded and then does
 * nothing at all — no error, no blank screen, just a console with no devices
 * in it.
 *
 * A first attempt expressed this as a negative lookahead inside a Next
 * `rewrites()` source. It built, deployed and matched none of the three
 * exclusions; only requesting /api/health, /favicon.ico and /robots.txt found
 * it. Hence this, in plain JavaScript, with a test.
 */
import { HOME_HOSTS, isConsoleHost, servedFromRoot, smartHomePath } from "@/lib/smarthome-host";

/*
 * The console appeared on its own subdomain with the corporate navigation bar
 * sitting on top of it — Home / Projects / Domains / Shop / Services stacked
 * over the device console's own header.
 *
 * The server had got it right and rendered no navigation. The client changed
 * its mind at hydration: the chrome gate asked `usePathname()`, which is the
 * rewritten `/smarthome` on the server but the browser's `/` in the page, so
 * the gate flipped to false and put the bar back. Server HTML alone looked
 * correct, which is why this needed to be seen in a browser to be found.
 */
describe("isConsoleHost", () => {
  it.each(["home.circuvent.com", "iot.circuvent.com", "IOT.Circuvent.com"])(
    "%s is the console's own hostname",
    (host) => expect(isConsoleHost(host)).toBe(true)
  );

  it("ignores a port, so it still holds on a dev server", () => {
    expect(isConsoleHost("home.circuvent.com:3000")).toBe(true);
  });

  it.each(["circuvent.com", "www.circuvent.com", "home.circuvent.com.attacker.net"])(
    "%s is not",
    (host) => expect(isConsoleHost(host)).toBe(false)
  );

  it("is false during server rendering, where there is no window", () => {
    // The server does not need it: its `usePathname()` is already /smarthome.
    // Returning false here rather than guessing is what keeps the two sides
    // agreeing instead of fighting over the nav bar.
    expect(isConsoleHost(null)).toBe(false);
    expect(isConsoleHost(undefined)).toBe(false);
    expect(isConsoleHost("")).toBe(false);
  });
});

describe("which hostnames serve the smart home console", () => {
  it.each(["home.circuvent.com", "iot.circuvent.com", "HOME.circuvent.com"])(
    "%s serves the console",
    (host) => expect(HOME_HOSTS.test(host)).toBe(true)
  );

  it.each([
    "circuvent.com",
    "www.circuvent.com",
    "career.circuvent.com",
    "ats.circuvent.com",
  ])("%s does not", (host) => expect(HOME_HOSTS.test(host)).toBe(false));

  /*
   * A lookalike must not match. `home.circuvent.com.attacker.net` is a host an
   * attacker can own, and anchoring is the only thing stopping it being served
   * the console — which would put our markup on their origin.
   */
  it.each([
    "home.circuvent.com.attacker.net",
    "nothome.circuvent.com",
    "home.circuvent.com.evil.co",
  ])("%s is not mistaken for one", (host) => expect(HOME_HOSTS.test(host)).toBe(false));
});

describe("paths that must not be remapped onto /smarthome", () => {
  it.each([
    "/api/devices",
    "/api/smarthome/alerts/cron",
    "/_next/static/chunks/main.js",
    "/.well-known/workflow/v1/flow",
  ])("%s is served from the root", (p) => expect(servedFromRoot(p)).toBe(true));

  it.each(["/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/og.png"])(
    "%s is a file and is served from the root",
    (p) => expect(servedFromRoot(p)).toBe(true)
  );

  /*
   * Already-correct links keep working. Twelve files link to /smarthome/... and
   * remapping those would produce /smarthome/smarthome/rooms — so the prefix is
   * left alone and no link has to change on the day the subdomain goes live.
   */
  it.each(["/smarthome", "/smarthome/rooms", "/smarthome/scenes"])(
    "%s is already correct and is left alone",
    (p) => expect(servedFromRoot(p)).toBe(true)
  );

  it.each(["/", "/rooms", "/scenes", "/security", "/devices/abc-123"])(
    "%s is a console route and is remapped",
    (p) => expect(servedFromRoot(p)).toBe(false)
  );

  /* "/apidocs" starts with "/api" as a string but is not the API. */
  it("does not mistake a path merely beginning with 'api' for the API", () => {
    expect(servedFromRoot("/apidocs")).toBe(false);
  });
});

describe("the mapped path", () => {
  it("maps the root of the hostname onto the console", () => {
    expect(smartHomePath("home.circuvent.com", "/")).toBe("/smarthome");
  });

  it("maps a console route", () => {
    expect(smartHomePath("iot.circuvent.com", "/rooms")).toBe("/smarthome/rooms");
    expect(smartHomePath("home.circuvent.com", "/devices/abc")).toBe("/smarthome/devices/abc");
  });

  it("ignores the port, which is present in development", () => {
    expect(smartHomePath("home.circuvent.com:3000", "/rooms")).toBe("/smarthome/rooms");
  });

  it("leaves the main site completely alone", () => {
    expect(smartHomePath("circuvent.com", "/rooms")).toBeNull();
    expect(smartHomePath("circuvent.com", "/")).toBeNull();
    expect(smartHomePath("circuvent.com", "/smarthome")).toBeNull();
  });

  it("leaves the API alone even on the console hostname", () => {
    expect(smartHomePath("home.circuvent.com", "/api/devices")).toBeNull();
  });
});