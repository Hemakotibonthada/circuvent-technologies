/**
 * Which hostname serves which subtree.
 *
 * The exclusions are the whole difficulty of mounting a subtree on a hostname
 * and they fail silently: miss `/api` and every API route resolves under the
 * mount, so the app renders its shell and then does nothing, with no error
 * anywhere.
 */
import {
  HOST_MOUNTS,
  isMountedHost,
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
