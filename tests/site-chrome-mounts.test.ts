/**
 * Which pages get the corporate nav and footer.
 *
 * The failure this guards against is visible but nobody's job to notice: the
 * marketing bar rendered above the developer portal on
 * developer.circuvent.com, and its links pointed at corporate pages — so
 * "Domains" led to developer.circuvent.com/domains, which cannot exist under
 * the mount. A bar of broken links, on a documentation site.
 *
 * The gate reads two signals because neither side has both: on the server the
 * path is already rewritten to `/developer…`, while in the browser the URL
 * stays `/` and only the hostname gives it away. If the two disagree the nav
 * appears at hydration, which is how this went unnoticed on the console once
 * already.
 */
import { HOST_MOUNTS, isMountedHost } from "@/lib/host-mounts";

/**
 * The rule SiteChrome applies, in one place so both signals can be checked.
 * Mirrors the component; `tests/site-chrome-parity` is not needed because the
 * component is three lines and this asserts the same predicate.
 */
function isBare(pathname: string | null, hostname: string | null): boolean {
  const isStore = pathname?.startsWith("/shop") ?? false;
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  const isMountedApp =
    HOST_MOUNTS.some((m) => pathname?.startsWith(m.prefix) ?? false) ||
    isMountedHost(hostname);
  return isStore || isMountedApp || isAdmin;
}

describe("the developer portal has no corporate chrome", () => {
  it("is bare on the server, where the path has already been rewritten", () => {
    expect(isBare("/developer", null)).toBe(true);
    expect(isBare("/developer/webhooks", null)).toBe(true);
  });

  it("is bare in the browser, where the path is still the subdomain's own", () => {
    expect(isBare("/", "developer.circuvent.com")).toBe(true);
    expect(isBare("/webhooks", "developer.circuvent.com")).toBe(true);
  });

  /*
   * The two must agree for the same request, or the bar appears the moment
   * React hydrates — which is worse than it never working, because it looks
   * fine in a server-rendered screenshot.
   */
  it("agrees across hydration for every portal page", () => {
    for (const page of ["", "/quickstart", "/scopes", "/endpoints", "/webhooks"]) {
      const onServer = isBare(`/developer${page}`, null);
      const inBrowser = isBare(page || "/", "developer.circuvent.com");
      expect(onServer).toBe(inBrowser);
      expect(onServer).toBe(true);
    }
  });

  /*
   * The URL from the report. Even a path that has no page under the mount must
   * not bring the bar back — that is the request that showed the bug.
   */
  it("stays bare on a path the portal does not serve", () => {
    expect(isBare("/developer/domains", null)).toBe(true);
    expect(isBare("/domains", "developer.circuvent.com")).toBe(true);
  });
});

describe("the rest of the site keeps its chrome", () => {
  it("renders the nav on ordinary marketing pages", () => {
    for (const p of ["/", "/about", "/contact", "/domains", "/services", "/blog"]) {
      expect(isBare(p, "circuvent.com")).toBe(false);
    }
  });

  it("still hides it on the shop, the admin console and the device console", () => {
    expect(isBare("/shop", "circuvent.com")).toBe(true);
    expect(isBare("/admin", "circuvent.com")).toBe(true);
    expect(isBare("/smarthome", "circuvent.com")).toBe(true);
    expect(isBare("/", "home.circuvent.com")).toBe(true);
  });

  /*
   * A lookalike hostname must not be able to strip the chrome — the same
   * anchoring the mount table relies on.
   */
  it("is not fooled by a lookalike hostname", () => {
    expect(isBare("/", "developer.circuvent.com.attacker.net")).toBe(false);
    expect(isBare("/", "notdeveloper.circuvent.com")).toBe(false);
  });
});
