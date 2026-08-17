/**
 * Which hostname serves which subtree.
 *
 * The exclusions are the whole difficulty of mounting a subtree on a hostname
 * and they fail silently: miss `/api` and every API route resolves under the
 * mount, so the app renders its shell and then does nothing, with no error
 * anywhere.
 */
import {
  DEVELOPER_PAGES,
  HOST_MOUNTS,
  isMountedHost,
  mountAction,
  mountPrefixFor,
  mountedPath,
  servedFromRoot,
} from "@/lib/host-mounts";

describe("the developer portal's hostname", () => {
  it("serves the portal at the root of developer.circuvent.com", () => {
    expect(mountedPath("developer.circuvent.com", "/")).toBe("/developer");
  });

  it("maps a portal route", () => {
    expect(mountedPath("developer.circuvent.com", "/webhooks")).toBe("/developer/webhooks");
    expect(mountedPath("developer.circuvent.com", "/endpoints")).toBe("/developer/endpoints");
  });

  it("ignores the port, which is present in development", () => {
    expect(mountedPath("developer.circuvent.com:3000", "/scopes")).toBe("/developer/scopes");
  });

  /*
   * Anchored at both ends. Without the `$`,
   * `developer.circuvent.com.attacker.net` is a host somebody else can own and
   * would be served our pages on their origin.
   */
  it("is not fooled by a hostname that merely starts with it", () => {
    expect(mountedPath("developer.circuvent.com.attacker.net", "/")).toBeNull();
    expect(mountedPath("notdeveloper.circuvent.com", "/")).toBeNull();
    expect(isMountedHost("developer.circuvent.com.evil.io")).toBe(false);
  });

  it("leaves the main site completely alone", () => {
    expect(mountedPath("circuvent.com", "/developer")).toBeNull();
    expect(mountedPath("circuvent.com", "/")).toBeNull();
  });

  it("does not remap its own prefix into itself", () => {
    // A link written for the main site keeps working on the subdomain rather
    // than becoming /developer/developer/webhooks.
    expect(mountedPath("developer.circuvent.com", "/developer/webhooks")).toBeNull();
    expect(mountedPath("developer.circuvent.com", "/developer")).toBeNull();
  });

  it("leaves the API and assets alone even on the portal hostname", () => {
    for (const p of [
      "/api",
      "/api/devices",
      "/_next/static/chunk.js",
      "/.well-known/security.txt",
      "/openapi.json",
      "/favicon.ico",
    ]) {
      expect(mountedPath("developer.circuvent.com", p)).toBeNull();
    }
  });

  it("reports which prefix a hostname serves", () => {
    expect(mountPrefixFor("developer.circuvent.com")).toBe("/developer");
    expect(mountPrefixFor("home.circuvent.com")).toBe("/smarthome");
    expect(mountPrefixFor("circuvent.com")).toBeNull();
    expect(mountPrefixFor(null)).toBeNull();
  });
});

describe("a path the portal does not serve", () => {
  const MAIN = "https://circuvent.com";

  /*
   * The address from the report. While the corporate nav rendered on the
   * portal, its links pointed at corporate pages, so people reached
   * developer.circuvent.com/domains — which rewrites to /developer/domains and
   * can only 404.
   */
  it("goes to the main site instead of a page that cannot exist", () => {
    expect(mountAction("developer.circuvent.com", "/domains", MAIN)).toEqual({
      kind: "redirect",
      url: "https://circuvent.com/domains",
    });
  });

  it("sends every corporate path there, not just the one that was reported", () => {
    for (const p of ["/shop", "/about", "/contact", "/services", "/blog"]) {
      expect(mountAction("developer.circuvent.com", p, MAIN)).toEqual({
        kind: "redirect",
        url: `https://circuvent.com${p}`,
      });
    }
  });

  it("still rewrites every real portal page", () => {
    expect(mountAction("developer.circuvent.com", "/", MAIN)).toEqual({
      kind: "rewrite",
      path: "/developer",
    });
    for (const slug of DEVELOPER_PAGES) {
      expect(mountAction("developer.circuvent.com", `/${slug}`, MAIN)).toEqual({
        kind: "rewrite",
        path: `/developer/${slug}`,
      });
    }
  });

  it("tolerates a trailing slash rather than bouncing a real page away", () => {
    expect(mountAction("developer.circuvent.com", "/scopes/", MAIN)).toEqual({
      kind: "rewrite",
      path: "/developer/scopes/",
    });
  });

  it("leaves the API and assets alone rather than redirecting them", () => {
    for (const p of ["/api/devices", "/openapi.json", "/_next/static/x.js"]) {
      expect(mountAction("developer.circuvent.com", p, MAIN)).toBeNull();
    }
  });

  /*
   * The console has no page list, because its route set is large and moves.
   * Everything on that hostname is still rewritten, as before.
   */
  it("does not redirect on a mount that has not declared its pages", () => {
    expect(mountAction("home.circuvent.com", "/anything", MAIN)).toEqual({
      kind: "rewrite",
      path: "/smarthome/anything",
    });
  });

  it("does nothing at all on the main site", () => {
    expect(mountAction("circuvent.com", "/domains", MAIN)).toBeNull();
  });
});

describe("the mount table itself", () => {
  it("anchors every hostname pattern at both ends", () => {
    for (const m of HOST_MOUNTS) {
      expect(m.hosts.source.startsWith("^")).toBe(true);
      expect(m.hosts.source.endsWith("$")).toBe(true);
    }
  });

  it("excludes every mount prefix from remapping", () => {
    for (const m of HOST_MOUNTS) {
      expect(servedFromRoot(m.prefix)).toBe(true);
      expect(servedFromRoot(`${m.prefix}/anything`)).toBe(true);
    }
  });

  it("gives each mount a distinct prefix", () => {
    const prefixes = HOST_MOUNTS.map((m) => m.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  /*
   * One hostname resolving to two subtrees would be decided by array order,
   * which is not a decision anybody would have made on purpose.
   */
  it("does not let one hostname match two mounts", () => {
    for (const host of [
      "home.circuvent.com",
      "iot.circuvent.com",
      "developer.circuvent.com",
    ]) {
      expect(HOST_MOUNTS.filter((m) => m.hosts.test(host))).toHaveLength(1);
    }
  });
});
